import PBWRService from '../src/services/PBWRService';
import TelemetryHistoryService from '../src/services/TelemetryHistoryService';
import { UserProfile } from '../src/types';

// Mock TelemetryHistoryService to return fixed averages for testing
jest.mock('../src/services/TelemetryHistoryService', () => ({
  getAverages: jest.fn(),
  getHistory: jest.fn(),
}));

describe('PBWR Algorithm Verification', () => {

  test('Worked Example: 70kg Male, 25yr, AC Office, Diabetes, 5200 steps, 27°C, 55% RH', async () => {
    const profile: UserProfile = {
      age: 25,
      gender: 'Male',
      weightKg: 70,
      activityLevel: 'moderate',
      fitnessGoal: 'optimize_health',
      waterHabit: 'moderate',
      targetDailyMl: 2500,
      workEnvironment: 'ac_office',
      medicalConditions: ['diabetes'],
    };

    // Mock 7 snapshots to exit calibration period
    (TelemetryHistoryService.getHistory as jest.Mock).mockResolvedValue(new Array(7).fill({}));

    // Mock 7-day averages from spec
    (TelemetryHistoryService.getAverages as jest.Mock).mockResolvedValue({
      avgSteps: 5200,
      avgTemp: 27,
      avgHumidity: 55,
    });

    const breakdown = await PBWRService.calculatePBWR(profile, 0);

    // Stage 1: 70 * 56.9 * 1.0 = 3983
    expect(breakdown.pbwrBaseline).toBe(3983);

    // Stage 3 Adjustments:
    // Steps 5200 (Light) -> +300
    // Temp 27 (Mild) -> +250
    // Humidity 55 (Moderate) -> +150
    // Work Env (AC Office) -> +250
    // Health (Diabetes) -> +400
    expect(breakdown.activityAdj).toBe(300);
    expect(breakdown.tempAdj).toBe(250);
    expect(breakdown.humidityAdj).toBe(150);
    expect(breakdown.workEnvAdj).toBe(250);
    expect(breakdown.healthAdj).toBe(400);

    // Adjusted Total: 3983 + 300 + 250 + 150 + 250 + 400 = 5333
    expect(breakdown.adjustedTotal).toBe(5333);

    // Stage 4 Upper Limit: Diabetes (5000)
    expect(breakdown.upperLimit).toBe(5000);

    // Final: min(5333, 5000) = 5000
    expect(breakdown.finalTarget).toBe(5000);
  });

  test('Physician-Gated Condition Override', async () => {
    const profile: UserProfile = {
      age: 45,
      gender: 'Male',
      weightKg: 80,
      activityLevel: 'light',
      fitnessGoal: 'optimize_health',
      waterHabit: 'moderate',
      targetDailyMl: 2500,
      workEnvironment: 'indoor',
      medicalConditions: ['ckd'], // Physician-gated
      physicianLimitMl: 2200,
    };

    (TelemetryHistoryService.getHistory as jest.Mock).mockResolvedValue(new Array(7).fill({}));
    (TelemetryHistoryService.getAverages as jest.Mock).mockResolvedValue({
      avgSteps: 2000,
      avgTemp: 20,
      avgHumidity: 40,
    });

    const breakdown = await PBWRService.calculatePBWR(profile, 0);

    expect(breakdown.isPhysicianGated).toBe(true);
    expect(breakdown.upperLimit).toBe(2200);
    expect(breakdown.finalTarget).toBe(2200);
  });

  test('Safety Floor: Ensures target never drops below 1.5L', async () => {
    const profile: UserProfile = {
        age: 65, // Age Factor 0.90
        gender: 'Female', // Rate 49.1
        weightKg: 30, // Extremely low weight for test
        activityLevel: 'sedentary',
        fitnessGoal: 'optimize_health',
        waterHabit: 'low',
        targetDailyMl: 2000,
        workEnvironment: 'indoor',
        medicalConditions: [],
    };

    (TelemetryHistoryService.getHistory as jest.Mock).mockResolvedValue(new Array(7).fill({}));
    (TelemetryHistoryService.getAverages as jest.Mock).mockResolvedValue({
      avgSteps: 100,
      avgTemp: 18,
      avgHumidity: 20,
    });

    const breakdown = await PBWRService.calculatePBWR(profile, 0);
    // Baseline: 30 * 49.1 * 0.90 = 1325.7
    // Total: 1325.7 + 0 + 0 + 0 = 1325.7
    // Limits: Healthy Female (4000)
    // Final: MAX(1500, MIN(1326, 4000)) = 1500
    expect(breakdown.finalTarget).toBe(1500);
  });

});

/**
 * The safety floor and a physician's restriction.
 *
 * Stage 5 is `max(floor, min(adjustedTotal, upperLimit))`. With the floor
 * fixed at 1500 it silently *raised* any restriction below it: a nephrologist
 * prescribing 1200 ml/day got a 1500 ml target, so the app paced a CKD
 * patient 300 ml past their limit every day. The floor now yields to a
 * doctor's number instead of overriding it.
 */
describe('PBWR respects a physician limit below the safety floor', () => {
  const restrictedProfile = (physicianLimitMl?: number): UserProfile =>
    ({
      age: 55,
      gender: 'Male',
      weightKg: 70,
      activityLevel: 'sedentary',
      fitnessGoal: 'optimize_health',
      waterHabit: 'moderate',
      targetDailyMl: physicianLimitMl ?? null,
      workEnvironment: 'ac_office',
      medicalConditions: ['ckd'],
      physicianLimitMl,
    } as UserProfile);

  beforeEach(() => {
    (TelemetryHistoryService.getHistory as jest.Mock).mockResolvedValue(new Array(7).fill({}));
    (TelemetryHistoryService.getAverages as jest.Mock).mockResolvedValue({
      avgSteps: 3000,
      avgTemp: 24,
      avgHumidity: 50,
    });
  });

  test('a 1200 ml restriction is not floored up to 1500', async () => {
    const breakdown = await PBWRService.calculatePBWR(restrictedProfile(1200), 0);

    expect(breakdown.isPhysicianGated).toBe(true);
    expect(breakdown.physicianLimitEntered).toBe(true);
    expect(breakdown.upperLimit).toBe(1200);
    expect(breakdown.finalTarget).toBe(1200);
  });

  test('a restriction above the floor is honoured as the ceiling', async () => {
    const breakdown = await PBWRService.calculatePBWR(restrictedProfile(1800), 0);
    expect(breakdown.finalTarget).toBe(1800);
  });

  test('the 1500 floor still applies when no restriction is in play', async () => {
    const healthy: UserProfile = {
      age: 30,
      gender: 'Female',
      weightKg: 45,
      activityLevel: 'sedentary',
      fitnessGoal: 'optimize_health',
      waterHabit: 'moderate',
      targetDailyMl: 2000,
      workEnvironment: 'ac_office',
      medicalConditions: [],
    } as UserProfile;

    const breakdown = await PBWRService.calculatePBWR(healthy, 0);
    expect(breakdown.finalTarget).toBeGreaterThanOrEqual(1500);
  });

  test('a gated profile with no limit falls back to a cap, never above it', async () => {
    const breakdown = await PBWRService.calculatePBWR(restrictedProfile(undefined), 0);

    expect(breakdown.isPhysicianGated).toBe(true);
    expect(breakdown.physicianLimitEntered).toBe(false);
    // The safety cap stands in, and the target never exceeds it.
    expect(breakdown.finalTarget).toBeLessThanOrEqual(breakdown.upperLimit);
  });
});
