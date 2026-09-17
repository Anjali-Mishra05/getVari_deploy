import { HydrationRiskEngine } from './hydrationRiskEngine';

export type FDIClassification = 'Focused' | 'Focus Slipping' | 'Focus Lost';
export type CDIClassification = 'Cognitively Sharp' | 'Cognitive Decline Risk' | 'Cognitive Impairment Risk';

export function calculateTTLLoad(minutesSinceLastSignificantMotion: number | null | undefined): number {
  if (minutesSinceLastSignificantMotion === null || minutesSinceLastSignificantMotion === undefined) {
    return Number.NaN;
  }

  const minutes = Number(minutesSinceLastSignificantMotion);
  if (!Number.isFinite(minutes)) {
    return Number.NaN;
  }

  if (minutes <= 15) return 10;
  if (minutes <= 30) return 25;
  if (minutes <= 45) return 45;
  if (minutes <= 60) return 60;
  if (minutes <= 90) return 80;
  return 95;
}

export function calculateCircadianLoad(now: Date = new Date()): number {
  const minutes = now.getHours() * 60 + now.getMinutes();

  if (minutes >= 4 * 60 && minutes < 7 * 60) return 90;
  if (minutes >= 7 * 60 && minutes < 10 * 60) return 65;
  if (minutes >= 10 * 60 && minutes < 14 * 60) return 15;
  if (minutes >= 14 * 60 && minutes < 16 * 60) return 60;
  if (minutes >= 16 * 60 && minutes < 22 * 60) return 20;
  return 85;
}

export function calculateThermalLoad(temperatureLoad: number | null | undefined, humidityLoad: number | null | undefined): number {
  const temp = typeof temperatureLoad === 'number' ? temperatureLoad : 0;
  const humidity = typeof humidityLoad === 'number' ? humidityLoad : 0;
  return Math.min(100, Math.max(0, (temp + humidity) / 2));
}

export function calculateFDI(dl: number | null | undefined, ttlMinutesSinceSignificantMotion: number | null | undefined): number {
  const dehydrationLoad = typeof dl === 'number' ? dl : 0;
  const ttl = calculateTTLLoad(ttlMinutesSinceSignificantMotion);
  if (!Number.isFinite(ttl)) {
    return Number.NaN;
  }
  return Number(((0.60 * dehydrationLoad) + (0.40 * ttl)).toFixed(2));
}

export function calculateCDI(
  dl: number | null | undefined,
  temperatureLoad: number | null | undefined,
  humidityLoad: number | null | undefined,
  now: Date = new Date(),
): number {
  const dehydrationLoad = typeof dl === 'number' ? dl : 0;
  const thermalLoad = calculateThermalLoad(temperatureLoad, humidityLoad);
  const circadianLoad = calculateCircadianLoad(now);
  return Number(((0.55 * dehydrationLoad) + (0.25 * thermalLoad) + (0.20 * circadianLoad)).toFixed(2));
}

export function classifyFDI(score: number): FDIClassification {
  if (score >= 60) return 'Focus Lost';
  if (score >= 25) return 'Focus Slipping';
  return 'Focused';
}

export function classifyCDI(score: number): CDIClassification {
  if (score >= 60) return 'Cognitive Impairment Risk';
  if (score >= 25) return 'Cognitive Decline Risk';
  return 'Cognitively Sharp';
}

export function getHydrationDerivedFdiState(
  dl: number | null | undefined,
  temperatureLoad: number | null | undefined,
  humidityLoad: number | null | undefined,
  lastSignificantMotionMinutesAgo: number | null | undefined,
  now: Date = new Date(),
) {
  const fdiScore = calculateFDI(dl, lastSignificantMotionMinutesAgo);
  const cdiScore = calculateCDI(dl, temperatureLoad, humidityLoad, now);

  return {
    fdiScore,
    fdiClassification: classifyFDI(fdiScore),
    cdiScore,
    cdiClassification: classifyCDI(cdiScore),
  };
}

export function getHydrationLoadValues(
  riskScore: number | null | undefined,
  temperature: number | null | undefined,
  humidity: number | null | undefined,
) {
  const dehydrationLoad = typeof riskScore === 'number' ? riskScore : 0;
  return {
    dehydrationLoad,
    temperatureLoad: temperature === null || temperature === undefined ? 0 : HydrationRiskEngine.calculateTemperatureLoad(temperature),
    humidityLoad: humidity === null || humidity === undefined ? 0 : HydrationRiskEngine.calculateHumidityLoad(humidity),
  };
}
