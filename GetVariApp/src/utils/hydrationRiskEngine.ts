import { UserProfile } from '../types';
import AppConfigStore from '../config/appConfigStore';
import { climateBandFor } from './hydrationTarget';

/**
 * Hydration Risk Engine Configuration
 * Centralized source of truth for every threshold, multiplier, and weight tweak.
 */
export const RISK_CONFIG = {
  BASELINE_WEIGHTS: {
    heart: 0.30,
    activity: 0.25,
    temp: 0.20,
    humidity: 0.10,
    time: 0.15,
  },
  THRESHOLDS: {
    WEIGHT_LIMIT: 75, // kg
    HOT_CITIES: ['Mumbai', 'Chennai', 'Delhi', 'Jaipur', 'Hyderabad', 'Ahmedabad', 'Kolkata'],
  },
  LOAD_MAPPING: {
    HEART_RATE: [
      { min: 0, max: 80, load: 10 },
      { min: 80, max: 100, load: 40 },
      { min: 100, max: 120, load: 70 },
      { min: 120, max: 999, load: 90 },
    ],
    ACTIVITY: [
      { min: 0, max: 20, load: 10 },
      { min: 20, max: 50, load: 40 },
      { min: 50, max: 80, load: 70 },
      { min: 80, max: 999, load: 90 },
    ],
    TEMPERATURE: [
      { min: -99, max: 22, load: 10 },
      { min: 22, max: 28, load: 30 },
      { min: 28, max: 32, load: 60 },
      { min: 32, max: 999, load: 90 },
    ],
    HUMIDITY: [
      { min: 0, max: 40, load: 20 },
      { min: 40, max: 60, load: 40 },
      { min: 60, max: 75, load: 70 },
      { min: 75, max: 101, load: 90 },
    ],
    TIME_SINCE_DRINK: [
      { min: 0, max: 0.5, load: 10 }, // < 30m
      { min: 0.5, max: 1.0, load: 30 }, // 30-60m
      { min: 1.0, max: 2.0, load: 60 }, // 1-2h
      { min: 2.0, max: 999, load: 90 }, // > 2h
    ],
  },
  TWEAKS: {
    WEIGHT: {
      m_activity_scale: 1.0 / 75, // min(1.4, Weight/75)
      w_activity: 0.05,
      w_time: -0.05,
    },
    DIABETES: {
      m_heart: 1.15,
      m_time: 1.10,
      w_heart: 0.05,
      w_time: 0.05,
      w_humidity: -0.05,
      w_temp: -0.05,
    },
    KIDNEY_DISEASE: {
      m_time: 1.25,
      w_time: 0.10,
      w_humidity: -0.05,
      w_temp: -0.05,
    },
    HYPERTENSION: {
      m_heart: 1.10,
      w_heart: 0.05,
      w_activity: -0.05,
    },
    CHRONIC_HEAT_STRESS: {
      m_temp: 1.20,
      w_temp: 0.05,
      w_time: -0.05,
    },
    HOT_CLIMATE: {
      m_temp: 1.15,
      m_humidity: 1.15,
      w_temp: 0.05,
      w_humidity: 0.05,
      w_time: -0.05,
      w_activity: -0.05,
    },
  },
};

/** The five load channels the engine weighs. */
type Channel = 'heart' | 'activity' | 'temp' | 'humidity' | 'time';
type Channels = Record<Channel, number>;

const CHANNELS: Channel[] = ['heart', 'activity', 'temp', 'humidity', 'time'];

/**
 * Applies every diagnosis- and climate-driven adjustment to the weights and
 * load multipliers, in one place.
 *
 * This used to be written out twice — once in `getNormalizedWeights` and once
 * in `solveRisk` — and both copies matched conditions by their *display name*
 * (`'Kidney Disease'`), while onboarding has always stored ids (`'ckd'`). The
 * result was that no clinical adjustment had ever actually fired. Reading the
 * ids from the shared config removes both the duplication and the mismatch.
 */
const applyProfileTweaks = (w: Channels, m: Channels, profile?: UserProfile): void => {
  if (!profile) return;

  if (profile.weightKg > RISK_CONFIG.THRESHOLDS.WEIGHT_LIMIT) {
    m.activity = Math.min(1.4, profile.weightKg * RISK_CONFIG.TWEAKS.WEIGHT.m_activity_scale);
    w.activity += RISK_CONFIG.TWEAKS.WEIGHT.w_activity;
    w.time += RISK_CONFIG.TWEAKS.WEIGHT.w_time;
  }

  for (const condition of AppConfigStore.conditionsFor(profile.medicalConditions)) {
    for (const channel of CHANNELS) {
      w[channel] += condition.riskWeightDeltas?.[channel] ?? 0;
      m[channel] *= condition.riskLoadMultipliers?.[channel] ?? 1;
    }
  }

  const band = climateBandFor(profile.location ?? profile.selectedCity);
  if (band) {
    m.temp *= band.riskLoadMultiplier ?? 1;
    m.humidity *= band.riskLoadMultiplier ?? 1;
    for (const channel of CHANNELS) {
      w[channel] += band.riskWeightDeltas?.[channel] ?? 0;
    }
  }
};

export interface HydrationEngineInput {
  heartRate: number | null;              // BPM
  activityLoad: number | null;           // 0-100 active movement index
  temperature: number | null;            // °C ambient
  humidity: number | null;               // % relative humidity
  timeSinceWaterIntake: number | null;   // Hours since last hydration log
}

export type HydrationRiskStatus = 'Hydrated' | 'Mild Risk' | 'High Risk' | 'Critical' | 'Insufficient Data' | 'Device Error';

export interface HydrationEngineOutput {
  score: number | null;                  // 0-100 Risk Score, null if insufficient data
  status: HydrationRiskStatus;    // Risk Status Category
  meaning: string;                // Physiological explanation
  suggestedAction: string;        // Clinical hydration recommendation
  glassesRequired?: number;       // Suggested glasses needed to recover
  
  // Intermediate debug and analytics load values
  heartLoad: number | null;
  /**
   * Named to match `HydrationRiskDetails.activityLoad`, which is what every
   * consumer indexes into. It was `activityLoad` here and `activityLoad`
   * there, and the dashboard reads the engine's output directly — so
   * `risk.activityLoad` was `undefined`, `Math.round(undefined)` was `NaN`,
   * and the Activity tile in the risk breakdown printed "NaN". The insight
   * generator had the same mismatch, which is why "sustained physical
   * exertion" could never be reported as the dominant driver.
   */
  activityLoad: number | null;
  temperatureLoad: number | null;
  humidityLoad: number | null;
  timeLoad: number | null;
}

export class HydrationRiskEngine {
  public static calculateHeartLoad(heartRate: number | null): number | null {
    if (heartRate === null) return null;
    return this.mapLoad(heartRate, RISK_CONFIG.LOAD_MAPPING.HEART_RATE);
  }

  public static calculateActivityLoad(activityLoad: number | null): number | null {
    if (activityLoad === null) return null;
    return this.mapLoad(activityLoad, RISK_CONFIG.LOAD_MAPPING.ACTIVITY);
  }

  public static calculateTemperatureLoad(temperature: number | null): number | null {
    if (temperature === null) return null;
    return this.mapLoad(temperature, RISK_CONFIG.LOAD_MAPPING.TEMPERATURE);
  }

  public static calculateHumidityLoad(humidity: number | null): number | null {
    if (humidity === null) return null;
    return this.mapLoad(humidity, RISK_CONFIG.LOAD_MAPPING.HUMIDITY);
  }

  public static calculateTimeLoad(hoursSinceDrink: number | null): number | null {
    if (hoursSinceDrink === null) return null;
    const minutes = hoursSinceDrink * 60;
    if (minutes <= 30) return 10;
    if (minutes <= 60) return 30;
    if (minutes <= 120) return 60;
    return 90;
  }

  private static mapLoad(value: number, ranges: { min: number; max: number; load: number }[]): number {
    for (const range of ranges) {
      if (value >= range.min && value < range.max) return range.load;
    }
    return ranges[ranges.length - 1].load;
  }

  /**
   * Helper for testing and verification.
   * Returns the normalized weights for a given user profile.
   */
  public static getNormalizedWeights(profile?: UserProfile): { heart: number; activity: number; temp: number; humidity: number; time: number } {
    const w: Channels = { ...RISK_CONFIG.BASELINE_WEIGHTS };
    // Multipliers are irrelevant to a weight query, but the tweaks are applied
    // as one unit so this can never disagree with `solveRisk`.
    const m: Channels = { heart: 1, activity: 1, temp: 1, humidity: 1, time: 1 };
    applyProfileTweaks(w, m, profile);

    const sum = w.heart + w.activity + w.temp + w.humidity + w.time;
    return {
      heart: w.heart / sum,
      activity: w.activity / sum,
      temp: w.temp / sum,
      humidity: w.humidity / sum,
      time: w.time / sum,
    };
  }

  /**
   * Computes the Hydration Risk Score using exact user weights and personal multipliers.
   * Handles "Missing != Zero" with 7-day valid history fallback.
   */
  public static solveRisk(
    inputs: HydrationEngineInput,
    profile?: UserProfile,
    historicalAverages?: { avgHR: number | null; avgSteps: number | null; avgTemp: number | null; avgHumidity: number | null }
  ): HydrationEngineOutput {
    // 1. Determine base metrics with fallback to historical data if real-time is missing/stale
    const heartRate = inputs.heartRate ?? historicalAverages?.avgHR ?? null;
    // The raw 0-100 movement index, before it is mapped to a load band. Named
    // apart from `activityLoad` below, which is the mapped result.
    const activityIndex = inputs.activityLoad ?? (historicalAverages?.avgSteps ? Math.min(100, (historicalAverages.avgSteps / 10000) * 80) : null);
    const temperature = inputs.temperature ?? historicalAverages?.avgTemp ?? null;
    const humidity = inputs.humidity ?? historicalAverages?.avgHumidity ?? null;
    const timeSinceWaterIntake = inputs.timeSinceWaterIntake; // No historical fallback for delay

    const heartLoad = this.calculateHeartLoad(heartRate);
    const activityLoad = this.calculateActivityLoad(activityIndex);
    const temperatureLoad = this.calculateTemperatureLoad(temperature);
    const humidityLoad = this.calculateHumidityLoad(humidity);
    const timeLoad = this.calculateTimeLoad(timeSinceWaterIntake);

    // If core metrics are missing even after historical fallback, we report insufficient data.
    const missingCount = [heartLoad, activityLoad, temperatureLoad, humidityLoad, timeLoad].filter(l => l === null).length;

    if (missingCount >= 2) {
      return {
        score: null,
        status: 'Insufficient Data',
        meaning: 'Not enough valid sensor or historical data to calculate a reliable score.',
        suggestedAction: 'Ensure your wearable is connected or wait for more history to accumulate.',
        heartLoad,
        activityLoad,
        temperatureLoad,
        humidityLoad,
        timeLoad
      };
    }

    // --- Device Error Detection ---
    // If readings are physically impossible (per configuration), flag error.
    if (inputs.heartRate !== null && (inputs.heartRate > 220 || inputs.heartRate < 30)) {
       return {
         score: null,
         status: 'Device Error',
         meaning: 'Abnormal sensor readings detected. Your wearable may be damaged or incorrectly worn.',
         suggestedAction: 'Inspect your device for water or physical damage.',
         heartLoad, activityLoad, temperatureLoad, humidityLoad, timeLoad
       };
    }

    // 2. Base weights and multipliers, personalised in one shared step so the
    //    published weights and the solve can never disagree.
    const w: Channels = { ...RISK_CONFIG.BASELINE_WEIGHTS };
    const m: Channels = { heart: 1.0, activity: 1.0, temp: 1.0, humidity: 1.0, time: 1.0 };
    applyProfileTweaks(w, m, profile);

    // 3. Normalize Weights (only for available metrics)
    let sumWeights = 0;
    if (heartLoad !== null) sumWeights += w.heart;
    if (activityLoad !== null) sumWeights += w.activity;
    if (temperatureLoad !== null) sumWeights += w.temp;
    if (humidityLoad !== null) sumWeights += w.humidity;
    if (timeLoad !== null) sumWeights += w.time;

    if (sumWeights === 0) {
       return { score: null, status: 'Insufficient Data', meaning: 'Insufficient valid data.', suggestedAction: 'Check sensors.', heartLoad, activityLoad, temperatureLoad, humidityLoad, timeLoad };
    }

    const wNorm = {
      heart: heartLoad !== null ? w.heart / sumWeights : 0,
      activity: activityLoad !== null ? w.activity / sumWeights : 0,
      temp: temperatureLoad !== null ? w.temp / sumWeights : 0,
      humidity: humidityLoad !== null ? w.humidity / sumWeights : 0,
      time: timeLoad !== null ? w.time / sumWeights : 0,
    };

    // 4. Calculate Adjusted Loads (Clamped at 100)
    const adjHeart = heartLoad !== null ? Math.min(100, heartLoad * m.heart) : 0;
    const adjActivity = activityLoad !== null ? Math.min(100, activityLoad * m.activity) : 0;
    const adjTemp = temperatureLoad !== null ? Math.min(100, temperatureLoad * m.temp) : 0;
    const adjHumid = humidityLoad !== null ? Math.min(100, humidityLoad * m.humidity) : 0;
    const adjTime = timeLoad !== null ? Math.min(100, timeLoad * m.time) : 0;

    // 5. Final Linear Combination
    const rawRisk = 
      (wNorm.heart * adjHeart) +
      (wNorm.activity * adjActivity) +
      (wNorm.temp * adjTemp) +
      (wNorm.humidity * adjHumid) +
      (wNorm.time * adjTime);

    const finalRisk = Math.min(100, Math.max(0, Math.round(rawRisk)));

    // 6. Map to Categories
    let status: HydrationRiskStatus;
    let meaning = '';
    let suggestedAction = '';
    let glassesRequired: number | undefined;

    if (finalRisk <= 25) {
      status = 'Hydrated';
      meaning = 'Body signals appear stable. Hydration levels are likely sufficient.';
      suggestedAction = 'Maintain current healthy beverage routing habits.';
    } else if (finalRisk <= 50) {
      status = 'Mild Risk';
      meaning = 'Early signs of dehydration risk detected based on activity, heart rate, environmental conditions, or prolonged hydration gap.';
      suggestedAction = 'Drink water soon.';
      glassesRequired = 1;
    } else if (finalRisk <= 75) {
      status = 'High Risk';
      meaning = 'Multiple physiological and environmental indicators suggest increasing dehydration probability.';
      suggestedAction = 'Hydrate immediately and reduce exertion if needed.';
      glassesRequired = 2;
    } else {
      status = 'Critical';
      meaning = 'High strain, prolonged hydration gap, elevated activity or heat load detected. Potential significant dehydration risk.';
      suggestedAction = 'Immediate hydration recommended. Rest and recover if symptoms persist.';
      glassesRequired = Math.min(5, Math.max(3, Math.round((finalRisk * 4) / 80)));
    }

    return {
      score: finalRisk,
      status,
      meaning,
      suggestedAction,
      glassesRequired,
      heartLoad,
      activityLoad,
      temperatureLoad,
      humidityLoad,
      timeLoad
    };
  }
}
