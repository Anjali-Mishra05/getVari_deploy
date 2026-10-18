/**
 * Daily telemetry snapshots reach getvari_telemetry_snapshots: one row per
 * user per date, upserted in place, and a rejected write is reported rather
 * than swallowed. Supabase is mocked — nothing is written to a real database.
 *
 *   npx jest --config jest.config.logic.js __tests__/telemetryPersistence.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';

var mockStore = new Map<string, string>();
var mockUpserts: Array<{ table: string; rows: any; options: any }> = [];
var mockUpsertError: any = null;

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

var mockSelectError: any = null;

jest.mock('../src/services/SupabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      const read: any = {
        select: () => read,
        eq: () => read,
        order: () => read,
        limit: () => Promise.resolve({ data: mockSelectError ? null : [], error: mockSelectError }),
      };
      return {
        ...read,
        upsert: (rows: any, options: any) => {
          mockUpserts.push({ table, rows, options });
          return Promise.resolve({ data: null, error: mockUpsertError });
        },
      };
    },
  },
}));

import TelemetryHistoryService from '../src/services/TelemetryHistoryService';

const reading = (over: Record<string, any> = {}) =>
  ({
    heartRate: 80,
    steps: 4000,
    activityLoad: 20,
    temperature: 30,
    humidity: 68,
    sweatGSR: 2,
    hydrationScore: 70,
    batteryLevel: 80,
    rssi: -60,
    lastUpdated: new Date().toISOString(),
    ...over,
  }) as any;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-09-29T10:00:00Z') });
  mockStore.clear();
  mockUpserts = [];
  mockUpsertError = null;
});

afterEach(() => jest.useRealTimers());

describe('recordSnapshot → getvari_telemetry_snapshots', () => {
  it('upserts the day’s row keyed by user_id + date', async () => {
    await TelemetryHistoryService.recordSnapshot(reading(), 'user-a');

    expect(mockUpserts).toHaveLength(1);
    const { table, rows, options } = mockUpserts[0];
    expect(table).toBe('getvari_telemetry_snapshots');
    expect(options).toEqual({ onConflict: 'user_id,date' });
    expect(rows).toMatchObject({
      user_id: 'user-a',
      date: '2026-09-29',
      total_steps: 4000,
      avg_temp: 30,
      avg_humidity: 68,
    });
  });

  it('a second reading the same day updates the same (user_id, date) row', async () => {
    await TelemetryHistoryService.recordSnapshot(reading({ steps: 4000, temperature: 30 }), 'user-a');
    await TelemetryHistoryService.recordSnapshot(reading({ steps: 6000, temperature: 32 }), 'user-a');

    const keys = mockUpserts.map(u => `${u.rows.user_id}|${u.rows.date}`);
    expect(new Set(keys)).toEqual(new Set(['user-a|2026-09-29']));
    expect(mockUpserts[1].rows).toMatchObject({ total_steps: 6000, avg_temp: 31 });
  });

  it('the next day is a new row', async () => {
    await TelemetryHistoryService.recordSnapshot(reading(), 'user-a');
    jest.setSystemTime(new Date('2026-09-30T10:00:00Z'));
    await TelemetryHistoryService.recordSnapshot(reading(), 'user-a');
    expect(mockUpserts.map(u => u.rows.date)).toEqual(['2026-09-29', '2026-09-30']);
  });

  it('a rejected write is logged, not swallowed, and never throws into the dashboard', async () => {
    mockUpsertError = { code: '42501', message: 'permission denied for table getvari_telemetry_snapshots' };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(TelemetryHistoryService.recordSnapshot(reading(), 'user-a')).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith('[TelemetryHistory] Snapshot not stored:', '42501', expect.stringContaining('permission denied'));
    spy.mockRestore();
  });

  it('no user id: kept locally, nothing sent', async () => {
    await TelemetryHistoryService.recordSnapshot(reading());
    expect(mockUpserts).toHaveLength(0);
  });

  it('syncLocalToCloud upserts on the same key', async () => {
    await TelemetryHistoryService.recordSnapshot(reading());
    await TelemetryHistoryService.syncLocalToCloud('user-a');
    expect(mockUpserts[0].options).toEqual({ onConflict: 'user_id,date' });
    expect(mockUpserts[0].rows[0]).toMatchObject({ user_id: 'user-a', date: '2026-09-29' });
  });
});

describe('reading history for PBWR', () => {
  afterEach(() => {
    mockSelectError = null;
  });

  it('a rejected read (42501) is reported, and PBWR still gets a full 7-day window', async () => {
    mockSelectError = { code: '42501', message: 'permission denied for table getvari_telemetry_snapshots' };
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const history = await TelemetryHistoryService.getHistory('user-a', { activityLevel: 'moderate' } as any, 1);
    expect(spy).toHaveBeenCalledWith('[TelemetryHistory] History not read:', '42501', expect.stringContaining('permission denied'));
    expect(history).toHaveLength(7);
    spy.mockRestore();
  });
});

describe('the migration that grants the app access', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260929_telemetry_snapshots_access.sql'),
    'utf8'
  );

  it('grants read/write to the roles the app and admin panel use', () => {
    expect(sql).toMatch(/grant select, insert, update on public\.getvari_telemetry_snapshots to anon, authenticated/);
  });

  it('adds the (user_id, date) unique key the upsert targets', () => {
    expect(sql).toMatch(/unique index if not exists \w+\s+on public\.getvari_telemetry_snapshots \(user_id, date\)/);
  });

  it('never deletes or rewrites existing rows', () => {
    expect(sql).not.toMatch(/\b(delete from|truncate|drop table|update public\.getvari_telemetry_snapshots)\b/i);
  });
});
