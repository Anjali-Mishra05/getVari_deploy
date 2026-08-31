import TelemetryHistoryService from '../src/services/TelemetryHistoryService';
import PBWRService from '../src/services/PBWRService';
import { UserProfile } from '../src/types';

/**
 * Rows the fake Supabase hands back, in the snake_case shape `getHistory`
 * maps from.
 *
 * These tests used to seed history through the AsyncStorage mock, but
 * `TelemetryHistoryService.getHistory` reads its snapshots from Supabase —
 * AsyncStorage is only the legacy local cache that `syncLocalToCloud`
 * migrates. Seeding the wrong store meant every day fell through to
 * `MockTelemetryService` and no assertion about "real" data could hold.
 */
var mockCloudRows: any[] = [];

/** Seeds the cloud from the camelCase snapshot shape the tests read in. */
const seedCloud = (
  rows: Array<{ date: string; avgTemp: number; avgHumidity: number; totalSteps: number; avgHeartRate: number }>
) => {
  mockCloudRows = rows.map(r => ({
    date: r.date,
    avg_temp: r.avgTemp,
    avg_humidity: r.avgHumidity,
    total_steps: r.totalSteps,
    avg_heart_rate: r.avgHeartRate,
  }));
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

jest.mock('../src/services/SupabaseClient', () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    upsert: () => Promise.resolve({ data: [], error: null }),
    limit: () => Promise.resolve({ data: mockCloudRows, error: null }),
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve({ data: mockCloudRows, error: null }).then(onFulfilled, onRejected),
  };
  return { supabase: { from: () => builder } };
});

const mockProfile: UserProfile = {
  age: 30,
  gender: 'Male',
  weightKg: 80,
  activityLevel: 'active',
  fitnessGoal: 'optimize_health',
  waterHabit: 'moderate',
  targetDailyMl: 3000,
  workEnvironment: 'outdoor',
  location: 'London',
};

describe('Automated Profile-Based PBWR Mock History', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCloudRows = [];
  });

  test('Empty history -> 7 mock days -> Day 8+ works', async () => {
    seedCloud([]);

    const history = await TelemetryHistoryService.getHistory('user123', mockProfile);
    expect(history).toHaveLength(7);

    const breakdown = await PBWRService.calculatePBWR(mockProfile, 0, 'user123');
    // Day 8+ means isCalibrationPeriod should be false
    expect(breakdown.isCalibrationPeriod).toBe(false);
    // Since profile is active/outdoor, we should see adjustments
    expect(breakdown.activityAdj).toBeGreaterThan(0);
  });

  test('An account younger than 7 days is still calibrating', async () => {
    seedCloud([]);
    const threeDaysOld: UserProfile = {
      ...mockProfile,
      accountCreatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    };

    const breakdown = await PBWRService.calculatePBWR(threeDaysOld, 0, 'user123');
    expect(breakdown.isCalibrationPeriod).toBe(true);
    // Adjustments are withheld until the window closes.
    expect(breakdown.activityAdj).toBe(0);
    expect(breakdown.tempAdj).toBe(0);
    expect(breakdown.humidityAdj).toBe(0);
  });

  test('An account past day 7 gets adjustments even on mock telemetry', async () => {
    seedCloud([]);
    const tenDaysOld: UserProfile = {
      ...mockProfile,
      accountCreatedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    };

    const breakdown = await PBWRService.calculatePBWR(tenDaysOld, 0, 'user123');
    expect(breakdown.isCalibrationPeriod).toBe(false);
    expect(breakdown.activityAdj).toBeGreaterThan(0);
  });

  test('3 real days -> 3 real + 4 mock', async () => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const twoDaysAgo = new Date(Date.now() - 172800000).toISOString().split('T')[0];

    const realData = [
      { date: twoDaysAgo, avgTemp: 40, avgHumidity: 80, totalSteps: 20000, avgHeartRate: 100 },
      { date: yesterday, avgTemp: 41, avgHumidity: 81, totalSteps: 21000, avgHeartRate: 101 },
      { date: today, avgTemp: 42, avgHumidity: 82, totalSteps: 22000, avgHeartRate: 102 },
    ];
    seedCloud(realData);

    const history = await TelemetryHistoryService.getHistory('user123', mockProfile);
    expect(history).toHaveLength(7);

    // Check that real data is present
    expect(history.find(h => h.date === today)?.totalSteps).toBe(22000);
    expect(history.find(h => h.date === yesterday)?.totalSteps).toBe(21000);

    // Check that missing days are filled with mock
    const threeDaysAgo = new Date(Date.now() - 259200000).toISOString().split('T')[0];
    const mockDay = history.find(h => h.date === threeDaysAgo);
    expect(mockDay).toBeDefined();
    expect(mockDay?.totalSteps).not.toBe(22000); // It should be mock data
  });

  test('7 real days -> no mock used', async () => {
    const realData = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
        realData.push({ date: d, avgTemp: 25, avgHumidity: 50, totalSteps: 10000, avgHeartRate: 75 });
    }
    seedCloud(realData);

    const history = await TelemetryHistoryService.getHistory('user123', mockProfile);
    expect(history).toHaveLength(7);
    history.forEach(h => {
        expect(h.totalSteps).toBe(10000);
    });
  });

  test('Deterministic results for same user/profile', async () => {
    seedCloud([]);

    const history1 = await TelemetryHistoryService.getHistory('user1', mockProfile);
    const history2 = await TelemetryHistoryService.getHistory('user1', mockProfile);

    expect(history1).toEqual(history2);

    const history3 = await TelemetryHistoryService.getHistory('user2', mockProfile);
    expect(history1).not.toEqual(history3);
  });

  test('Real data overrides mock for corresponding day', async () => {
    const today = new Date().toISOString().split('T')[0];
    const realEntry = { date: today, avgTemp: 10, avgHumidity: 10, totalSteps: 10, avgHeartRate: 10 };
    seedCloud([realEntry]);

    const history = await TelemetryHistoryService.getHistory('user123', mockProfile);
    const todayEntry = history.find(h => h.date === today);
    expect(todayEntry?.totalSteps).toBe(10);
  });

  test('Profile change updates mock history correctly', async () => {
    seedCloud([]);

    const sedentaryProfile: UserProfile = { ...mockProfile, activityLevel: 'sedentary' };
    const historySedentary = await TelemetryHistoryService.getHistory('user123', sedentaryProfile);

    const activeProfile: UserProfile = { ...mockProfile, activityLevel: 'active' };
    const historyActive = await TelemetryHistoryService.getHistory('user123', activeProfile);

    expect(historySedentary[0].totalSteps).toBeLessThan(historyActive[0].totalSteps);
  });
});
