import { UserProfile } from '../types';

/**
 * Hydration Risk Engine
 * 
 * Implements the exact custom physiological and environmental risk model specified:
 * Hydration Risk = (0.30 * Heart Load) + (0.25 * Activity Load) + (0.20 * Temperature Load) + (0.10 * Humidity Load) + (0.15 * Time Load)
 */

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
  activityLoadScore: number;      // To distinguish from input key
  temperatureLoad: number;
  humidityLoad: number;
  timeLoad: number;
}

export class HydrationRiskEngine {
  /**
   * Calculates Heart Load (0-100) based on current heart rate.
   * Heart Rate < 80 bpm = 10
   * 80-100 bpm = 40
   * 100-120 bpm = 70
   * >120 bpm = 90
   */
  public static calculateHeartLoad(heartRate: number): number {
    if (heartRate < 80) return 10;
    if (heartRate <= 100) return 40;
    if (heartRate <= 120) return 70;
    return 90;
  }

  /**
   * Calculates Activity Load (0-100) based on motion sensor activity.
   * Sedentary = 10 (activityLoad < 20)
   * Walking = 40 (activityLoad 20-50)
   * Moderate Activity = 70 (activityLoad 50-80)
   * Workout / High Activity = 90 (activityLoad >= 80)
   */
  public static calculateActivityLoad(activityLoad: number): number {
    if (activityLoad < 20) return 10;
    if (activityLoad <= 50) return 40;
    if (activityLoad <= 80) return 70;
    return 90;
  }

  /**
   * Calculates Temperature Load (0-100) based on ambient temperature.
   * <22°C = 10
   * 22-28°C = 30
   * 28-32°C = 60
   * >32°C = 90
   */
  public static calculateTemperatureLoad(temperature: number): number {
    if (temperature < 22) return 10;
    if (temperature <= 28) return 30;
    if (temperature <= 32) return 60;
    return 90;
  }

  /**
   * Calculates Humidity Load (0-100) based on ambient humidity.
   * <40% = 20
   * 40-60% = 40
   * 60-75% = 70
   * >75% = 90
   */
  public static calculateHumidityLoad(humidity: number): number {
    if (humidity < 40) return 20;
    if (humidity <= 60) return 40;
    if (humidity <= 75) return 70;
    return 90;
  }

  /**
   * Calculates Time Load (0-100) based on time since last water intake.
   * <30 mins (<0.5 hrs) = 10
   * 30-60 mins (0.5 to 1.0 hrs) = 30
   * 1-2 hrs (1.0 to 2.0 hrs) = 60
   * >2 hrs (>2.0 hrs) = 90
   */
  public static calculateTimeLoad(hoursSinceDrink: number): number {
    const minutes = hoursSinceDrink * 60;
    if (minutes < 30) return 10;
    if (minutes <= 60) return 30;
    if (minutes <= 120) return 60;
    return 90;
  }

  /**
   * Computes the Hydration Risk Score using exact user weights:
   * Hydration Risk = (0.30 * Heart Load) + (0.25 * Activity Load) + (0.20 * Temperature Load) + (0.10 * Humidity Load) + (0.15 * Time Load)
   */
  public static solveRisk(
    inputs: HydrationEngineInput,
    activeAbsorbedHydration: number = 200, // Physiological buffer
    profile?: UserProfile
  ): HydrationEngineOutput {
    // Start with base weights
    let wHeart = 0.30;
    let wActivity = 0.25;
    let wTemp = 0.20;
    let wHumidity = 0.10;
    let wTime = 0.15;

    // Start with load multipliers (coefficients)
    let mHeart = 1.0;
    let mActivity = 1.0;
    let mTemp = 1.0;
    let mHumidity = 1.0;
    let mTime = 1.0;

    // Adjust parameters dynamically based on onboarding user settings
    if (profile) {
      // 1. Weight impact: Heavier weight increases exertion and impact/coefficient of Activity Load
      if (profile.weightKg > 75) {
        const weightRatio = Math.min(1.4, profile.weightKg / 75);
        mActivity *= weightRatio;
        wActivity += 0.05; // Activity load gains prominence
        wTime -= 0.05;
      }

      // 2. Pre-existing medical conditions impact
      if (profile.medicalConditions) {
        if (profile.medicalConditions.includes('Diabetes')) {
          mHeart *= 1.15; // Higher baseline cardiovascular fluid strain
          mTime *= 1.10; // Quicker dehydration penalty
          wHeart += 0.05;
          wTime += 0.05;
          wHumidity -= 0.05;
          wTemp -= 0.05;
        }
        if (profile.medicalConditions.includes('Hypertension')) {
          mHeart *= 1.10;
          wHeart += 0.05;
          wActivity -= 0.05;
        }
        if (profile.medicalConditions.includes('Kidney Disease')) {
          mTime *= 1.25; // Drastically higher sensitivity to lack of fluid intake
          wTime += 0.10;
          wHumidity -= 0.05;
          wTemp -= 0.05;
        }
        if (profile.medicalConditions.includes('Chronic Heat-Stress')) {
          mTemp *= 1.20;
          wTemp += 0.05;
          wTime -= 0.05;
        }
      }

      // 3. Location climate scaling
      if (profile.location) {
        const hotCities = ['Mumbai', 'Delhi', 'Chennai', 'Kolkata', 'Hyderabad', 'Ahmedabad', 'Jaipur'];
        if (hotCities.some(city => profile.location!.includes(city))) {
          mTemp *= 1.15; // Temperature load scales up in hot cities
          mHumidity *= 1.15; // Humidity load scales up in tropical regions
          wTemp += 0.05;
          wHumidity += 0.05;
          wTime -= 0.05;
          wActivity -= 0.05;
        }
      }
    }

    // Normalize weights to ensure they sum to exactly 1.0
    const sumWeights = wHeart + wActivity + wTemp + wHumidity + wTime;
    wHeart = wHeart / sumWeights;
    wActivity = wActivity / sumWeights;
    wTemp = wTemp / sumWeights;
    wHumidity = wHumidity / sumWeights;
    wTime = wTime / sumWeights;

    // Apply calculated coefficients (multipliers) to calculate the final loads
    const heartLoad = Math.min(100, this.calculateHeartLoad(inputs.heartRate) * mHeart);
    const activityLoadScore = Math.min(100, this.calculateActivityLoad(inputs.activityLoad) * mActivity);
    const temperatureLoad = Math.min(100, this.calculateTemperatureLoad(inputs.temperature) * mTemp);
    const humidityLoad = Math.min(100, this.calculateHumidityLoad(inputs.humidity) * mHumidity);
    const timeLoad = Math.min(100, this.calculateTimeLoad(inputs.timeSinceWaterIntake) * mTime);

    // Compute rawRisk using dynamic weights
    const rawRisk = 
      (wHeart * heartLoad) + 
      (wActivity * activityLoadScore) + 
      (wTemp * temperatureLoad) + 
      (wHumidity * humidityLoad) + 
      (wTime * timeLoad);

    // Clamp risk score strictly between 0 and 100
    const finalRisk = Math.min(100, Math.max(0, Math.round(rawRisk)));

    // Status mapping:
    // 0-25 = Hydrated
    // 26-50 = Mild Risk
    // 51-75 = High Risk
    // 76-100 = Critical
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
