import { supabase } from './SupabaseClient';
import { SensorData, UserProfile } from '../types';
import MockTelemetryService from './MockTelemetryService';
import { SENSOR_LIMITS, validateSensorReading, STALENESS_LIMIT_MS } from '../config/edgeCaseConfig';

const STORAGE_KEY = '@telemetry_history_7d';
const TABLE_NAME = 'getvari_telemetry_snapshots';
const MAX_DAYS = 7;

// Storage abstraction for Web vs RN
const getStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return {
      getItem: (key: string) => Promise.resolve(window.localStorage.getItem(key)),
      setItem: (key: string, val: string) => Promise.resolve(window.localStorage.setItem(key, val)),
      removeItem: (key: string) => Promise.resolve(window.localStorage.removeItem(key)),
    };
  }
  try {
    return require('@react-native-async-storage/async-storage').default;
  } catch (e) {
    return {
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    };
  }
};

const storage = getStorage();

export interface TelemetrySnapshot {
  date: string; // ISO date YYYY-MM-DD
  avgTemp: number | null;
  avgHumidity: number | null;
  totalSteps: number | null;
  avgHeartRate: number | null;
  isMock?: boolean;
}

class TelemetryHistoryService {
  /**
   * Validates and appends sensor data to history and syncs with Supabase.
   */
  async recordSnapshot(data: SensorData, userId?: string): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Validate readings using edgeCaseConfig - "Missing != Zero"
      const validTemp = validateSensorReading(data.temperature, SENSOR_LIMITS.TEMPERATURE);
      const validHumid = validateSensorReading(data.humidity, SENSOR_LIMITS.HUMIDITY);
      const validSteps = validateSensorReading(data.steps, SENSOR_LIMITS.STEPS_DAILY);
      const validHR = validateSensorReading(data.heartRate, SENSOR_LIMITS.HEART_RATE);

      const newSnapshot: TelemetrySnapshot = {
        date: today,
        avgTemp: validTemp,
        avgHumidity: validHumid,
        totalSteps: validSteps,
        avgHeartRate: validHR,
      };

      // 1. Update Local Storage (App Speed/Offline)
      const historyStr = await storage.getItem(STORAGE_KEY);
      let history: TelemetrySnapshot[] = historyStr ? JSON.parse(historyStr) : [];
      const existingIndex = history.findIndex(s => s.date === today);

      if (existingIndex > -1) {
        history[existingIndex] = newSnapshot;
      } else {
        history.push(newSnapshot);
      }

      if (history.length > MAX_DAYS) {
        history = history.slice(-MAX_DAYS);
      }
      await storage.setItem(STORAGE_KEY, JSON.stringify(history));

      // 2. Sync to Supabase if userId is provided
      if (userId) {
        await supabase.from(TABLE_NAME).upsert({
          user_id: userId,
          date: today,
          avg_temp: validTemp,
          avg_humidity: validHumid,
          total_steps: validSteps,
          avg_heart_rate: validHR,
        });
      }
    } catch (e) {
      console.error('[TelemetryHistory] Failed to record snapshot:', e);
    }
  }

  /**
   * Returns whether a reading is fresh enough for real-time calculations.
   */
  isFresh(timestamp: string): boolean {
    const age = Date.now() - new Date(timestamp).getTime();
    return age < STALENESS_LIMIT_MS;
  }

  /**
   * Migrates legacy local data to Supabase.
   */
  async syncLocalToCloud(userId: string): Promise<void> {
    try {
      const historyStr = await storage.getItem(STORAGE_KEY);
      if (!historyStr) return;

      const history: TelemetrySnapshot[] = JSON.parse(historyStr);
      if (history.length === 0) return;

      const rows = history.map(s => ({
        user_id: userId,
        date: s.date,
        avg_temp: s.avgTemp,
        avg_humidity: s.avgHumidity,
        total_steps: s.totalSteps,
        avg_heart_rate: s.avgHeartRate,
      }));

      await supabase.from(TABLE_NAME).upsert(rows);
      console.log('[TelemetryHistory] Local data synced to cloud.');
    } catch (e) {
      console.error('[TelemetryHistory] Sync failed:', e);
    }
  }

  /**
   * Returns history for the last 7 days from Supabase.
   * If real data is missing, fills with deterministic mock data.
   */
  async getHistory(userId?: string, profile?: UserProfile): Promise<TelemetrySnapshot[]> {
    try {
      if (!userId || !profile) return [];

      // 1. Fetch from Supabase (Source of Truth)
      const { data: cloudData, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(MAX_DAYS);

      const realSnapshots: TelemetrySnapshot[] = (cloudData || []).map(row => ({
        date: row.date,
        avgTemp: row.avg_temp,
        avgHumidity: row.avg_humidity,
        totalSteps: row.total_steps,
        avgHeartRate: row.avg_heart_rate,
      }));

      // 2. Fill missing days with deterministic mock fallback
      const combinedHistory: TelemetrySnapshot[] = [];
      const now = new Date();

      for (let i = MAX_DAYS - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];

        const existing = realSnapshots.find(s => s.date === dateStr);
        if (existing) {
          combinedHistory.push(existing);
        } else {
          // Fallback to same deterministic mock logic
          combinedHistory.push(MockTelemetryService.getMockHistoricalSnapshot(userId, profile, dateStr));
        }
      }

      return combinedHistory;
    } catch (e) {
      console.error('[TelemetryHistory] Failed to get history:', e);
      return [];
    }
  }

  async getAverages(days: number = 7, userId?: string, profile?: UserProfile): Promise<{ avgTemp: number | null; avgHumidity: number | null; avgSteps: number | null; avgHR: number | null }> {
    const history = await this.getHistory(userId, profile);
    const slice = history.slice(-days);
    if (slice.length === 0) return { avgTemp: null, avgHumidity: null, avgSteps: null, avgHR: null };

    // "Missing != Zero" - only average non-null values
    const validTemps = slice.map(s => s.avgTemp).filter((v): v is number => v !== null);
    const validHumids = slice.map(s => s.avgHumidity).filter((v): v is number => v !== null);
    const validSteps = slice.map(s => s.totalSteps).filter((v): v is number => v !== null);
    const validHRs = slice.map(s => s.avgHeartRate).filter((v): v is number => v !== null);

    return {
      avgTemp: validTemps.length > 0 ? validTemps.reduce((a, b) => a + b, 0) / validTemps.length : null,
      avgHumidity: validHumids.length > 0 ? validHumids.reduce((a, b) => a + b, 0) / validHumids.length : null,
      avgSteps: validSteps.length > 0 ? validSteps.reduce((a, b) => a + b, 0) / validSteps.length : null,
      avgHR: validHRs.length > 0 ? validHRs.reduce((a, b) => a + b, 0) / validHRs.length : null,
    };
  }

  /**
   * Returns whether the device is likely damaged based on persistent invalid readings.
   */
  async checkDeviceDamage(): Promise<boolean> {
    const historyStr = await storage.getItem(STORAGE_KEY);
    if (!historyStr) return false;

    const history: TelemetrySnapshot[] = JSON.parse(historyStr);
    if (history.length < 3) return false;

    // Check if the last 3 snapshots have null for ALL core sensors
    const recent = history.slice(-3);
    const allDamaged = recent.every(s => s.avgHeartRate === null && s.avgTemp === null && s.avgHumidity === null);

    return allDamaged;
  }
}

export default new TelemetryHistoryService();
