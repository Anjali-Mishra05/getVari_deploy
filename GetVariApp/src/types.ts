export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'elite';
export type FitnessGoal = 'optimize_health' | 'athletic_performance' | 'cognitive_focus' | 'weight_management';
export type HabitRating = 'low' | 'moderate' | 'high';

export interface UserProfile {
  fullName?: string;
  email?: string;
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

export type HydrationSource = 'manual' | 'wearable_prediction' | 'smart_cap' | 'ai_chat';

export interface HydrationLog {
  id: string;
  timestamp: string;
  amountMl: number; // water intake logged manually or estimated
  source: HydrationSource;
}

/** Outcome of a write through HydrationService. */
export type HydrationLogStatus =
  | 'logged'
  | 'duplicate' // same request id already written — no second row was created
  | 'unauthenticated'
  | 'error';

export interface HydrationTotals {
  /** Millilitres logged since midnight, straight from Supabase. */
  totalMl: number;
  targetMl: number;
}

export interface HydrationLogResult extends HydrationTotals {
  status: HydrationLogStatus;
  /** Idempotency key the caller supplied (or the one generated for it). */
  requestId: string;
  amountMl: number;
  entry?: HydrationLog;
  error?: string;
}

export interface HistoricalDataPoint {
  date: string; // e.g. "Mon", "Tue"
  hydrationIndex: number; // 0-100 score
  waterIntakeMl: number;
  activityCalories: number;
  heartRateAverage: number;
}

/**
 * What produced a notification. Used only to pick an icon/accent in the
 * notification centre, so an unrecognised value degrades to a neutral row
 * rather than breaking the list.
 */
export type NotificationKind = 'hydration_reminder' | 'push' | 'local';

/** One delivered notification, as shown in the bell menu. */
export interface NotificationRecord {
  /**
   * Identity of the *delivery*, shared by every event describing it. Reading
   * it from the notification's `eventId` (rather than minting one per event)
   * is what lets a press be matched back to the row it belongs to.
   */
  id: string;
  title: string;
  body: string;
  kind: NotificationKind;
  /** Epoch ms the notification was shown to the user. */
  deliveredAt: number;
  /** Epoch ms of the first tap, or `null` while it has never been opened. */
  pressedAt: number | null;
  /**
   * Epoch ms at which a *newer* notification of the same kind was opened,
   * which answers this one too.
   *
   * Reminders repeat until the user logs something, so opening the latest
   * nudge settles every earlier nudge asking the same question. Those become
   * inert rather than being marked opened — the user never touched them, and
   * the log should not claim otherwise.
   */
  supersededAt: number | null;
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
