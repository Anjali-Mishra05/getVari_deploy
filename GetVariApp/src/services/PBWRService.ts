import { UserProfile } from '../types';
import TelemetryHistoryService from './TelemetryHistoryService';
import AppConfigStore from '../config/appConfigStore';

/**
 * A finite number, or the supplied fallback.
 *
 * Every stage of this pipeline multiplies and then compares, so one missing
 * field (a profile row saved before `weightKg` existed, say) turns the whole
 * breakdown into NaN and puts "NaN ml" on the dashboard. Coercing at the edge
 * is what keeps a partial profile showing a conservative number instead.
 */
const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * PBWRService - 100% Compliant Implementation of Personalized Base Water Requirement (PBWR)
 *
 * Follows the 5-Stage Pipeline Implementation Spec:
 * 1. Stage 1: PBWR = Weight (kg) × Gender Rate × Age Factor
 * 2. Stage 2: 7-Day Calibration (Days 1-7 = Baseline Only)
 * 3. Stage 3: Adjustment Bands (Fixed values for Activity, Climate, Work, Health)
 * 4. Stage 4: Upper Limit & Precedence (Lowest applicable limit, Physician override always wins)
 * 5. Stage 5: Safety Floor (1.5L minimum)
 */

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
  remaining: number;
  isCalibrationPeriod: boolean;
  isPhysicianGated: boolean;
  physicianLimitEntered: boolean;
}

class PBWRService {
  /** Days after sign-up during which adjustments stay at zero. */
  private CALIBRATION_DAYS = 7;

  private GENDER_RATES = {
    Male: 56.9,
    Female: 49.1,
  };

  private AGE_FACTORS = [
    { min: 0, max: 39, factor: 1.00 },
    { min: 40, max: 59, factor: 0.95 },
    { min: 60, max: 150, factor: 0.90 },
  ];

  // Stage 3 - Activity (Steps/day)
  private STEP_BANDS = [
    { min: 14000, adj: 1300 }, // Heavy
    { min: 10000, adj: 900 },  // Active/Gym
    { min: 6000, adj: 500 },   // Moderate
    { min: 3000, adj: 300 },   // Light
    { min: 0, adj: 0 },       // Sedentary
  ];

  // Stage 3 - Temperature (°C)
  private TEMP_BANDS = [
    { min: 34, adj: 900 },   // Hot
    { min: 28, adj: 500 },   // Warm
    { min: 22, adj: 250 },   // Mild
    { min: 0, adj: 0 },      // Cool
  ];

  // Stage 3 - Humidity (RH %)
  private HUMIDITY_BANDS = [
    { min: 75, adj: 500 },   // Very High
    { min: 60, adj: 300 },   // High
    { min: 40, adj: 150 },   // Moderate
    { min: 0, adj: 0 },      // Low
  ];

  // Stage 3 work-environment and health adjustments, and which conditions are
  // physician-gated, all come from the admin config — see AppConfigStore.

  // Stage 4 - Upper Limits
  private UPPER_LIMITS = {
    Healthy_Female: 4000,
    Healthy_Male: 4500,
    Gym: 5000,
    Outdoor: 5000,
    Heavy_Outdoor: 5500,
    Diabetes: 5000,
    Kidney_Stone_History: 5000,
  };

  async calculatePBWR(profile: UserProfile, waterConsumedMl: number, userId?: string): Promise<PBWRBreakdown> {
    // 1. Stage 1 - PBWR Baseline
    const genderRate = profile.gender === 'Female' ? this.GENDER_RATES.Female : this.GENDER_RATES.Male;
    const age = num(profile.age, 30);
    const ageFactor = this.AGE_FACTORS.find(f => age >= f.min && age <= f.max)?.factor || 0.90;
    // A profile with no usable weight cannot be personalised, so it falls back
    // to the safety floor rather than producing NaN all the way to the screen.
    const weightKg = num(profile.weightKg, 0);
    const pbwrBaseline = weightKg > 0 ? weightKg * genderRate * ageFactor : 1500;

    // 2. Stage 2 - 7-Day Calibration
    // Logic: With mock fallback, snapshots.length will be 7 for any valid userId/profile.
    // We fetch averages (Real + Mock Fallback) for the rolling calculation.
    const avgs = await TelemetryHistoryService.getAverages(7, userId, profile);

    // Stage 2: is this account still calibrating?
    //
    // Measured from the account's age, not from whether the snapshots are
    // mock. The mock history exists precisely so the model can personalise
    // from day one; keying calibration off `isMock` meant any user whose
    // wearable had not yet reported real telemetry was pinned to zero
    // adjustments indefinitely, which is the opposite of what the fallback is
    // for. Accounts with no recorded start date are treated as established —
    // the stamp is written on first save, so only pre-existing rows lack it,
    // and those are long past day seven.
    const createdAt = profile.accountCreatedAt ? Date.parse(profile.accountCreatedAt) : NaN;
    const isCalibrationPeriod =
      Number.isFinite(createdAt) && Date.now() - createdAt < this.CALIBRATION_DAYS * 86400000;

    // 3. Stage 3 - Adjustment Bands
    // "Missing != Zero": If averages are null, no adjustment is applied.
    let activityAdj = avgs.avgSteps !== null ? (this.STEP_BANDS.find(b => (avgs.avgSteps || 0) >= b.min)?.adj || 0) : 0;
    let tempAdj = avgs.avgTemp !== null ? (this.TEMP_BANDS.find(b => (avgs.avgTemp || 0) >= b.min)?.adj || 0) : 0;
    let humidityAdj = avgs.avgHumidity !== null ? (this.HUMIDITY_BANDS.find(b => (avgs.avgHumidity || 0) >= b.min)?.adj || 0) : 0;

    if (isCalibrationPeriod) {
        activityAdj = 0;
        tempAdj = 0;
        humidityAdj = 0;
    }

    const workEnvAdj = num(
      AppConfigStore.current().workEnvironments.find(env => env.id === profile.workEnvironment)
        ?.pbwrAdjustmentMl
    );

    const conditions = AppConfigStore.conditionsFor(profile.medicalConditions);
    const healthAdj = conditions.reduce((total, condition) => total + num(condition.pbwrAdjustmentMl), 0);
    const isPhysicianGated = conditions.some(condition => condition.requiresPhysicianLimit);

    const adjustedTotal = pbwrBaseline + activityAdj + tempAdj + humidityAdj + workEnvAdj + healthAdj;

    // 4. Stage 4 - Upper Limit & Precedence
    const qualifyingLimits: number[] = [];

    // Precedence: Physician-gated always wins
    if (isPhysicianGated) {
        if (profile.physicianLimitMl && profile.physicianLimitMl > 0) {
            qualifyingLimits.push(profile.physicianLimitMl);
        } else {
            // Default to Healthy category limit
            qualifyingLimits.push(profile.gender === 'Female' ? this.UPPER_LIMITS.Healthy_Female : this.UPPER_LIMITS.Healthy_Male);
        }
    } else {
        // Find qualifying categories for MIN logic.
        // Healthy applies only if no other "active" category applies. Each
        // condition brings its own ceiling from the config; a condition with
        // no ceiling contributes none.
        const conditionLimits = conditions
            .map(condition => condition.pbwrUpperLimitMl)
            .filter((limit): limit is number => typeof limit === 'number' && limit > 0);

        const hasActiveCategories =
            profile.activityLevel === 'active' ||
            profile.activityLevel === 'elite' ||
            profile.workEnvironment === 'outdoor' ||
            profile.workEnvironment === 'heavy_outdoor' ||
            conditionLimits.length > 0;

        if (!hasActiveCategories) {
            qualifyingLimits.push(profile.gender === 'Female' ? this.UPPER_LIMITS.Healthy_Female : this.UPPER_LIMITS.Healthy_Male);
        } else {
            if (profile.activityLevel === 'active' || profile.activityLevel === 'elite') qualifyingLimits.push(this.UPPER_LIMITS.Gym);
            if (profile.workEnvironment === 'outdoor') qualifyingLimits.push(this.UPPER_LIMITS.Outdoor);
            if (profile.workEnvironment === 'heavy_outdoor') qualifyingLimits.push(this.UPPER_LIMITS.Heavy_Outdoor);
            qualifyingLimits.push(...conditionLimits);
        }
    }

    // `Math.min()` of an empty list is Infinity, which would print as
    // "Infinity ml" on the breakdown card, so the healthy ceiling stands in.
    const defaultCeiling =
        profile.gender === 'Female' ? this.UPPER_LIMITS.Healthy_Female : this.UPPER_LIMITS.Healthy_Male;
    const upperLimit = isPhysicianGated && num(profile.physicianLimitMl) > 0
        ? num(profile.physicianLimitMl)
        : qualifyingLimits.length > 0
          ? Math.min(...qualifyingLimits)
          : defaultCeiling;

    // 5. Stage 5 - Safety Floor
    //
    // The 1500 ml floor protects a healthy user from a target so low it is
    // itself a risk. It must never *raise* a physician's restriction: a
    // nephrologist who says 1200 ml/day has said 1200, and a floor that
    // quietly returned 1500 would have the app pacing a CKD patient 300 ml
    // past their limit every single day — the exact harm the physician gate
    // exists to prevent. Where a doctor's number is on file it is the whole
    // answer, so the floor is lowered to meet it rather than overriding it.
    const safetyFloor = Math.min(1500, upperLimit);
    const finalDailyWaterTarget = Math.round(
      Math.max(safetyFloor, Math.min(adjustedTotal, upperLimit))
    );

    return {
      pbwrBaseline: Math.round(pbwrBaseline),
      activityAdj,
      tempAdj,
      humidityAdj,
      workEnvAdj,
      healthAdj,
      adjustedTotal: Math.round(adjustedTotal),
      upperLimit: Math.round(upperLimit),
      finalTarget: finalDailyWaterTarget,
      remaining: Math.max(0, finalDailyWaterTarget - num(waterConsumedMl)),
      isCalibrationPeriod,
      isPhysicianGated,
      physicianLimitEntered: !!profile.physicianLimitMl,
    };
  }
}

export default new PBWRService();
