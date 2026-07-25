export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'elite';
export type FitnessGoal = 'optimize_health' | 'athletic_performance' | 'cognitive_focus' | 'weight_management';
export type HabitRating = 'low' | 'moderate' | 'high';

export interface UserProfile {
  age: number;
  gender: string;
  weightKg: number;
  activityLevel: ActivityLevel;
  fitnessGoal: FitnessGoal;
  waterHabit: HabitRating;
  targetDailyMl: number;
  medicalConditions?: string[];
  location?: string;
  latitude?: number;
  longitude?: number;
}

export type ConnectionState = 'connected' | 'syncing' | 'disconnected' | 'low_battery';

export interface WearableDevice {
  id: string;
  name: string;
  type: 'health_kit' | 'health_connect' | 'samsung_health' | 'getvari_hardware';
  connected: boolean;
  batteryLevel?: number;
  lastSynced?: string;
}

export interface SensorData {
  heartRate: number; // bpm
  activityLoad: number; // 0-100 score of active movement
  temperature: number; // °C ambient or skin, let's represent both
  humidity: number; // % relative humidity
  sweatGSR: number; // microsiemens simulated electrodermal sweat rate
  hydrationScore: number; // 0-100 calculated score (100 is fully hydrated, 0 is critical)
  batteryLevel: number; // wearable battery %
  rssi: number; // Bluetooth signal strength (-100 to -30 dBm)
  lastUpdated: string; // ISO string
}

export interface HydrationRiskDetails {
  score: number; // 0 - 100 Risk Score
  status: 'Hydrated' | 'Mild Risk' | 'High Risk' | 'Critical';
  color: string;
  bgColor: string;
  textGlow: string;
  meaning: string;
  suggestedAction: string;
  glassesRequired?: number;
  heartLoad: number;
  activityLoad: number;
  temperatureLoad: number;
  humidityLoad: number;
  timeLoad: number;
}

export interface HydrationLog {
  id: string;
  timestamp: string;
  amountMl: number; // water intake logged manually or estimated
  source: 'manual' | 'wearable_prediction' | 'smart_cap';
}

export interface HistoricalDataPoint {
  date: string; // e.g. "Mon", "Tue"
  hydrationIndex: number; // 0-100 score
  waterIntakeMl: number;
  activityCalories: number;
  heartRateAverage: number;
}

export interface SmartAlert {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'critical' | 'goal_achievement';
  read: boolean;
}

export interface AIInsight {
  id: string;
  category: 'hydration' | 'activity' | 'temperature' | 'recovery';
  title: string;
  text: string;
  timestamp: string;
  source: 'rule_engine' | 'gemini_brain';
}
