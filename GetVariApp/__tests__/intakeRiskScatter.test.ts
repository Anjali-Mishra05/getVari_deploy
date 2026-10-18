/**
 * The journey's "Water Intake vs Risk Score" chart.
 *
 * It plots each logged drink at its risk score, read from the event's
 * `metadata.riskSnapshot`. When the journey stopped generating invented
 * telemetry, nothing set that field any more, so every point was filtered out
 * and the chart drew an empty grid. These cases pin the field back: each drink
 * carries the app model's score at the moment it was logged, over that day's
 * earlier entries on the user's clock.
 *
 *   npx jest --config jest.config.logic.js __tests__/intakeRiskScatter.test.ts
 */

var mockTables: Record<string, any[]> = {};

jest.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

jest.mock('../src/services/SupabaseClient', () => {
  const chain = (table: string): any => {
    const filters: Array<(row: any) => boolean> = [];
    let window: [number, number] | null = null;
    const rows = () => {
      const all = (mockTables[table] ?? []).filter(row => filters.every(f => f(row)));
      return window ? all.slice(window[0], window[1] + 1) : all;
    };
    const answer = () => Promise.resolve({ data: rows(), error: null });
    const self: any = {
      select: () => self,
      order: () => self,
      eq: (col: string, value: any) => {
        filters.push(row => row[col] === value);
        return self;
      },
      gte: () => self,
      range: (from: number, to: number) => {
        window = [from, to];
        return answer();
      },
      limit: () => answer(),
      maybeSingle: () => answer().then(res => ({ data: res.data[0] ?? null, error: null })),
      then: (ok: any, fail: any) => answer().then(ok, fail),
    };
    return self;
  };
  return { supabase: { from: (table: string) => chain(table) } };
});

import fs from 'fs';
import path from 'path';
import { fetchEventsForUser } from '../src/admin-web/services/ActivityService';
import { steadyStateRisk } from '../src/utils/appRiskModel';
import { clockForProfile, startOfUserDay, wallClockShiftMs } from '../src/admin-web/utils/userClock';

// India (UTC+05:30), reported by the app with the day's stored target.
const profile = {
  fullName: 'Asha Rao',
  weightKg: 58,
  activityLevel: 'moderate',
  selectedCity: 'Pune',
  sleepSchedule: { sleepStart: '23:00', wakeUp: '07:00' },
  dailyTarget: { date: '2026-10-16', finalTarget: 3000, utcOffsetMinutes: 330 },
};

const log = (id: number, timestamp: string, amount: number, source = 'manual') => ({
  id,
  user_id: 'user-in',
  amount_ml: amount,
  source,
  timestamp,
});

// 16 Oct (IST): three drinks and a correction; 17 Oct (IST): one drink.
// 18:00Z on the 16th is 23:30 IST — still the 16th; 19:00Z is 00:30 on the 17th.
const LOGS = [
  log(1, '2026-10-16T03:30:00Z', 250), // 09:00 IST, first of the day
  log(2, '2026-10-16T06:30:00Z', 500), // 12:00 IST
  log(3, '2026-10-16T07:00:00Z', -100, 'correction'),
  log(4, '2026-10-16T11:30:00Z', 300), // 17:00 IST
  log(5, '2026-10-16T19:00:00Z', 250), // 00:30 IST on the 17th, first of that day
];

beforeEach(() => {
  mockTables = {
    getvari_profiles: [{ id: 'user-in', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-15T00:00:00Z', profile }],
    getvari_hydration_logs: LOGS,
  };
});

/** What the chart plots, read the way `UserJourney` reads it. */
const scatterOf = (events: any[]) =>
  events
    .filter(e => e.eventType === 'water_intake_added' && e.metadata?.riskSnapshot !== undefined)
    .map(e => ({ consumed: e.metadata?.dailyTotalMl ?? e.metadata?.amount, risk: e.metadata?.riskSnapshot }));

describe('Water Intake vs Risk Score', () => {
  test('every logged drink is a point on the chart', async () => {
    const events = await fetchEventsForUser('user-in');
    const drinks = events.filter(e => e.eventType === 'water_intake_added');
    expect(drinks).toHaveLength(4);
    const points = scatterOf(events);
    expect(points).toHaveLength(4);
    for (const p of points) {
      expect(typeof p.risk).toBe('number');
      expect(p.risk).toBeGreaterThanOrEqual(0);
      expect(p.risk).toBeLessThanOrEqual(100);
      expect(typeof p.consumed).toBe('number');
    }
  });

  test("each point is the app model's score at that moment, over that day's earlier entries", async () => {
    const events = await fetchEventsForUser('user-in');
    const clock = clockForProfile(profile);
    expect(clock).toEqual({ offsetMinutes: 330, known: true });

    for (const event of events.filter(e => e.eventType === 'water_intake_added')) {
      const at = new Date(event.timestamp).getTime();
      const dayStart = startOfUserDay(clock, at);
      const earlier = LOGS.filter(l => {
        const t = new Date(l.timestamp).getTime();
        return t >= dayStart && t < at;
      });
      const expected = steadyStateRisk(profile as any, earlier, at, wallClockShiftMs(clock, at)).output.score;
      expect(event.metadata?.riskSnapshot).toBe(expected);
    }
  });

  test("the first drink after the user's midnight does not count the previous day's entries", async () => {
    const events = await fetchEventsForUser('user-in');
    const nextDay = events.find(e => e.eventId === '5')!;
    const at = new Date(nextDay.timestamp).getTime();
    const clock = clockForProfile(profile);
    const fresh = steadyStateRisk(profile as any, [], at, wallClockShiftMs(clock, at)).output.score;
    expect(nextDay.metadata?.riskSnapshot).toBe(fresh);
  });

  test("intake is that day's running total on the user's clock, not the all-time sum", async () => {
    const events = await fetchEventsForUser('user-in');
    // 16 Oct: 250, +500 = 750, -100 correction = 650, +300 = 950.
    // 17 Oct (from the user's midnight): starts again at 250.
    expect(scatterOf(events).map(p => p.consumed)).toEqual([250, 750, 950, 250]);
    // The all-time figure is still on the event, for its data panel.
    expect(events.find(e => e.eventId === '5')!.metadata?.cumulativeAmount).toBe(1200);
  });

  test('a correction is not a drink and is not plotted', async () => {
    const events = await fetchEventsForUser('user-in');
    const correction = events.find(e => e.eventId === '3')!;
    expect(correction.eventType).toBe('water_intake_corrected');
    expect(correction.metadata?.riskSnapshot).toBeUndefined();
  });

  test('the chart and the service agree on the field it reads', () => {
    const journey = fs.readFileSync(path.join(__dirname, '../src/admin-web/components/users/UserJourney.tsx'), 'utf8');
    expect(journey).toContain("e.eventType === 'water_intake_added' && e.metadata?.riskSnapshot !== undefined");
    expect(journey).toContain('risk: e.metadata?.riskSnapshot,');
    expect(journey).toContain('consumed: e.metadata?.dailyTotalMl ?? e.metadata?.amount,');
  });
});
