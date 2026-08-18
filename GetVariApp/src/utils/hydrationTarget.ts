/**
 * The daily hydration goal, derived from the onboarding answers.
 *
 * This lived inline in the onboarding screen until the profile became
 * editable. Two copies of it would have drifted immediately: a user who
 * corrects their weight or adds a diagnosis expects the goal to move by the
 * same rules that produced it in the first place, so both callers compute it
 * here.
 *
 * Every adjustment is a product decision rather than a clinical one, and the
 * result is clamped to a range that stays safe whatever the inputs say.
 */

import type { UserProfile } from '../types';

/** Millilitres per kilogram of body weight, before any adjustment. */
const ML_PER_KG = 35;

/** Extra allowance for sustained physical load. */
const ACTIVITY_BONUS_ML: Record<string, number> = {
  active: 600,
  elite: 1200,
};

/** Condition-driven adjustments; kidney disease *lowers* the ceiling. */
const CONDITION_ADJUSTMENT_ML: Record<string, number> = {
  diabetes: 450,
  kidney: -250,
  hypertension: 150,
};

/** Cities whose baseline climate costs the user extra fluid. */
const HOT_CITIES = ['Mumbai', 'Delhi', 'Chennai', 'Kolkata', 'Hyderabad', 'Ahmedabad', 'Jaipur'];
const MODERATE_CITIES = ['Bengaluru', 'Pune', 'Tokyo', 'San Francisco'];

export const MIN_TARGET_ML = 1500;
export const MAX_TARGET_ML = 4500;

export interface TargetInputs {
  weightKg: number;
  activityLevel?: string;
  medicalConditions?: string[];
  /** The city chosen during onboarding, used only for its climate band. */
  selectedCity?: string;
}

/** Extra hydration allocation implied by the city's climate baseline. */
export const climateModifierFor = (selectedCity?: string): number => {
  if (!selectedCity) return 0;
  if (HOT_CITIES.some(city => selectedCity.includes(city))) return 350;
  if (MODERATE_CITIES.some(city => selectedCity.includes(city))) return 100;
  return 0;
};

/** The goal in ml, rounded to the nearest 50 and clamped to a safe range. */
export const computeTargetDailyMl = ({
  weightKg,
  activityLevel,
  medicalConditions = [],
  selectedCity,
}: TargetInputs): number => {
  let targetMl = weightKg * ML_PER_KG;

  targetMl += ACTIVITY_BONUS_ML[activityLevel ?? ''] ?? 0;

  for (const condition of medicalConditions) {
    targetMl += CONDITION_ADJUSTMENT_ML[condition] ?? 0;
  }

  targetMl += climateModifierFor(selectedCity);

  targetMl = Math.round(targetMl / 50) * 50;
  return Math.min(MAX_TARGET_ML, Math.max(MIN_TARGET_ML, targetMl));
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
