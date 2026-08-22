import { HydrationRiskEngine } from './hydrationRiskEngine';
import { calculatePredictedRiskAfterDrink, calculateRecoveryEstimation } from './hydrationModel';
import { UserProfile } from '../types';

/**
 * Algo Compliance Test Suite
 * Verifies the implementation against the technical documentation use cases.
 */

function runTests() {
  console.log('--- HYDRATION RISK SOLVER: COMPLIANCE TEST REPORT ---\n');

  // USE CASE 1: Diabetic, Heavier Mass (85 kg) in Mumbai
  const profile1: UserProfile = {
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

  const inputs1 = {
    heartRate: 90,
    activityLoad: 60,
    temperature: 30,
    humidity: 65,
    timeSinceWaterIntake: 1.5
  };

  const result1 = HydrationRiskEngine.solveRisk(inputs1, profile1);
  console.log('USE CASE 1 (Diabetic, 85kg, Mumbai):');
  console.log(`- Inputs: HR 90, Act 60, Temp 30, Humid 65, Time 1.5h`);
  console.log(`- Calculated Risk Score: ${result1.score}`);
  console.log(`- Status Category: ${result1.status}`);
  console.log(`- Expected Score (Doc): 64`);
  console.log(`- Match: ${result1.score === 64 ? '✅ SUCCESS' : '❌ FAILED'}\n`);

  // INTAKE CASE 1: 250ml Drink for Case 1 User
  const reduction1 = 64 - calculatePredictedRiskAfterDrink(64, 250, profile1);
  const recovery1 = calculateRecoveryEstimation(250, profile1);
  console.log('INTAKE CASE 1 (250ml for Case 1 User):');
  console.log(`- Risk Reduction: ${reduction1} points`);
  console.log(`- Expected Reduction (Doc): 15 points`);
  console.log(`- Reduction Match: ${reduction1 === 15 ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`- Recovery Window: ${recovery1}`);
  console.log(`- Expected Window (Doc): 1h 20m to 1h 50m`);
  console.log(`- Window Match: ${recovery1 === '1h 20m to 1h 50m' ? '✅ SUCCESS' : '❌ FAILED'}\n`);


  // USE CASE 2: Healthy, Standard Weight (70 kg) in London
  const profile2: UserProfile = {
    age: 30,
    gender: 'Male',
    weightKg: 70,
    activityLevel: 'moderate',
    fitnessGoal: 'optimize_health',
    waterHabit: 'moderate',
    targetDailyMl: 2500,
    location: 'London'
  };

  const inputs2 = {
    heartRate: 90,
    activityLoad: 60,
    temperature: 18,
    humidity: 50,
    timeSinceWaterIntake: 1.5
  };

  const result2 = HydrationRiskEngine.solveRisk(inputs2, profile2);
  console.log('USE CASE 2 (Healthy, 70kg, London):');
  console.log(`- Inputs: HR 90, Act 60, Temp 18, Humid 50, Time 1.5h`);
  console.log(`- Calculated Risk Score: ${result2.score}`);
  console.log(`- Status Category: ${result2.status}`);
  console.log(`- Expected Score (Doc): 45`);
  console.log(`- Match: ${result2.score === 45 ? '✅ SUCCESS' : '❌ FAILED'}\n`);


  // USE CASE 3: Renal Patient (65 kg) in Bangalore
  const profile3: UserProfile = {
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

  const inputs3 = {
    heartRate: 75,
    activityLoad: 15,
    temperature: 25,
    humidity: 45,
    timeSinceWaterIntake: 2.5
  };

  const result3 = HydrationRiskEngine.solveRisk(inputs3, profile3);
  console.log('USE CASE 3 (Renal, 65kg, Bangalore):');
  console.log(`- Inputs: HR 75, Act 15, Temp 25, Humid 45, Time 2.5h`);
  console.log(`- Calculated Risk Score: ${result3.score}`);
  console.log(`- Status Category: ${result3.status}`);
  console.log(`- Expected Score (Doc): 37`);
  console.log(`- Match: ${result3.score === 37 ? '✅ SUCCESS' : '❌ FAILED'}\n`);

  // INTAKE CASE 2: 200ml Drink for Case 3 User
  const reduction2 = 37 - calculatePredictedRiskAfterDrink(37, 200, profile3);
  const recovery2 = calculateRecoveryEstimation(200, profile3);
  console.log('INTAKE CASE 2 (200ml for Case 3 User):');
  console.log(`- Risk Reduction: ${reduction2} points`);
  console.log(`- Expected Reduction (Doc): 15 points`);
  console.log(`- Reduction Match: ${reduction2 === 15 ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`- Recovery Window: ${recovery2}`);
  console.log(`- Expected Window (Doc): 25 to 45 mins`);
  console.log(`- Window Match: ${recovery2 === '25 to 45 mins' ? '✅ SUCCESS' : '❌ FAILED'}\n`);

  // NORMALIZATION CHECK
  const weights = HydrationRiskEngine.getNormalizedWeights(profile1);
  const sum = weights.heart + weights.activity + weights.temp + weights.humidity + weights.time;
  console.log('WEIGHT NORMALIZATION CHECK:');
  console.log(`- Calculated Weight Sum: ${sum.toFixed(10)}`);
  console.log(`- Expected Sum: 1.0000000000`);
  console.log(`- Match: ${Math.abs(sum - 1.0) < 1e-10 ? '✅ SUCCESS' : '❌ FAILED'}\n`);

  console.log('--- END OF COMPLIANCE REPORT ---');
}

runTests();
        