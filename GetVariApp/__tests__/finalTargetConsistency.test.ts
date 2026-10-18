/**
 * One Final Daily Target everywhere.
 *
 * The real PBWR pipeline runs on a profile whose Adjusted Total is above its
 * 5.0 L Upper Limit. Every layer that states the day's target — the
 * dashboard's breakdown, the stored profile row, the profile read the app
 * uses, the hydration totals, the admin list and the admin drawer — must say
 * the capped Final Daily Target (5000 ml), never the Adjusted Total.
 *
 * Supabase is an in-memory fake; nothing touches a real database.
 */

var mockStore = new Map<string, string>();
var mockTables: Record<string, any[]> = {};

jest.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: {}, DeviceEventEmitter: { emit() {}, addListener: () => ({ remove() {} }) } }));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => Promise.resolve(mockStore.has(k) ? mockStore.get(k)! : null),
    setItem: (k: string, v: string) => {
      mockStore.set(k, v);
      return Promise.resolve();
    },
    removeItem: (k: string) => {
      mockStore.delete(k);
      return Promise.resolve();
    },
  },
}));

jest.mock('../src/services/SupabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Array<[string, any]> = [];
      let patch: any = null;
      const rows = () => (mockTables[table] ?? []).filter(r => filters.every(([c, v]) => r[c] === v));
      const result = () => Promise.resolve({ data: rows(), error: null });
      const self: any = {
        select: () => self,
        gte: () => self,
        order: () => self,
        range: () => result(),
        limit: () => result(),
        update: (value: any) => {
          patch = value;
          return self;
        },
        eq: (col: string, value: any) => {
          filters.push([col, value]);
          if (patch) {
            rows().forEach(r => Object.assign(r, patch));
            return Promise.resolve({ data: null, error: null });
          }
          return self;
        },
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (ok: any, fail: any) => result().then(ok, fail),
      };
      return self;
    },
  },
}));

jest.mock('../src/services/AuthService', () => ({
  AuthService: {
    getCurrentUserId: async () => 'user-a',
    getStoredSession: async () => null,
  },
}));

jest.mock('../src/services/NotificationService', () => ({
  __esModule: true,
  default: { setSleepSchedule: async () => {}, noteIntakeLogged: async () => {} },
}));

import { getTodayBreakdown, peekTodayTargetMl } from '../src/services/DailyTargetService';
import { fetchProfileResult } from '../src/services/ProfileService';
import { getTodayTotals } from '../src/services/HydrationService';
import { SupabaseAdminService } from '../src/admin-web/services/SupabaseAdminService';
import PBWRService from '../src/services/PBWRService';

const LONG_AGO = '2026-08-01T00:00:00.000Z';

/** Male 80 kg, 39 y, outdoor: baseline 4552 + work 750 (+ observed bands) > the 5000 ceiling. */
const profileA = {
  fullName: 'A',
  gender: 'Male',
  age: 39,
  weightKg: 80,
  workEnvironment: 'outdoor',
  activityLevel: 'moderate',
  medicalConditions: [],
  accountCreatedAt: LONG_AGO,
  // What a profile save stores: the telemetry-less figure.
  targetDailyMl: 5000,
};

const profileB = {
  fullName: 'B',
  gender: 'Female',
  age: 30,
  weightKg: 60,
  workEnvironment: 'indoor',
  activityLevel: 'moderate',
  medicalConditions: [],
  accountCreatedAt: LONG_AGO,
  targetDailyMl: 2946,
};

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-09-29T08:00:00Z') });
  mockStore.clear();
  mockTables = {
    getvari_profiles: [
      { id: 'user-a', created_at: LONG_AGO, profile: { ...profileA } },
      { id: 'user-b', created_at: LONG_AGO, profile: { ...profileB } },
    ],
    getvari_hydration_logs: [],
    getvari_telemetry_snapshots: [],
  };
});

afterEach(() => jest.useRealTimers());

describe('the capped Final Daily Target is the one number everywhere', () => {
  it('Adjusted Total above the Upper Limit → 5000 on every layer', async () => {
    // Dashboard (HomeScreen → DailyTargetService).
    const dashboard = await getTodayBreakdown(profileA as any, 0, 'user-a');
    expect(dashboard.upperLimit).toBe(5000);
    expect(dashboard.adjustedTotal).toBeGreaterThan(5000);
    expect(dashboard.finalTarget).toBe(5000);

    // Stored on the account's profile row.
    const row = mockTables.getvari_profiles.find(r => r.id === 'user-a')!;
    expect(row.profile.targetDailyMl).toBe(5000);
    expect(row.profile.dailyTarget).toMatchObject({ finalTargetMl: 5000, upperLimitMl: 5000 });
    expect(row.profile.dailyTarget.adjustedTotalMl).toBe(dashboard.adjustedTotal);

    // The profile the app reads (reminders, engine, editor, fallback).
    const { profile } = await fetchProfileResult('user-a');
    expect(profile!.targetDailyMl).toBe(5000);

    // Hydration totals / reminder progress.
    expect(await peekTodayTargetMl('user-a')).toBe(5000);
    expect((await getTodayTotals('user-a')).targetMl).toBe(5000);

    // Admin list and drawer.
    const users = await SupabaseAdminService.fetchAllUsers();
    const adminA = users.find(u => u.id === 'user-a')!;
    expect(adminA.targetDailyMl).toBe(5000);
    const drawer = await PBWRService.calculatePBWR((adminA as any).fullProfile, adminA.waterIntakeMl, adminA.id);
    expect(drawer.finalTarget).toBe(5000);
    expect(drawer.adjustedTotal).toBeGreaterThan(5000);
  });

  it('admin shows the pipeline’s capped final for an account the app has not run for today', async () => {
    const users = await SupabaseAdminService.fetchAllUsers();
    const adminA = users.find(u => u.id === 'user-a')!;
    const pipeline = await PBWRService.calculatePBWR((adminA as any).fullProfile, 0, 'user-a');
    expect(adminA.targetDailyMl).toBe(pipeline.finalTarget);
    expect(adminA.targetDailyMl).toBe(5000);
  });

  it('accounts stay isolated: B never sees A’s target, on the device or in the admin panel', async () => {
    await getTodayBreakdown(profileA as any, 0, 'user-a');
    const b = await getTodayBreakdown(profileB as any, 0, 'user-b');
    expect(b.finalTarget).toBeLessThan(5000);

    expect(await peekTodayTargetMl('user-a')).toBe(5000);
    expect(await peekTodayTargetMl('user-b')).toBe(b.finalTarget);
    const rowB = mockTables.getvari_profiles.find(r => r.id === 'user-b')!;
    expect(rowB.profile.targetDailyMl).toBe(b.finalTarget);

    const users = await SupabaseAdminService.fetchAllUsers();
    expect(users.find(u => u.id === 'user-b')!.targetDailyMl).toBe(b.finalTarget);
  });

  it('yesterday’s stored target is not served today: the app recomputes and stores today’s', async () => {
    const row = mockTables.getvari_profiles.find(r => r.id === 'user-a')!;
    row.profile.dailyTarget = { date: '2026-09-28', finalTargetMl: 4321, adjustedTotalMl: 4321, upperLimitMl: 5000 };
    row.profile.targetDailyMl = 4321;

    const { profile } = await fetchProfileResult('user-a');
    expect(profile!.targetDailyMl).not.toBe(4321);

    const today = await getTodayBreakdown(profileA as any, 0, 'user-a');
    expect(row.profile.dailyTarget.date).not.toBe('2026-09-28');
    expect(row.profile.targetDailyMl).toBe(today.finalTarget);
  });
});
