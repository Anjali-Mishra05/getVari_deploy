import { UserProfile } from '../types';
import TelemetryHistoryService from './TelemetryHistoryService';
import {
  CALIBRATION_DAYS,
  computePBWRBreakdown,
  isWithinCalibrationWindow,
  type PBWRBreakdown as PBWRCoreBreakdown,
} from '../utils/pbwr';

/**
 * PBWRService — the Personalized Base Water Requirement with live telemetry.
 *
 * The pipeline itself lives in `utils/pbwr.ts` so that onboarding, the profile
 * editor and `ProfileService` can run the same five stages without touching
 * the network. This service is the part that needs I/O: it fetches the rolling
 * 7-day averages §3 asks for, decides whether the account is still calibrating,
 * and reports what is left to drink today.
 *
 * See `docs/reference/pbwr-v2-developer-onepager.docx`.
 */

export interface PBWRBreakdown extends PBWRCoreBreakdown {
  remaining: number;
  isCalibrationPeriod: boolean;
}

const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

class PBWRService {
  /** Days after sign-up during which the observed adjustments stay at zero. */
  private CALIBRATION_DAYS = CALIBRATION_DAYS;

  async calculatePBWR(
    profile: UserProfile,
    waterConsumedMl: number,
    userId?: string
  ): Promise<PBWRBreakdown> {
    // §3 — the rolling 7-day average of each observed metric.
    const avgs = await TelemetryHistoryService.getAverages(
      this.CALIBRATION_DAYS,
      userId,
      profile
    );

    // §3 — days 1–7 run on the baseline alone, so the observed bands are not
    // fed in at all rather than being fed in and then zeroed.
    const isCalibrationPeriod = isWithinCalibrationWindow(profile.accountCreatedAt);

    const breakdown = computePBWRBreakdown(
      {
        gender: profile.gender,
        age: profile.age,
        weightKg: profile.weightKg,
        workEnvironment: profile.workEnvironment,
        medicalConditions: profile.medicalConditions,
        physicianLimitMl: profile.physicianLimitMl,
        activityLevel: profile.activityLevel,
      },
      isCalibrationPeriod ? null : avgs
    );

    return {
      ...breakdown,
      remaining: Math.max(0, breakdown.finalTarget - num(waterConsumedMl)),
      isCalibrationPeriod,
    };
  }
}

export default new PBWRService();
