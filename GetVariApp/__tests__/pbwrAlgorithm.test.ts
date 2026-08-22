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
