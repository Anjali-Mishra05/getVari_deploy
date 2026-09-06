/**
 * The daily hydration goal, derived from the onboarding answers.
 *
 * This lived inline in the onboarding screen until the profile became
 * editable. Two copies of it would have drifted immediately: a user who
 * corrects their weight or adds a diagnosis expects the goal to move by the
 * same rules that produced it in the first place, so both callers compute it
 * here.
 *
 * Every number it uses — millilitres per kilogram, the activity bonuses, the
 * per-condition adjustments, the climate bands and the safe range — now comes
 * from the admin config rather than from constants in this file. Changing how
 * a diagnosis moves the goal is a change in the admin panel, not a release.
 */

import AppConfigStore from '../config/appConfigStore';
import type { UserProfile } from '../types';
import type { ClimateBandConfig } from '../config/appConfigSchema';

export interface TargetInputs {
  weightKg: number;
  activityLevel?: string;
  medicalConditions?: string[];
  /** The resolved city, used only for its climate band. */
  selectedCity?: string;
  /**
   * The daily ceiling the user's doctor set, in ml.
   *
   * For a fluid-restricted condition this is not one more term in the sum —
   * it replaces the formula outright. See `computeTargetDailyMl`.
   */
  physicianLimitMl?: number | null;
}

/** Where a profile stands on the doctor's-number requirement. */
export type PhysicianLimitState =
  | 'not-required' // no fluid-restricted condition on the profile
  | 'set' // restricted, and the doctor's daily limit is on file
  | 'missing'; // restricted, and it is not — the app must not invent one

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
  if (!trimmed) return 'A physician daily limit is required for the conditions you selected.';

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

/** Extra hydration allocation implied by the city's climate baseline. */
export const climateModifierFor = (selectedCity?: string): number =>
  climateBandFor(selectedCity)?.targetAdjustmentMl ?? 0;

/**
 * The goal in ml, or `null` when the app must not state one.
 *
 * ## A doctor's number is not a term in the formula
 *
 * For a fluid-restricted condition the physician's daily limit **replaces**
 * the calculation entirely — it is not added to it, blended with it, rounded
 * to the nearest 50, or raised to `minTargetMl`. Every one of those was
 * happening: a CKD profile with a nephrologist's 1200 ml/day on file was
 * shown `weight × 35 − 250`, so a 70 kg patient got a 2200 ml goal against a
 * 1200 ml restriction, and even feeding the limit through the old clamp would
 * have floored it back up to 1500.
 *
 * Over-drinking on a fluid restriction is the harm this exists to prevent, so
 * the doctor's number wins outright and unmodified.
 *
 * ## And when there is no number, there is no goal
 *
 * `null` is returned rather than a fallback. A goal is a number the user
 * drinks *towards*, so inventing one for a restricted patient is the same
 * mistake in a quieter form — which is what `requiresPhysicianLimit` already
 * promised not to do ("says so rather than guessing"). Callers show the
 * prompt for the missing limit instead of a figure.
 */
export const computeTargetDailyMl = ({
  weightKg,
  activityLevel,
  medicalConditions = [],
  selectedCity,
  physicianLimitMl,
}: TargetInputs): number | null => {
  const gate = physicianLimitStateFor(medicalConditions, physicianLimitMl);
  if (gate === 'missing') return null;
  if (gate === 'set') return Math.round(Number(physicianLimitMl));

  const { mlPerKg, minTargetMl, maxTargetMl, roundToMl } = AppConfigStore.current().targetFormula;

  let targetMl = weightKg * mlPerKg;

  const activity = AppConfigStore.current().activityLevels.find(level => level.id === activityLevel);
  targetMl += activity?.targetBonusMl ?? 0;

  // Unknown ids contribute nothing rather than throwing: a condition retired
  // from the admin panel is still sitting on profiles that selected it.
  for (const condition of AppConfigStore.conditionsFor(medicalConditions)) {
    targetMl += condition.targetAdjustmentMl;
  }

  targetMl += climateModifierFor(selectedCity);

  const step = roundToMl > 0 ? roundToMl : 1;
  targetMl = Math.round(targetMl / step) * step;
  return Math.min(maxTargetMl, Math.max(minTargetMl, targetMl));
};

/** The same calculation over a stored profile blob. */
export const targetFromProfile = (
  profile: Partial<UserProfile> & { selectedCity?: string }
): number | null =>
  computeTargetDailyMl({
    weightKg: Number(profile.weightKg) || 0,
    activityLevel: profile.activityLevel,
    medicalConditions: profile.medicalConditions,
    selectedCity: profile.selectedCity ?? profile.location,
    physicianLimitMl: profile.physicianLimitMl,
  });

/** Whether a stored profile owes the app a doctor's number. */
export const profileNeedsPhysicianLimit = (
  profile?: Partial<UserProfile> | null
): boolean =>
  physicianLimitStateFor(profile?.medicalConditions, profile?.physicianLimitMl) === 'missing';

export default computeTargetDailyMl;
