import { UserProfile } from '../types';

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

export interface HydrationEngineInput {
  heartRate: number;              // BPM
  activityLoad: number;           // 0-100 active movement index
  temperature: number;            // °C ambient
  humidity: number;               // % relative humidity
  timeSinceWaterIntake: number;   // Hours since last hydration log
}

export type HydrationRiskStatus = 'Hydrated' | 'Mild Risk' | 'High Risk' | 'Critical';

export interface HydrationEngineOutput {
  score: number;                  // 0-100 Risk Score
  status: HydrationRiskStatus;    // Risk Status Category
  meaning: string;                // Physiological explanation
  suggestedAction: string;        // Clinical hydration recommendation
  glassesRequired?: number;       // Suggested glasses needed to recover
  
  // Intermediate debug and analytics load values
  heartLoad: number;
  activityLoadScore: number;
  temperatureLoad: number;
  humidityLoad: number;
  timeLoad: number;
}

export class HydrationRiskEngine {
  public static calculateHeartLoad(heartRate: number): number {
    return this.mapLoad(heartRate, RISK_CONFIG.LOAD_MAPPING.HEART_RATE);
  }

  public static calculateActivityLoad(activityLoad: number): number {
    return this.mapLoad(activityLoad, RISK_CONFIG.LOAD_MAPPING.ACTIVITY);
  }

  public static calculateTemperatureLoad(temperature: number): number {
    return this.mapLoad(temperature, RISK_CONFIG.LOAD_MAPPING.TEMPERATURE);
  }

  public static calculateHumidityLoad(humidity: number): number {
    return this.mapLoad(humidity, RISK_CONFIG.LOAD_MAPPING.HUMIDITY);
  }

  public static calculateTimeLoad(hoursSinceDrink: number): number {
    return this.mapLoad(hoursSinceDrink, RISK_CONFIG.LOAD_MAPPING.TIME_SINCE_DRINK);
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
    let w = { ...RISK_CONFIG.BASELINE_WEIGHTS };

    if (profile) {
      if (profile.weightKg > RISK_CONFIG.THRESHOLDS.WEIGHT_LIMIT) {
        w.activity += RISK_CONFIG.TWEAKS.WEIGHT.w_activity;
        w.time += RISK_CONFIG.TWEAKS.WEIGHT.w_time;
      }

      if (profile.medicalConditions) {
        if (profile.medicalConditions.includes('Diabetes')) {
          const t = RISK_CONFIG.TWEAKS.DIABETES;
          w.heart += t.w_heart;
          w.time += t.w_time;
          w.humidity += t.w_humidity;
          w.temp += t.w_temp;
        }
        if (profile.medicalConditions.includes('Kidney Disease')) {
          const t = RISK_CONFIG.TWEAKS.KIDNEY_DISEASE;
          w.time += t.w_time;
          w.humidity += t.w_humidity;
          w.temp += t.w_temp;
        }
        if (profile.medicalConditions.includes('Hypertension')) {
          w.heart += RISK_CONFIG.TWEAKS.HYPERTENSION.w_heart;
          w.activity += RISK_CONFIG.TWEAKS.HYPERTENSION.w_activity;
        }
        if (profile.medicalConditions.includes('Chronic Heat-Stress')) {
          w.temp += RISK_CONFIG.TWEAKS.CHRONIC_HEAT_STRESS.w_temp;
          w.time += RISK_CONFIG.TWEAKS.CHRONIC_HEAT_STRESS.w_time;
        }
      }

      if (profile.location) {
        const isHot = RISK_CONFIG.THRESHOLDS.HOT_CITIES.some(city => profile.location!.includes(city));
        if (isHot) {
          const t = RISK_CONFIG.TWEAKS.HOT_CLIMATE;
          w.temp += t.w_temp;
          w.humidity += t.w_humidity;
          w.time += t.w_time;
          w.activity += t.w_activity;
        }
      }
    }

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
   */
  public static solveRisk(
    inputs: HydrationEngineInput,
    profile?: UserProfile
  ): HydrationEngineOutput {
    // 1. Start with base weights and multipliers
    let w = { ...RISK_CONFIG.BASELINE_WEIGHTS };
    let m = { heart: 1.0, activity: 1.0, temp: 1.0, humidity: 1.0, time: 1.0 };

    // 2. Apply Dynamic Personalization (Adjusting m and w)
    if (profile) {
      // Weight scaling
      if (profile.weightKg > RISK_CONFIG.THRESHOLDS.WEIGHT_LIMIT) {
        m.activity = Math.min(1.4, profile.weightKg * RISK_CONFIG.TWEAKS.WEIGHT.m_activity_scale);
        w.activity += RISK_CONFIG.TWEAKS.WEIGHT.w_activity;
        w.time += RISK_CONFIG.TWEAKS.WEIGHT.w_time;
      }

      // Clinical Adjustments
      if (profile.medicalConditions) {
        if (profile.medicalConditions.includes('Diabetes')) {
          const t = RISK_CONFIG.TWEAKS.DIABETES;
          m.heart *= t.m_heart;
          m.time *= t.m_time;
          w.heart += t.w_heart;
          w.time += t.w_time;
          w.humidity += t.w_humidity;
          w.temp += t.w_temp;
        }
        if (profile.medicalConditions.includes('Kidney Disease')) {
          const t = RISK_CONFIG.TWEAKS.KIDNEY_DISEASE;
          m.time *= t.m_time;
          w.time += t.w_time;
          w.humidity += t.w_humidity;
          w.temp += t.w_temp;
        }
        if (profile.medicalConditions.includes('Hypertension')) {
          const t = RISK_CONFIG.TWEAKS.HYPERTENSION;
          m.heart *= t.m_heart;
          w.heart += t.w_heart;
          w.activity += t.w_activity;
        }
        if (profile.medicalConditions.includes('Chronic Heat-Stress')) {
          const t = RISK_CONFIG.TWEAKS.CHRONIC_HEAT_STRESS;
          m.temp *= t.m_temp;
          w.temp += t.w_temp;
          w.time += t.w_time;
        }
      }

      // Hot Climates
      if (profile.location) {
        const isHot = RISK_CONFIG.THRESHOLDS.HOT_CITIES.some(city => profile.location!.includes(city));
        if (isHot) {
          const t = RISK_CONFIG.TWEAKS.HOT_CLIMATE;
          m.temp *= t.m_temp;
          m.humidity *= t.m_humidity;
          w.temp += t.w_temp;
          w.humidity += t.w_humidity;
          w.time += t.w_time;
          w.activity += t.w_activity;
        }
      }
    }

    // 3. Normalize Weights so their sum equals exactly 1.0
    const sumWeights = w.heart + w.activity + w.temp + w.humidity + w.time;
    const wNorm = {
      heart: w.heart / sumWeights,
      activity: w.activity / sumWeights,
      temp: w.temp / sumWeights,
      humidity: w.humidity / sumWeights,
      time: w.time / sumWeights,
    };

    // 4. Calculate Adjusted Loads (Clamped at 100)
    const heartLoad = Math.min(100, this.calculateHeartLoad(inputs.heartRate) * m.heart);
    const activityLoadScore = Math.min(100, this.calculateActivityLoad(inputs.activityLoad) * m.activity);
    const temperatureLoad = Math.min(100, this.calculateTemperatureLoad(inputs.temperature) * m.temp);
    const humidityLoad = Math.min(100, this.calculateHumidityLoad(inputs.humidity) * m.humidity);
    const timeLoad = Math.min(100, this.calculateTimeLoad(inputs.timeSinceWaterIntake) * m.time);

    // 5. Final Linear Combination
    const rawRisk = 
      (wNorm.heart * heartLoad) +
      (wNorm.activity * activityLoadScore) +
      (wNorm.temp * temperatureLoad) +
      (wNorm.humidity * humidityLoad) +
      (wNorm.time * timeLoad);

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
      activityLoadScore,
      temperatureLoad,
      humidityLoad,
      timeLoad
    };
  }
}
