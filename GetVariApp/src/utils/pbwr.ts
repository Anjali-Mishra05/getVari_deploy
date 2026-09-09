/**
 * The Personalized Base Water Requirement (PBWR v2) pipeline.
 *
 * This is the calculation described in
 * `docs/reference/pbwr-v2-developer-onepager.docx`, and it is the *only*
 * place the daily hydration goal is worked out. It used to have a rival: a
 * `weight × 35 + bonuses` formula in `hydrationTarget.ts` produced the number
 * stored on the profile — the one reminders, the chatbot, the admin console
 * and the web app all read — while PBWR produced the number on the dashboard.
 * Two answers to the same question, hundreds of millilitres apart, and only
 * one of them matching the spec.
 *
 * The pipeline, per the one-pager:
 *
 *   Final Daily Water Target
 *     = MAX(1.5 L, MIN(PBWR + Activity + Temperature + Humidity
 *                      + Work Env + Health, Upper Limit))
 *
 * It is kept synchronous and free of I/O so both callers can use it: the
 * dashboard feeds it seven days of observed telemetry, and everything else
 * (onboarding, the profile editor, `ProfileService`) calls it with none.
 */

import AppConfigStore from '../config/appConfigStore';

/** §2 — millilitres per kilogram of body weight, by sex. */
export const GENDER_RATES = {
  Male: 56.9, // 3,700 ml ÷ 65 kg reference weight
  Female: 49.1, // 2,700 ml ÷ 55 kg reference weight
};

/** §2 — total body water declines with age, so the baseline scales with it. */
export const AGE_FACTORS = [
  { min: 0, max: 39, factor: 1.0 },
  { min: 40, max: 59, factor: 0.95 },
  { min: 60, max: 150, factor: 0.9 },
];

/** §4 — activity, read from observed average daily steps. Never self-declared. */
export const STEP_BANDS = [
  { min: 14000, adj: 1300 }, // Heavy
  { min: 10000, adj: 900 }, // Active/Gym
  { min: 6000, adj: 500 }, // Moderate
  { min: 3000, adj: 300 }, // Light
  { min: 0, adj: 0 }, // Sedentary
];

/** §4 — ambient temperature, °C. */
export const TEMP_BANDS = [
  { min: 34, adj: 900 }, // Hot
  { min: 28, adj: 500 }, // Warm
  { min: 22, adj: 250 }, // Mild
  { min: -Infinity, adj: 0 }, // Cool
];

/** §4 — relative humidity, %. */
export const HUMIDITY_BANDS = [
  { min: 75, adj: 500 }, // Very High
  { min: 60, adj: 300 }, // High
  { min: 40, adj: 150 }, // Moderate
  { min: 0, adj: 0 }, // Low
];

/**
 * §6 — the ceilings.
 *
 * Work-environment and per-condition adjustments, and which conditions are
 * physician-gated, come from the admin config instead; only the ceilings the
 * spec fixes by category live here.
 */
export const UPPER_LIMITS = {
  Healthy_Female: 4000,
  Healthy_Male: 4500,
  Gym: 5000,
  Outdoor: 5000,
  Heavy_Outdoor: 5500,
};

/** §7 — no adult's target may fall below this, barring a doctor's restriction. */
export const SAFETY_FLOOR_ML = 1500;

/** §3 — days after sign-up during which the observed bands stay at zero. */
export const CALIBRATION_DAYS = 7;

/** Everything the pipeline reads off a profile. */
export interface PBWRInputs {
  gender?: string;
  age?: number;
  weightKg?: number;
  workEnvironment?: string;
  medicalConditions?: string[] | null;
  physicianLimitMl?: number | null;
  /**
   * Self-declared training load. Not an input to the activity *band* — §3 is
   * explicit that no user-declared activity category is used there — but it
   * is what qualifies a profile for the Gym/Active ceiling in §6.
   */
  activityLevel?: string;
}

/** The rolling 7-day averages §3 feeds the bands, or nulls where none exist. */
export interface ObservedAverages {
  avgSteps: number | null;
  avgTemp: number | null;
  avgHumidity: number | null;
}

export interface PBWRBreakdown {
  pbwrBaseline: number;
  activityAdj: number;
  tempAdj: number;
  humidityAdj: number;
  workEnvAdj: number;
  healthAdj: number;
  adjustedTotal: number;
  upperLimit: number;
  finalTarget: number;
  isPhysicianGated: boolean;
  physicianLimitEntered: boolean;
}

/**
 * A finite number, or the supplied fallback.
 *
 * Every stage multiplies and then compares, so one missing field (a profile
 * row saved before `weightKg` existed, say) turns the whole breakdown into
 * NaN and puts "NaN ml" on the dashboard. Coercing at the edge is what keeps
 * a partial profile showing a conservative number instead.
 */
const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** The band an observed average falls in, or 0 when there is no reading. */
const bandAdjustment = (
  bands: { min: number; adj: number }[],
  value: number | null | undefined
): number => {
  // "Missing != Zero": a null average means *unknown*, and an unknown metric
  // contributes no adjustment rather than being scored as the lowest band.
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 0;
  return bands.find(band => Number(value) >= band.min)?.adj ?? 0;
};

/**
 * Whether a stored gender string selects the female rate and ceiling.
 *
 * Compared case-insensitively because the value is a free-ish string that has
 * been written as both "Female" and "female" by different versions of
 * onboarding. An exact match against "Female" quietly gave every lowercase
 * row the male 56.9 ml/kg rate and the 4.5 L ceiling — a ~16% overstatement
 * of the baseline, invisible because it still looked like a plausible number.
 */
const isFemale = (gender?: string): boolean =>
  typeof gender === 'string' && gender.trim().toLowerCase() === 'female';

/** §2 — Stage 1. */
export const pbwrBaselineMl = (inputs: PBWRInputs): number => {
  const genderRate = isFemale(inputs.gender) ? GENDER_RATES.Female : GENDER_RATES.Male;
  const age = num(inputs.age, 30);
  const ageFactor = AGE_FACTORS.find(f => age >= f.min && age <= f.max)?.factor ?? 0.9;
  const weightKg = num(inputs.weightKg, 0);
  // A profile with no usable weight cannot be personalised, so it falls back
  // to the safety floor rather than producing NaN all the way to the screen.
  return weightKg > 0 ? weightKg * genderRate * ageFactor : SAFETY_FLOOR_ML;
};

/**
 * The whole pipeline, §2 through §7.
 *
 * `observed` is the rolling 7-day telemetry average. Pass `null` when there
 * is none to hand — during the §3 calibration window, or from any caller that
 * has a profile but no sensor history — and the three observed bands
 * contribute nothing, which is exactly what §3 asks for on days 1–7.
 */
export const computePBWRBreakdown = (
  inputs: PBWRInputs,
  observed?: ObservedAverages | null
): PBWRBreakdown => {
  // Stage 1
  const pbwrBaseline = pbwrBaselineMl(inputs);

  // Stage 3 — the observed bands
  const activityAdj = bandAdjustment(STEP_BANDS, observed?.avgSteps);
  const tempAdj = bandAdjustment(TEMP_BANDS, observed?.avgTemp);
  const humidityAdj = bandAdjustment(HUMIDITY_BANDS, observed?.avgHumidity);

  // Stage 3 — the self-declared ones
  const workEnvAdj = num(
    AppConfigStore.current().workEnvironments.find(env => env.id === inputs.workEnvironment)
      ?.pbwrAdjustmentMl
  );

  const conditions = AppConfigStore.conditionsFor(inputs.medicalConditions);
  const isPhysicianGated = conditions.some(condition => condition.requiresPhysicianLimit);
  const physicianLimitMl = num(inputs.physicianLimitMl);
  const physicianLimitEntered = physicianLimitMl > 0;

  /**
   * §5 step 2 — "Health Adjustment = +0" once a condition is physician-gated.
   *
   * Not just for the gated condition itself (those ship with a zero
   * adjustment anyway) but for the whole term: a CKD patient who also has
   * diabetes does not get diabetes' +400 ml added to a restricted intake.
   * The formula has no business raising a number a clinician has capped.
   */
  const healthAdj = isPhysicianGated
    ? 0
    : conditions.reduce((total, condition) => total + num(condition.pbwrAdjustmentMl), 0);

  const adjustedTotal =
    pbwrBaseline + activityAdj + tempAdj + humidityAdj + workEnvAdj + healthAdj;

  // Stage 4 — the ceiling
  const healthyCeiling = isFemale(inputs.gender)
    ? UPPER_LIMITS.Healthy_Female
    : UPPER_LIMITS.Healthy_Male;

  let upperLimit: number;
  if (isPhysicianGated) {
    /**
     * §6 — "any physician-gated condition present → that value always wins".
     *
     * The doctor's number is the *ceiling*, not the goal. The formula still
     * runs underneath it, so a small-framed patient on a 3,000 ml limit is
     * paced to what their body needs rather than to the maximum they are
     * permitted. It can only ever lower the target, never raise it.
     *
     * With no number on file, §5 step 3 falls back to the healthy ceiling and
     * asks the user for the limit (see `PBWRBreakdownCard`'s caution banner);
     * callers that would rather show no goal at all than a guessed one check
     * `physicianLimitEntered`.
     */
    upperLimit = physicianLimitEntered ? physicianLimitMl : healthyCeiling;
  } else {
    /**
     * §6 — the lowest applicable ceiling among the qualifying categories.
     *
     * "Healthy" is the base case rather than a member of the set: it applies
     * only when nothing else does. Including it in the MIN unconditionally
     * would make every other row in the table dead — 4,000/4,500 is below all
     * of them, so a gym-goer would never reach the 5,000 the spec grants.
     */
    const conditionLimits = conditions
      .map(condition => condition.pbwrUpperLimitMl)
      .filter((limit): limit is number => typeof limit === 'number' && limit > 0);

    const categoryLimits: number[] = [...conditionLimits];
    if (inputs.activityLevel === 'active' || inputs.activityLevel === 'elite') {
      categoryLimits.push(UPPER_LIMITS.Gym);
    }
    if (inputs.workEnvironment === 'outdoor') categoryLimits.push(UPPER_LIMITS.Outdoor);
    if (inputs.workEnvironment === 'heavy_outdoor') categoryLimits.push(UPPER_LIMITS.Heavy_Outdoor);

    upperLimit = categoryLimits.length > 0 ? Math.min(...categoryLimits) : healthyCeiling;
  }

  /**
   * Stage 5 — the floor.
   *
   * The 1,500 ml floor protects a healthy user from a target so low it is
   * itself a risk. It must never *raise* a physician's restriction: a
   * nephrologist who says 1,200 ml/day has said 1,200, and a floor that
   * quietly returned 1,500 would have the app pacing a CKD patient 300 ml
   * past their limit every single day — the exact harm the gate exists to
   * prevent. So the floor yields to the ceiling rather than overriding it.
   */
  const safetyFloor = Math.min(SAFETY_FLOOR_ML, upperLimit);
  const finalTarget = Math.round(Math.max(safetyFloor, Math.min(adjustedTotal, upperLimit)));

  return {
    pbwrBaseline: Math.round(pbwrBaseline),
    activityAdj,
    tempAdj,
    humidityAdj,
    workEnvAdj,
    healthAdj,
    adjustedTotal: Math.round(adjustedTotal),
    upperLimit: Math.round(upperLimit),
    finalTarget,
    isPhysicianGated,
    physicianLimitEntered,
  };
};

/**
 * §3 — whether an account is still inside its 7-day calibration window.
 *
 * Measured from the account's age, not from whether the telemetry is mock.
 * The mock history exists precisely so the model can personalise from day
 * one; keying calibration off `isMock` pinned any user whose wearable had not
 * yet reported to zero adjustments indefinitely, the opposite of what the
 * fallback is for. Accounts with no recorded start date are treated as
 * established — the stamp is written on first save, so only pre-existing rows
 * lack it, and those are long past day seven.
 */
export const isWithinCalibrationWindow = (accountCreatedAt?: string | null): boolean => {
  const createdAt = accountCreatedAt ? Date.parse(accountCreatedAt) : NaN;
  return Number.isFinite(createdAt) && Date.now() - createdAt < CALIBRATION_DAYS * 86400000;
};

export default computePBWRBreakdown;
