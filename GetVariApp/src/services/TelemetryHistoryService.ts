import AsyncStorage from '@react-native-async-storage/async-storage';
import { SensorData, UserProfile } from '../types';
import MockTelemetryService from './MockTelemetryService';

const STORAGE_KEY = '@telemetry_history_7d';
const MAX_DAYS = 7;

export interface TelemetrySnapshot {
  date: string; // ISO date YYYY-MM-DD
  avgTemp: number;
  avgHumidity: number;
  totalSteps: number;
  avgHeartRate: number;
}

class TelemetryHistoryService {
  /**
   * Appends current sensor data to the history.
   */
  async recordSnapshot(data: SensorData): Promise<void> {
    try {
      const historyStr = await AsyncStorage.getItem(STORAGE_KEY);
      let history: TelemetrySnapshot[] = historyStr ? JSON.parse(historyStr) : [];

      const today = new Date().toISOString().split('T')[0];
      const existingIndex = history.findIndex(s => s.date === today);

      const newSnapshot: TelemetrySnapshot = {
        date: today,
        avgTemp: data.temperature,
        avgHumidity: data.humidity,
        totalSteps: data.steps,
        avgHeartRate: data.heartRate,
      };

      if (existingIndex > -1) {
        history[existingIndex] = newSnapshot;
      } else {
        history.push(newSnapshot);
      }

      if (history.length > MAX_DAYS) {
        history = history.slice(-MAX_DAYS);
      }

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.error('Failed to record telemetry snapshot', e);
    }
  }

  /**
   * Returns history for the last 7 days.
   * If real data is missing, fills with deterministic mock data.
   */
  async getHistory(userId?: string, profile?: UserProfile): Promise<TelemetrySnapshot[]> {
    try {
      const historyStr = await AsyncStorage.getItem(STORAGE_KEY);
      const realHistory: TelemetrySnapshot[] = historyStr ? JSON.parse(historyStr) : [];

      if (!userId || !profile) return realHistory;

      const combinedHistory: TelemetrySnapshot[] = [];
      const now = new Date();

      // We want the last 7 days including today
      for (let i = MAX_DAYS - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];

        const existing = realHistory.find(s => s.date === dateStr);
        if (existing) {
          combinedHistory.push(existing);
        } else {
          // Fill with mock data
          combinedHistory.push(MockTelemetryService.getMockHistoricalSnapshot(userId, profile, dateStr));
        }
      }

      return combinedHistory;
    } catch (e) {
      console.error('Failed to get telemetry history', e);
      return [];
    }
  }

  async getAverages(days: number = 7, userId?: string, profile?: UserProfile): Promise<{ avgTemp: number; avgHumidity: number; avgSteps: number }> {
    const history = await this.getHistory(userId, profile);
    const slice = history.slice(-days);
    if (slice.length === 0) return { avgTemp: 25, avgHumidity: 50, avgSteps: 5000 };

    const sum = slice.reduce((acc, curr) => ({
      avgTemp: acc.avgTemp + curr.avgTemp,
      avgHumidity: acc.avgHumidity + curr.avgHumidity,
      avgSteps: acc.avgSteps + curr.totalSteps,
    }), { avgTemp: 0, avgHumidity: 0, avgSteps: 0 });

    return {
      avgTemp: sum.avgTemp / slice.length,
      avgHumidity: sum.avgHumidity / slice.length,
      avgSteps: sum.avgSteps / slice.length,
    };
  }
}

export default new TelemetryHistoryService();
