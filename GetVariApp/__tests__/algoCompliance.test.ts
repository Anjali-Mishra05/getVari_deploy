import { HydrationRiskEngine } from '../src/utils/hydrationRiskEngine';
import { calculatePredictedRiskAfterDrink, calculateRecoveryEstimation } from '../src/utils/hydrationModel';
import { UserProfile } from '../src/types';

/**
 * Algo Compliance Test Suite
 * Verifies the implementation against the technical documentation use cases.
 */

describe('Hydration Risk Solver Compliance', () => {

  test('Use Case 1: Diabetic, Heavier Mass (85 kg) in Mumbai', () => {
    const profile: UserProfile = {
      age: 45,
      gender: 'Male',
      weightKg: 85,
      activityLevel: 'moderate',
      fitnessGoal: 'optimize_health',
      waterHabit: 'moderate',
      targetDailyMl: 2500,
      medicalConditions: ['Diabetes'],
      location: 'Mumbai'
    };

    const inputs = {
      heartRate: 90,
      activityLoad: 60,
      temperature: 30,
      humidity: 65,
      timeSinceWaterIntake: 1.5
    };

    const result = HydrationRiskEngine.solveRisk(inputs, profile);

    // Document says: Score 64 (High Risk)
    expect(result.score).toBe(64);
    expect(result.status).toBe('High Risk');

    // Intake Case 1: 250ml Drink
    const reduction = 64 - calculatePredictedRiskAfterDrink(64, 250, profile);
    const recovery = calculateRecoveryEstimation(250, profile);

    // Document says: ~15 point reduction
    expect(reduction).toBe(15);
    // Document says: 1h 20m to 1h 50m (95.6 mins base)
    expect(recovery).toBe('1h 20m to 1h 50m');
  });

  test('Use Case 2: Healthy, Standard Weight (70 kg) in London', () => {
    const profile: UserProfile = {
      age: 30,
      gender: 'Male',
      weightKg: 70,
      activityLevel: 'moderate',
      fitnessGoal: 'optimize_health',
      waterHabit: 'moderate',
      targetDailyMl: 2500,
      location: 'London'
    };

    const inputs = {
      heartRate: 90,
      activityLoad: 60,
      temperature: 18,
      humidity: 50,
      timeSinceWaterIntake: 1.5
    };

    const result = HydrationRiskEngine.solveRisk(inputs, profile);

    // Document says: Score 45 (Mild Risk)
    expect(result.score).toBe(45);
    expect(result.status).toBe('Mild Risk');
  });

  test('Use Case 3: Renal Patient (65 kg) in Bangalore', () => {
    const profile: UserProfile = {
      age: 50,
      gender: 'Male',
      weightKg: 65,
      activityLevel: 'light',
      fitnessGoal: 'optimize_health',
      waterHabit: 'moderate',
      targetDailyMl: 2500,
      medicalConditions: ['Kidney Disease'],
      location: 'Bangalore'
    };

    const inputs = {
      heartRate: 75,
      activityLoad: 15,
      temperature: 25,
      humidity: 45,
      timeSinceWaterIntake: 2.5
    };

    const result = HydrationRiskEngine.solveRisk(inputs, profile);

    // Document says: Score 37 (Mild Risk)
    expect(result.score).toBe(37);
    expect(result.status).toBe('Mild Risk');

    // Intake Case 2: 200ml Drink
    const reduction = 37 - calculatePredictedRiskAfterDrink(37, 200, profile);
    const recovery = calculateRecoveryEstimation(200, profile);

    // Document says: ~15 point reduction
    expect(reduction).toBe(15);
    // Document says: 25 to 45 mins (35 mins base)
    expect(recovery).toBe('25 to 45 mins');
  });

  test('Weight Normalization Integrity: Ensures weights sum to exactly 1.0 despite tweaks', () => {
    // We can simulate this by passing a profile that triggers many overlapping tweaks
    const extremeProfile: UserProfile = {
      age: 45,
      gender: 'Male',
      weightKg: 110, // Triggers Weight tweak (+0.05 Activity, -0.05 Time)
      activityLevel: 'elite',
      fitnessGoal: 'optimize_health',
      waterHabit: 'moderate',
      targetDailyMl: 3000,
      medicalConditions: ['Diabetes', 'Kidney Disease', 'Hypertension'], // Multiple tweaks
      location: 'Mumbai' // Climate tweak
    };

    const weights = HydrationRiskEngine.getNormalizedWeights(extremeProfile);
    const sum = weights.heart + weights.activity + weights.temp + weights.humidity + weights.time;

    // Check if the sum is exactly 1.0 (with a small margin for floating point precision)
    expect(sum).toBeCloseTo(1.0, 10);

    // Verify that solveRisk works with the extreme profile
    const inputs = { heartRate: 80, activityLoad: 50, temperature: 25, humidity: 50, timeSinceWaterIntake: 1 };
    const result = HydrationRiskEngine.solveRisk(inputs, extremeProfile);

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

});
