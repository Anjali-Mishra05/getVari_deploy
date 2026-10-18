/**
 * The daily hydration goal, derived from the onboarding answers.
 *
 * This lived inline in the onboarding screen until the profile became
 * editable. Two copies of it would have drifted immediately: a user who
 * corrects their weight or adds a diagnosis expects the goal to move by the
 * same rules that produced it in the first place, so both callers compute it
 * here.
 *
 * ## One formula, and it is the spec's
 *
 * What that shared calculation *was* is the more important half. This file
 * used to carry a formula of its own — `weight × 35`, plus an activity bonus,
 * a per-condition adjustment and a city climate allowance, rounded to 50 and
 * clamped to 1.5–4.5 L — while the PBWR v2 one-pager described a
 * different five-stage pipeline that only the dashboard ran. The stored
 * `targetDailyMl` came from here, so reminders, the chatbot's progress, the
 * admin console and the web app all paced users by the formula that was not
 * the spec, and the dashboard tile disagreed with them by hundreds of
 * millilitres.
 *
 * There is now one pipeline, in `utils/pbwr.ts`, and this module is the
 * synchronous entry point to it: the same five stages with no telemetry to
 * feed the observed bands, which is precisely the §3 calibration-window
 * behaviour. The dashboard calls `PBWRService` instead and gets the same
 * number refined by seven days of sensor history.
 *
 * The admin config still drives it, but through the spec's knobs —
 * `pbwrAdjustmentMl`, `pbwrUpperLimitMl`, `requiresPhysicianLimit` — rather
 * than the retired `targetFormula`/`targetBonusMl`/`targetAdjustmentMl` ones.
 */

import AppConfigStore from '../config/appConfigStore';
import type { UserProfile } from '../types';
import type { ClimateBandConfig } from '../config/appConfigSchema';
import { computePBWRBreakdown, isWithinCalibrationWindow } from './pbwr';

export interface TargetInputs {
  weightKg: number;
  /** The account's start, for §3: inside days 1–7 the target is PBWR only. */
  accountCreatedAt?: string | null;
  /** Stage 1 scales the baseline by both, so neither is optional in practice. */
  gender?: string;
  age?: number;
  /** Stage 3's self-declared work-environment band. */
  workEnvironment?: string;
  /** Not an activity band — §3 reads that from steps — but a §6 ceiling category. */
  activityLevel?: string;
  medicalConditions?: string[];
  /**
   * The resolved city.
   *
   * Kept on the inputs because callers pass whole form state, but it no
   * longer moves the goal: §4 takes temperature and humidity from what the
   * device actually observed, not from which city the user picked. The band
   * still drives the risk engine — see `climateBandFor`.
   */
  selectedCity?: string;
  /**
   * The daily ceiling the user's doctor set, in ml.
   *
   * §5 step 2: it becomes the user's **Upper Limit**, and the health
   * adjustment drops to zero. It is a cap on the formula, not a replacement
   * for it. See `computeTargetDailyMl`.
   */
  physicianLimitMl?: number | null;
}

/** Where a profile stands on the doctor's-number requirement. */
export type PhysicianLimitState =
  | 'not-required' // no fluid-restricted condition on the profile
  | 'set' // restricted, and the doctor's daily limit is on file
  | 'missing'; // restricted, and it is not — optional, so the formula's ceiling applies

/**
 * The range a typed physician limit has to fall inside to be believable.
 *
 * These exist to catch a slipped digit ("20000" for 2000), not to second-guess
 * a clinician: a real restriction is usually 800–2000 ml, so the bounds are
 * set well outside anything a doctor would actually prescribe. A value inside
 * them is taken at face value, whatever the formula would have said.
 */
export const MIN_PHYSICIAN_LIMIT_ML = 300;
export const MAX_PHYSICIAN_LIMIT_ML = 5000;

/**
 * Whether this profile needs a doctor's number, and whether it has one.
 *
 * Which diagnoses need one is a property of the condition in the admin config
 * (`requiresPhysicianLimit`), never a list of ids repeated at the call site.
 */
export const physicianLimitStateFor = (
  medicalConditions?: string[] | null,
  physicianLimitMl?: number | null
): PhysicianLimitState => {
  if (!AppConfigStore.requiresPhysicianLimit(medicalConditions)) return 'not-required';
  const limit = Number(physicianLimitMl);
  return Number.isFinite(limit) && limit > 0 ? 'set' : 'missing';
};

/**
 * Validates a physician limit as typed. Returns the message to show, or null.
 *
 * Shared by onboarding and the profile editor so the rule cannot hold in one
 * and not the other — which is exactly what had happened: onboarding blocked
 * on a missing limit and the editor called it "Mandatory" while saving
 * without it.
 */
export const validatePhysicianLimitMl = (raw: string): string | null => {
  const trimmed = raw.trim();
  // Optional: leaving it blank uses the healthy ceiling instead.
  if (!trimmed) return null;

  const value = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value) || value <= 0) return 'Enter the daily limit in millilitres.';
  if (value < MIN_PHYSICIAN_LIMIT_ML || value > MAX_PHYSICIAN_LIMIT_ML) {
    return `That should be between ${MIN_PHYSICIAN_LIMIT_ML} and ${MAX_PHYSICIAN_LIMIT_ML} ml — check the number.`;
  }
  return null;
};

/** The climate band a city falls in, or the catch-all band. */
export const climateBandFor = (selectedCity?: string): ClimateBandConfig => {
  const bands = AppConfigStore.current().climateBands;
  if (selectedCity) {
    const match = bands.find(band => band.cities.some(city => selectedCity.includes(city)));
    if (match) return match;
  }
  // The catch-all is the last band with no cities named; fall back to the last
  // entry so a misconfigured list can still resolve to something.
  return bands.find(band => band.cities.length === 0) ?? bands[bands.length - 1];
};

/**
 * Extra hydration allocation implied by the city's climate baseline.
 *
 * No longer part of the daily goal — §4 bands temperature and humidity from
 * what the device observed, not from a city lookup. Kept because the admin
 * panel still publishes the figure and the value is meaningful on its own.
 */
export const climateModifierFor = (selectedCity?: string): number =>
  climateBandFor(selectedCity)?.targetAdjustmentMl ?? 0;

/**
 * The goal in ml, or `null` when the app must not state one.
 *
 * This is the spec's pipeline run without telemetry — Stage 1's baseline plus
 * the two self-declared Stage 3 bands, capped by Stage 4's ceiling and
 * floored by Stage 5. It is what §3 prescribes for days 1–7, and it is the
 * right answer for every caller that has a profile but no sensor history:
 * onboarding, the profile editor's projection, and the copy `ProfileService`
 * stores for reminders and the chatbot to read.
 *
 * ## A doctor's number is a ceiling, not the goal
 *
 * §5 step 2: an entered physician limit "becomes the user's Upper Limit
 * directly", and the health adjustment drops to +0. The formula still runs
 * underneath it, which matters in both directions:
 *
 *  - It can only ever *lower* the target. `MIN(adjustedTotal, limit)` never
 *    exceeds the limit, and the 1,500 ml floor yields to it rather than
 *    overriding it — a nephrologist who says 900 means 900.
 *  - It stops the limit being read as a *prescription*. Returning the number
 *    verbatim, as this did, paced a 45 kg patient on a 3,000 ml restriction
 *    to the full 3,000 — the maximum they are permitted, presented as the
 *    amount they should drink. Their baseline is under 2 L.
 *
 * ## And when there is no number, the healthy ceiling applies
 *
 * The limit is optional. With none on file, §5 step 3 falls back to the
 * healthy ceiling, so a fluid-restricted profile still gets a goal and the
 * breakdown card suggests adding the doctor's number.
 */
export const computeTargetDailyMl = ({
  weightKg,
  gender,
  age,
  workEnvironment,
  activityLevel,
  medicalConditions = [],
  physicianLimitMl,
  accountCreatedAt,
}: TargetInputs): number | null => {
  return computePBWRBreakdown(
    {
      weightKg,
      gender,
      age,
      workEnvironment,
      activityLevel,
      medicalConditions,
      physicianLimitMl,
    },
    // No observed averages: the three telemetry-driven bands contribute
    // nothing. `PBWRService` is the caller that has seven days of history.
    null,
    { calibrating: isWithinCalibrationWindow(accountCreatedAt) }
  ).finalTarget;
};

/** The same calculation over a stored profile blob. */
export const targetFromProfile = (
  profile: Partial<UserProfile> & { selectedCity?: string }
): number | null =>
  computeTargetDailyMl({
    weightKg: Number(profile.weightKg) || 0,
    gender: profile.gender,
    age: Number(profile.age) || undefined,
    workEnvironment: profile.workEnvironment,
    activityLevel: profile.activityLevel,
    medicalConditions: profile.medicalConditions,
    physicianLimitMl: profile.physicianLimitMl,
    accountCreatedAt: profile.accountCreatedAt,
  });

/** Whether a stored profile owes the app a doctor's number. */
export const profileNeedsPhysicianLimit = (
  profile?: Partial<UserProfile> | null
): boolean =>
  physicianLimitStateFor(profile?.medicalConditions, profile?.physicianLimitMl) === 'missing';

export default computeTargetDailyMl;
