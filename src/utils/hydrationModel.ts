import { SensorData, HydrationRiskDetails, UserProfile } from '../types';
import { HydrationRiskEngine } from './hydrationRiskEngine';

/**
 * Calculates physiological physiological indicator score for heart rate.
 * Lower baseline (e.g. 60-70 bpm) -> lower stress score. High bpm -> higher sweat stress.
 */
export function calculateHeartScore(heartRate: number): number {
  return HydrationRiskEngine.calculateHeartLoad(heartRate);
}

/**
 * Calculates heat score based on ambient temperature and relative humidity.
 * Elevating temp and high humidity prevents convective/evaporative cooling, amplifying fluid loss.
 */
export function calculateHeatScore(temperature: number, humidity: number): number {
  return Math.round((HydrationRiskEngine.calculateTemperatureLoad(temperature) * 2 + HydrationRiskEngine.calculateHumidityLoad(humidity)) / 3);
}

/**
 * Calculates hydration risk score from distinct physiological and environmental inputs,
 * leveraging the unified HydrationRiskEngine core.
 * 
 * Returns full details for front-end styling and alert status.
 */
export function runHydrationRiskSolver(
  sensorData: Omit<SensorData, 'hydrationScore'>,
  hoursSinceDrink: number,
  activeAbsorbedHydration: number = 200,
  profile?: UserProfile
): HydrationRiskDetails {
  // Delegate mathematical solution directly to the newly implemented HydrationRiskEngine
  const engineOutput = HydrationRiskEngine.solveRisk({
    heartRate: sensorData.heartRate,
    activityLoad: sensorData.activityLoad,
    temperature: sensorData.temperature,
    humidity: sensorData.humidity,
    timeSinceWaterIntake: hoursSinceDrink
  }, activeAbsorbedHydration, profile);

  // Map engine status directly to gorgeous premium design tokens
  let color = 'from-emerald-400 to-teal-500';
  let bgColor = 'bg-emerald-500/10';
  let textGlow = 'shadow-emerald-500/40 text-emerald-400';

  switch (engineOutput.status) {
    case 'Hydrated':
      color = 'from-emerald-400 to-teal-500';
      bgColor = 'bg-emerald-500/10';
      textGlow = 'shadow-emerald-500/40 text-emerald-400';
      break;
    case 'Mild Risk':
      color = 'from-yellow-400 to-amber-500';
      bgColor = 'bg-amber-500/10';
      textGlow = 'shadow-amber-500/40 text-amber-400';
      break;
    case 'High Risk':
      color = 'from-orange-500 to-rose-400';
      bgColor = 'bg-orange-500/10';
      textGlow = 'shadow-orange-500/40 text-orange-400';
      break;
    case 'Critical':
      color = 'from-red-600 to-rose-600';
      bgColor = 'bg-red-500/20';
      textGlow = 'shadow-red-600/50 text-red-500 font-bold animate-pulse';
      break;
  }

  return {
    score: engineOutput.score,
    status: engineOutput.status,
    color,
    bgColor,
    textGlow,
    meaning: engineOutput.meaning,
    suggestedAction: engineOutput.suggestedAction,
    glassesRequired: engineOutput.glassesRequired,
    // Intermediate Loads
    heartLoad: engineOutput.heartLoad,
    activityLoad: engineOutput.activityLoadScore,
    temperatureLoad: engineOutput.temperatureLoad,
    humidityLoad: engineOutput.humidityLoad,
    timeLoad: engineOutput.timeLoad
  };
}

/**
 * Predicts the recovery window (time to absorb fluid) adjusted dynamically by weight, climate, and medical conditions.
 */
export function calculateRecoveryEstimation(fluidMl: number, profile?: UserProfile): string {
  let baseMinutes = fluidMl <= 200 ? 25 : fluidMl <= 500 ? 75 : 100;
  let multiplier = 1.0;

  if (profile) {
    // 1. Weight impact
    if (profile.weightKg > 75) {
      multiplier *= Math.min(1.3, profile.weightKg / 75);
    }
    // 2. Medical Conditions
    if (profile.medicalConditions) {
      if (profile.medicalConditions.includes('Diabetes')) multiplier *= 1.25; // Osmotic shift delay
      if (profile.medicalConditions.includes('Kidney Disease')) multiplier *= 1.40; // Dialed down clearance rate
      if (profile.medicalConditions.includes('Hypertension')) multiplier *= 1.10;
    }
    // 3. Location Climate impact
    if (profile.location) {
      const hotCities = ['Mumbai', 'Delhi', 'Chennai', 'Kolkata', 'Hyderabad', 'Ahmedabad', 'Jaipur'];
      if (hotCities.some(city => profile.location!.includes(city))) {
        multiplier *= 0.90; // Hot environments draw fluid into blood faster due to vasodilation
      }
    }
  }

  const finalMinutes = Math.round(baseMinutes * multiplier);
  if (finalMinutes <= 30) {
    return `${Math.max(10, finalMinutes - 5)}-${finalMinutes + 5} mins`;
  }
  if (finalMinutes <= 60) {
    return `${finalMinutes - 10}-${finalMinutes + 10} mins`;
  }
  const startHrs = Math.floor((finalMinutes - 15) / 60);
  const startMins = (finalMinutes - 15) % 60;
  const endHrs = Math.floor((finalMinutes + 15) / 60);
  const endMins = (finalMinutes + 15) % 60;
  
  if (startHrs === 0) {
    return `${finalMinutes - 15} mins to ${endHrs}h ${endMins}m`;
  }
  return `${startHrs}h ${startMins}m to ${endHrs}h ${endMins}m`;
}

/**
 * Predicts risk score change after fluid absorption, taking weight and health stats into account.
 */
export function calculatePredictedRiskAfterDrink(
  currentRisk: number,
  fluidMl: number,
  profile?: UserProfile
): number {
  let weightFactor = 1.0;
  let absorptionEfficiency = 1.0;

  if (profile) {
    weightFactor = 70 / profile.weightKg; // Standardized to 70kg baseline
    if (profile.medicalConditions) {
      if (profile.medicalConditions.includes('Diabetes')) {
        absorptionEfficiency = 0.90; // Reduced absorption rate efficiency due to high osmotic pressure
      }
      if (profile.medicalConditions.includes('Kidney Disease')) {
        absorptionEfficiency = 0.85; // Strict bounds on circulation volume expansion
      }
    }
  }

  const riskReduction = fluidMl * 0.08 * weightFactor * absorptionEfficiency;
  return Math.max(0, Math.round(currentRisk - riskReduction));
}
