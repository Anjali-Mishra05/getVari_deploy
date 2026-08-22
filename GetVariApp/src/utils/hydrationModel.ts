import { SensorData, HydrationRiskDetails, UserProfile } from '../types';
import { HydrationRiskEngine } from './hydrationRiskEngine';

/**
 * Calculates physiological indicator score for heart rate.
 */
export function calculateHeartScore(heartRate: number): number {
  return HydrationRiskEngine.calculateHeartLoad(heartRate);
}

/**
 * Calculates heat score based on ambient temperature and relative humidity.
 */
export function calculateHeatScore(temperature: number, humidity: number): number {
  const tLoad = HydrationRiskEngine.calculateTemperatureLoad(temperature);
  const hLoad = HydrationRiskEngine.calculateHumidityLoad(humidity);
  // Using a combined index as a proxy for environmental heat stress
  return Math.round((tLoad * 2 + hLoad) / 3);
}

/**
 * Calculates hydration risk score from distinct physiological and environmental inputs.
 */
export function runHydrationRiskSolver(
  sensorData: Omit<SensorData, 'hydrationScore'>,
  hoursSinceDrink: number,
  activeAbsorbedHydration: number = 200,
  profile?: UserProfile
): HydrationRiskDetails {
  const engineOutput = HydrationRiskEngine.solveRisk({
    heartRate: sensorData.heartRate,
    activityLoad: sensorData.activityLoad,
    temperature: sensorData.temperature,
    humidity: sensorData.humidity,
    timeSinceWaterIntake: hoursSinceDrink
  }, profile);

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
    heartLoad: engineOutput.heartLoad,
    activityLoad: engineOutput.activityLoadScore,
    temperatureLoad: engineOutput.temperatureLoad,
    humidityLoad: engineOutput.humidityLoad,
    timeLoad: engineOutput.timeLoad
  };
}

/**
 * Predicts the recovery window (time to absorb fluid) adjusted dynamically.
 * Based on Page 4 of the Hydration Risk Solver algorithm documentation.
 */
export function calculateRecoveryEstimation(fluidMl: number, profile?: UserProfile): string {
  // Base Timeline: <= 200ml -> 25m, <= 500ml -> 75m, > 500ml -> 100m
  let baseMinutes = fluidMl <= 200 ? 25 : fluidMl <= 500 ? 75 : 100;
  let multiplier = 1.0;

  if (profile) {
    // 1. Weight Modifier: Multiplied by min(1.3, Weight/75)
    if (profile.weightKg > 75) {
      multiplier *= Math.min(1.3, profile.weightKg / 75);
    }

    // 2. Clinical Modifiers
    if (profile.medicalConditions) {
      if (profile.medicalConditions.includes('Diabetes')) multiplier *= 1.25;
      if (profile.medicalConditions.includes('Kidney Disease')) multiplier *= 1.40;
      if (profile.medicalConditions.includes('Hypertension')) multiplier *= 1.10;
    }

    // 3. Hot Climate Modifier: Multiplied by 0.90
    if (profile.location) {
      const hotCities = ['Mumbai', 'Chennai', 'Delhi', 'Jaipur', 'Hyderabad', 'Ahmedabad', 'Kolkata'];
      if (hotCities.some(city => profile.location!.includes(city))) {
        multiplier *= 0.90;
      }
    }
  }

  const finalMinutes = Math.floor(baseMinutes * multiplier);

  // Format as a range for UI display
  if (finalMinutes <= 30) {
    const start = Math.max(10, finalMinutes - 5);
    const end = finalMinutes + 5;
    return `${start} to ${end} mins`;
  }
  if (finalMinutes <= 60) {
    const start = finalMinutes - 10;
    const end = finalMinutes + 10;
    return `${start} to ${end} mins`;
  }

  const startTotal = finalMinutes - 15;
  const endTotal = finalMinutes + 15;

  const startHrs = Math.floor(startTotal / 60);
  const startMins = startTotal % 60;
  const endHrs = Math.floor(endTotal / 60);
  const endMins = endTotal % 60;

  if (startHrs === 0) {
    return `${startTotal} mins to ${endHrs}h ${endMins}m`;
  }
  return `${startHrs}h ${startMins}m to ${endHrs}h ${endMins}m`;
}

/**
 * Predicts risk score change after fluid absorption.
 * Based on Page 4 of the Hydration Risk Solver algorithm documentation.
 * Risk Reduction = Fluid (ml) * 0.08 * (70 / Weight) * Absorption Efficiency
 */
export function calculatePredictedRiskAfterDrink(
  currentRisk: number,
  fluidMl: number,
  profile?: UserProfile
): number {
  let weightFactor = profile ? (70 / profile.weightKg) : 1.0;
  let absorptionEfficiency = 1.0;

  if (profile?.medicalConditions) {
    if (profile.medicalConditions.includes('Diabetes')) {
      absorptionEfficiency = 0.90;
    }
    if (profile.medicalConditions.includes('Kidney Disease')) {
      absorptionEfficiency = 0.85;
    }
  }

  const riskReduction = fluidMl * 0.08 * weightFactor * absorptionEfficiency;
  return Math.max(0, Math.round(currentRisk - riskReduction));
}
