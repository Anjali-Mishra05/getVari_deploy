export type Workload = 'Office' | 'Commuter' | 'Gym' | 'Field';
export type RiskStatus = 'Hydrated' | 'Mild Risk' | 'High Risk' | 'Critical';
export type LogType = 'info' | 'success' | 'warn' | 'error';
export type AlertType = 'critical' | 'warn' | 'info';

export interface User {
  id: string;
  name: string;
  email?: string;
  age: number;
  gender: string;
  weightKg: number;
  workload: Workload;
  heartRate: number;
  activityLoad: number;
  temperature: number;
  humidity: number;
  sweatGSR: number;
  batteryLevel: number;
  rssi: number;
  firmwareVersion: string;
  lastSynced: string;
  lastSyncedMinutes: number;
  riskScore: number;
  status: RiskStatus;
  waterIntakeMl: number;
  targetDailyMl: number;
  riskHistory: number[];
  waterHistory: { time: string; amount: number }[];
  phone?: string;
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
