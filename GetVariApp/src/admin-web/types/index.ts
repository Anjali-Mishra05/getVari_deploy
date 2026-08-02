export type Workload = 'Office' | 'Commuter' | 'Gym' | 'Field';
export type RiskStatus = 'Hydrated' | 'Mild Risk' | 'High Risk' | 'Critical';
export type LogType = 'info' | 'success' | 'warn' | 'error';
export type AlertType = 'critical' | 'warn' | 'info';

export interface User {
  id: string;
  name: string;
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
