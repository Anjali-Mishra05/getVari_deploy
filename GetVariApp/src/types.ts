import type { SleepSchedule } from './utils/sleepWindow';

export type WorkEnvironment = 'indoor' | 'ac_office' | 'hybrid' | 'outdoor' | 'heavy_outdoor';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'elite';
export type FitnessGoal = 'optimize_health' | 'athletic_performance' | 'cognitive_focus' | 'weight_management';
export type HabitRating = 'low' | 'moderate' | 'high';

export type MockTelemetryProfile = 'sedentary' | 'active' | 'heat_stress' | 'balanced' | 'critical_risk';

export type { SleepSchedule };

export interface UserProfile {
  fullName?: string;
  email?: string;
  age: number;
  gender: string;
  weightKg: number;
  activityLevel: ActivityLevel;
  fitnessGoal: FitnessGoal;
  workEnvironment: WorkEnvironment;
  physicianLimitMl?: number;
  waterHabit: HabitRating;
  targetDailyMl: number;
  medicalConditions?: string[];
  /** Per-notification-type cooldown timestamps (epoch ms). */
  lastAlertsSent?: Record<string, number>;
  /** Timestamp of the last weekly summary (YYYY-MM-DD). */
  lastWeeklySummaryDate?: string;
  /** City chosen for the climate model. Mirrored into `location` on save. */
  selectedCity?: string;
  /**
   * When this account first saved a profile (ISO 8601).
   *
   * PBWR uses it to decide whether the user is still inside their 7-day
   * calibration window. Stamped once, on the first save, and never rewritten.
   */
  accountCreatedAt?: string;
  /** Approximate nightly sleep window, captured during onboarding. */
  sleepSchedule?: SleepSchedule;
  /** Waking hours implied by `sleepSchedule` — the denominator for averages. */
  awakeHoursPerDay?: number;
  location?: string;
  latitude?: number;
  longitude?: number;
}

export type ConnectionState =
  | 'connected'
  | 'syncing'
  | 'disconnected'
  | 'low_battery'
  | 'offline'
  | 'status_unknown'
  | 'device_error'
  | 'charging'
  | 'fully_charged';

export interface WearableDevice {
  id: string;
  name: string;
  type: 'health_kit' | 'health_connect' | 'samsung_health' | 'getvari_hardware';
  connected: boolean;
  batteryLevel?: number;
  lastSynced?: string;
  isCharging?: boolean;
}

export interface SensorData {
  heartRate: number | null; // bpm, null if missing/invalid
  steps: number | null; // cumulative or interval steps, null if missing/invalid
  activityLoad: number | null; // 0-100 score of active movement, null if missing/invalid
  temperature: number | null; // °C ambient or skin, null if missing/invalid
  humidity: number | null; // % relative humidity, null if missing/invalid
  sweatGSR: number | null; // microsiemens, null if missing/invalid
  hydrationScore: number; // 0-100 calculated score (100 is fully hydrated, 0 is critical)
  batteryLevel: number | null; // wearable battery %, null if missing/invalid
  rssi: number | null; // Bluetooth signal strength, null if missing/invalid
  lastUpdated: string; // ISO string
}

export interface HydrationRiskDetails {
  score: number | null; // 0 - 100 Risk Score, null if insufficient data
  status: 'Hydrated' | 'Mild Risk' | 'High Risk' | 'Critical' | 'Insufficient Data' | 'Device Error';
  color: string;
  bgColor: string;
  textGlow: string;
  meaning: string;
  suggestedAction: string;
  glassesRequired?: number;
  heartLoad: number | null;
  activityLoad: number | null;
  temperatureLoad: number | null;
  humidityLoad: number | null;
  timeLoad: number | null;
}

export type HydrationSource =
  | 'manual'
  | 'wearable_prediction'
  | 'smart_cap'
  | 'ai_chat'
  /**
   * A negative entry that takes back an over-log. Kept as its own row rather
   * than by editing or deleting the original, so the day's history stays an
   * append-only record of what the user actually told the app and when.
   */
  | 'correction';
export type VerificationSource = 'user-reported' | 'sensor-verified';

export interface HydrationLog {
  id: string;
  timestamp: string; // creation timestamp
  reportedAt?: string; // actual intake timestamp for backdating
  amountMl: number; // water intake logged manually or estimated
  source: HydrationSource;
  verificationSource?: VerificationSource;
  syncedToCloud?: boolean;
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
