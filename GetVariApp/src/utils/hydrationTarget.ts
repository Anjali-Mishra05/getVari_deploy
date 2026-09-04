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
}

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

/** The goal in ml, rounded and clamped to the configured safe range. */
export const computeTargetDailyMl = ({
  weightKg,
  activityLevel,
  medicalConditions = [],
  selectedCity,
}: TargetInputs): number => {
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
export const targetFromProfile = (profile: Partial<UserProfile> & { selectedCity?: string }): number =>
  computeTargetDailyMl({
    weightKg: Number(profile.weightKg) || 0,
    activityLevel: profile.activityLevel,
    medicalConditions: profile.medicalConditions,
    selectedCity: profile.selectedCity ?? profile.location,
  });

export default computeTargetDailyMl;
