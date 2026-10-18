/**
 * The admin panel shows what the app shows.
 *
 * Every user value in the panel is read from the source the app reads, or
 * computed by the function the app computes it with. These cases pin the
 * places the two used to disagree: the day boundary (the user's midnight, not
 * the admin's), corrections, the risk solve (the app's own model, on the
 * user's clock), reads past PostgREST's 1000-row page, the config the phones
 * run on, and a failed read being reported rather than shown as "no users".
 *
 *   npx jest --config jest.config.logic.js __tests__/adminSync.test.ts
 */

var mockTables: Record<string, any[]> = {};
var mockFailTable: string | null = null;

jest.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));

jest.mock('../src/services/SupabaseClient', () => {
  const chain = (table: string): any => {
    const filters: Array<(row: any) => boolean> = [];
    let window: [number, number] | null = null;
    const rows = () => {
      const all = (mockTables[table] ?? []).filter(row => filters.every(f => f(row)));
      return window ? all.slice(window[0], window[1] + 1) : all;
    };
    const answer = () =>
      Promise.resolve(
        mockFailTable === table
          ? { data: null, error: { message: `permission denied for table ${table}` } }
          : { data: rows(), error: null }
      );
    const self: any = {
      select: () => self,
      order: () => self,
      eq: (col: string, value: any) => {
        filters.push(row => row[col] === value);
        return self;
      },
      gte: (col: string, value: any) => {
        filters.push(row => String(row[col]) >= String(value));
        return self;
      },
      range: (from: number, to: number) => {
        window = [from, to];
        return answer();
      },
      limit: () => answer(),
      maybeSingle: () =>
        answer().then(res => (res.error ? res : { data: res.data[0] ?? null, error: null })),
      then: (ok: any, fail: any) => answer().then(ok, fail),
    };
    return self;
  };
  return { supabase: { from: (table: string) => chain(table) } };
});

import fs from 'fs';
import path from 'path';
import { SupabaseAdminService } from '../src/admin-web/services/SupabaseAdminService';
import { steadyStateRisk } from '../src/utils/appRiskModel';
import AppConfigStore from '../src/config/appConfigStore';
import { DEFAULT_APP_CONFIG } from '../src/config/appConfigSchema';
import { startOfUserDay, userDateKey, wallClockShiftMs } from '../src/admin-web/utils/userClock';

// 02:00 on 16 Oct in New York (UTC-5) — a zone that is neither UTC nor the
// machine this runs on, so a day cut at the admin's midnight shows up.
const NOW = new Date('2026-10-16T07:00:00Z');
const NEW_YORK = -300;

const profileRow = (extra: Record<string, unknown> = {}) => ({
  id: 'user-ny',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-10-15T12:00:00Z',
  phone_number: '+15550001111',
  profile: {
    fullName: 'Nia York',
    gender: 'Female',
    age: 31,
    weightKg: 62,
    activityLevel: 'moderate',
    workEnvironment: 'indoor',
    medicalConditions: [],
    selectedCity: 'Mumbai',
    sleepSchedule: { sleepStart: '23:00', wakeUp: '07:00' },
    dailyTarget: {
      date: '2026-10-16',
      finalTargetMl: 3000,
      adjustedTotalMl: 3000,
      upperLimitMl: 5000,
      utcOffsetMinutes: NEW_YORK,
    },
    ...extra,
  },
});

const log = (id: string, timestamp: string, amount: number, source = 'manual') => ({
  id,
  user_id: 'user-ny',
  timestamp,
  reported_at: timestamp,
  amount_ml: amount,
  source,
});

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockFailTable = null;
  AppConfigStore.adopt(DEFAULT_APP_CONFIG);
  mockTables = {
    getvari_profiles: [profileRow()],
    getvari_hydration_logs: [
      // 23:30 on the 15th in New York: yesterday for the user.
      log('y1', '2026-10-16T04:30:00Z', 400),
      // 00:30, 01:00 and 01:30 on the 16th in New York: today.
      log('t1', '2026-10-16T05:30:00Z', 500),
      log('t2', '2026-10-16T06:00:00Z', 250),
      log('c1', '2026-10-16T06:30:00Z', -100, 'correction'),
    ],
    getvari_telemetry_snapshots: [],
    getvari_app_config: [],
  };
});

afterEach(() => {
  jest.useRealTimers();
  AppConfigStore.adopt(DEFAULT_APP_CONFIG);
});

describe("today's intake", () => {
  it("is cut at the user's midnight and counts corrections, as the app's total does", async () => {
    const [user] = await SupabaseAdminService.fetchAllUsers(NOW.getTime());
    expect(user.waterIntakeMl).toBe(650);
    expect(user.waterHistory.map(e => e.id)).toEqual(['t1', 't2', 'c1']);
    expect(user.waterHistory.find(e => e.id === 'c1')).toMatchObject({ amount: -100, isCorrection: true });
    // Entry times on the user's clock.
    expect(user.waterHistory.map(e => e.time)).toEqual(['00:30', '01:00', '01:30']);
  });

  it('reads past the 1000-row page', async () => {
    mockTables.getvari_hydration_logs = Array.from({ length: 2500 }, (_, i) =>
      log(`p${i}`, '2026-10-16T06:00:00Z', 1)
    );
    const [user] = await SupabaseAdminService.fetchAllUsers(NOW.getTime());
    expect(user.waterIntakeMl).toBe(2500);
  });

  it("uses the goal the app stored for the user's date", async () => {
    const [user] = await SupabaseAdminService.fetchAllUsers(NOW.getTime());
    expect(user.targetDailyMl).toBe(3000);
  });
});

describe('risk', () => {
  it("is the app's own solve, on the user's clock", async () => {
    const [user] = await SupabaseAdminService.fetchAllUsers(NOW.getTime());
    const clock = { offsetMinutes: NEW_YORK, known: true };
    const todayLogs = mockTables.getvari_hydration_logs.slice(1);
    const expected = steadyStateRisk(user.fullProfile, todayLogs, NOW.getTime(), wallClockShiftMs(clock, NOW.getTime()));

    expect(user.riskScore).toBe(expected.output.score);
    expect(user.status).toBe(expected.output.status);
    // 01:30 → 02:00 in New York is inside the user's 23:00–07:00 sleep
    // window, so no waking time has passed — on the admin's clock it would.
    expect(user.hoursSinceDrink).toBe(0);
    expect(user.heartRate).toBe(expected.readings.heartRate);
  });

  it('follows the config the phones run on, skipping empty sections like the backend', async () => {
    mockTables.getvari_app_config = [
      {
        id: 'active',
        version: 7,
        config: {
          activityLevels: [{ id: 'moderate', baselineHeartRate: 131 }],
          quickLogAmounts: [],
        },
      },
    ];
    const [user] = await SupabaseAdminService.fetchAllUsers(NOW.getTime());
    expect(user.heartRate).toBe(131);
    expect(AppConfigStore.current().quickLogAmounts).toEqual(DEFAULT_APP_CONFIG.quickLogAmounts);
  });
});

describe('a failed read', () => {
  it('is thrown, not returned as an empty user list', async () => {
    mockFailTable = 'getvari_profiles';
    await expect(SupabaseAdminService.fetchAllUsers(NOW.getTime())).rejects.toThrow(/permission denied/);
  });

  it('of the entries is thrown too, not shown as zero intake', async () => {
    mockFailTable = 'getvari_hydration_logs';
    await expect(SupabaseAdminService.fetchAllUsers(NOW.getTime())).rejects.toThrow(/permission denied/);
  });
});

describe('profile details', () => {
  it('shows what the app shows, and no invented phone number', async () => {
    mockTables.getvari_profiles = [{ ...profileRow(), phone_number: null }];
    const [user] = await SupabaseAdminService.fetchAllUsers(NOW.getTime());
    expect(user.phone).toBeUndefined();
    expect(user.sleepWindowLabel).not.toBe('Not set');
    expect(user.activityLabel).toBe(
      DEFAULT_APP_CONFIG.activityLevels.find(level => level.id === 'moderate')!.title
    );
    expect(user.firmwareVersion).toBeNull();
  });

  it('flags rows that share a phone number', async () => {
    mockTables.getvari_profiles = [profileRow(), { ...profileRow(), id: 'user-ny-old', updated_at: '2026-09-01T00:00:00Z' }];
    const users = await SupabaseAdminService.fetchAllUsers(NOW.getTime());
    expect(users.map(u => u.duplicateRowCount)).toEqual([1, 1]);
    expect(SupabaseAdminService.fleetStats(users).distinctPeople).toBe(1);
  });
});

describe("the user's clock", () => {
  it('finds midnight and the calendar date in the reported zone', () => {
    const clock = { offsetMinutes: 330, known: true }; // IST
    const at = new Date('2026-10-16T20:00:00Z').getTime(); // 01:30 on the 17th in IST
    expect(new Date(startOfUserDay(clock, at)).toISOString()).toBe('2026-10-16T18:30:00.000Z');
    expect(userDateKey(clock, at)).toBe('2026-10-17');
  });
});

describe('one model, not two copies', () => {
  it('the dashboard hook takes its baseline and gap from the shared module', () => {
    const hook = fs.readFileSync(path.join(__dirname, '..', 'src/hooks/useHydrationTelemetry.ts'), 'utf8');
    expect(hook).toContain("from '../utils/appRiskModel'");
    expect(hook).not.toMatch(/const gapFromLogs\s*=/);
    expect(hook).not.toMatch(/climateBandFor\(/);
  });
});
