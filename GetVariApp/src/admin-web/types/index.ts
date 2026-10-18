import type { HydrationRiskStatus } from '../../utils/hydrationRiskEngine';
import type { UserClock } from '../utils/userClock';

export type Workload = 'Office' | 'Commuter' | 'Gym' | 'Field';

/** The app's own status labels, including the two that carry no score. */
export type RiskStatus = HydrationRiskStatus;
export type LogType = 'info' | 'success' | 'warn' | 'error';
export type AlertType = 'critical' | 'warn' | 'info';

/** One row of `getvari_hydration_logs`, as the app's feed shows it. */
export interface WaterEntry {
  id: string;
  /** "14:05" on the user's clock. */
  time: string;
  timestamp: string;
  /** Negative for a correction. */
  amount: number;
  source: string;
  isCorrection: boolean;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  age: number;
  gender: string;
  weightKg: number;
  workload: Workload;
  /** The app's simulated readings at their baseline for this profile. */
  heartRate: number;
  activityLoad: number;
  temperature: number;
  humidity: number;
  batteryLevel: number;
  rssi: number;
  /** The app reports no firmware. */
  firmwareVersion: string | null;
  /** Latest of the last profile save and the last logged entry. */
  lastSynced: string;
  /** Minutes since `lastSynced`, or null when there has been no activity. */
  lastSyncedMinutes: number | null;
  /** Null when the engine reports Insufficient Data — never shown as 0. */
  riskScore: number | null;
  status: RiskStatus;
  riskMeaning: string;
  riskSuggestedAction: string;
  hoursSinceDrink: number;
  waterIntakeMl: number;
  /** Null when the app states no goal (a fluid restriction with no doctor's limit). */
  targetDailyMl: number | null;
  /** The same solve recomputed hourly over the last hours; not stored by the app. */
  riskHistory: (number | null)[];
  waterHistory: WaterEntry[];
  phone?: string;
  /** Other profile rows sharing this phone number. */
  duplicateRowCount: number;
  clock: UserClock;
  activityLabel: string;
  sleepWindowLabel: string;
  city: string | null;
  profileUpdatedAt: string | null;
  fullProfile?: any;
}

export interface Alert {
  id: string;
  title: string;
  desc: string;
  user: string;
  type: AlertType;
}

export interface Feedback {
  id: string;
  userName: string;
  email: string;
  preview: string;
  content: string;
  rating?: number;
  date: string;
  time: string;
  timestamp: number; // For sorting
}

export interface LogEntry {
  id: string;
  time: string;
  text: string;
  type: LogType;
}

export interface DashboardStats {
  total: number;
  active: number;
  connected: number;
  avgRisk: number;
  critical: number;
  totalWater: number;
  /** Users the engine could score; the average is over these only. */
  scoredCount: number;
}

// Generic activity/event model for User Journey / audit trail
export type ActorType = 'User' | 'AI' | 'System' | 'Admin';
export type EventCategory =
  | 'Auth'
  | 'Onboarding'
  | 'Profile'
  | 'Device'
  | 'Telemetry'
  | 'Intake'
  | 'Notification'
  | 'AI'
  | 'Setting'
  | 'Error'
  | 'Other';

export interface ActivityEvent {
  eventId: string;
  userId: string;
  eventType: string; // e.g. 'login', 'ble_connected', 'water_intake_added'
  category: EventCategory;
  actor: ActorType;
  title: string;
  description?: string;
  oldValue?: any;
  newValue?: any;
  metadata?: Record<string, any>;
  timestamp: string; // ISO
  status?: 'success' | 'failed' | 'pending';
}
