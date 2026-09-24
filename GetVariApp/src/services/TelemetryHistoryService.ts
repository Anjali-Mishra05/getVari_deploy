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
  /**
   * How many readings the averages on this row were computed from.
   *
   * Local-only: the Supabase row carries the resulting mean, not the count,
   * so the running average is folded here and the result is what is upserted.
   * A cleared local store restarts the day's mean, which is a worse average
   * for the rest of that day and nothing beyond it.
   */
  samples?: number;
}

/**
 * Folds one reading into a running mean.
 *
 * "Missing != Zero" applies in both directions: a null reading leaves the
 * mean alone rather than dragging it toward zero, and a first reading over a
 * null mean becomes the mean outright rather than being averaged against
 * nothing.
 */
const foldMean = (
  previous: number | null | undefined,
  next: number | null,
  priorSamples: number
): number | null => {
  if (next === null) return previous ?? null;
  if (previous === null || previous === undefined || priorSamples <= 0) return next;
  return (previous * priorSamples + next) / (priorSamples + 1);
};

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

      // 1. Update Local Storage (App Speed/Offline)
      const historyStr = await storage.getItem(STORAGE_KEY);
      let history: TelemetrySnapshot[] = historyStr ? JSON.parse(historyStr) : [];
      const existingIndex = history.findIndex(s => s.date === today);
      // A mock-filled row is a placeholder, not a reading: the first real
      // sample of the day replaces it outright instead of being averaged
      // against invented numbers.
      const previous =
        existingIndex > -1 && !history[existingIndex].isMock ? history[existingIndex] : null;
      const priorSamples = previous?.samples ?? (previous ? 1 : 0);

      /**
       * The day's row, folded rather than overwritten.
       *
       * This used to store whatever the sensor happened to be reading at the
       * moment of the call, under column names that promise an aggregate.
       * For `totalSteps` that was the bug the user felt: steps is a
       * cumulative daily counter, so the row climbed all day, the 7-day mean
       * climbed with it, and `activityAdj` walked up its bands
       * (+0 → +300 → +500 → +900 → +1300) — a daily water goal that rose
       * through the afternoon and ratcheted further each day as real rows
       * displaced low mock ones.
       *
       * Steps therefore take the high-water mark, which is what a daily
       * counter's total *is*, and the other three take a running mean, which
       * is what "avg" on their names has always claimed.
       */
      const newSnapshot: TelemetrySnapshot = {
        date: today,
        avgTemp: foldMean(previous?.avgTemp, validTemp, priorSamples),
        avgHumidity: foldMean(previous?.avgHumidity, validHumid, priorSamples),
        totalSteps:
          validSteps === null
            ? previous?.totalSteps ?? null
            : Math.max(validSteps, previous?.totalSteps ?? 0),
        avgHeartRate: foldMean(previous?.avgHeartRate, validHR, priorSamples),
        samples: priorSamples + 1,
      };

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
        // The folded row, not the raw reading — the cloud copy is what
        // `getHistory` reads back as the source of truth, so writing the
        // instantaneous value here would reintroduce the drift on every
        // device that syncs.
        await supabase.from(TABLE_NAME).upsert({
          user_id: userId,
          date: today,
          avg_temp: newSnapshot.avgTemp,
          avg_humidity: newSnapshot.avgHumidity,
          total_steps: newSnapshot.totalSteps,
          avg_heart_rate: newSnapshot.avgHeartRate,
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
