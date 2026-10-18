/**
 * PBWR §3 calibration window: measured from the profile row's server-set
 * `created_at`, never from a date stamped on the profile blob by an edit,
 * onboarding, a login or today's date.
 *
 *   npx jest --config jest.config.logic.js __tests__/pbwrCalibration.test.ts
 */

var mockProfileRows: any[] = [];

jest.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: {} }));

jest.mock('../src/services/SupabaseClient', () => {
  const result = (table: string) =>
    table === 'getvari_profiles' ? { data: mockProfileRows, error: null } : { data: [], error: null };
  const chain = (table: string): any => {
    const done = () => Promise.resolve(result(table));
    const self: any = {
      select: () => self,
      eq: () => self,
      gte: () => self,
      order: () => self,
      range: () => done(),
      limit: () => done(),
      maybeSingle: () => done(),
      then: (ok: any, fail: any) => done().then(ok, fail),
    };
    return self;
  };
  return { supabase: { from: (table: string) => chain(table) } };
});

import { accountStartDate, isWithinCalibrationWindow } from '../src/utils/pbwr';
import PBWRService from '../src/services/PBWRService';
import { SupabaseAdminService } from '../src/admin-web/services/SupabaseAdminService';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

const blob = (accountCreatedAt?: string) => ({
  fullName: 'Test',
  gender: 'Male',
  age: 30,
  weightKg: 70,
  activityLevel: 'moderate',
  workEnvironment: 'ac_office',
  medicalConditions: ['diabetes'],
  ...(accountCreatedAt ? { accountCreatedAt } : {}),
});

beforeEach(() => {
  mockProfileRows = [];
});

describe('accountStartDate', () => {
  it('the server creation date wins over a later stamp from a profile edit', () => {
    const created = daysAgo(40);
    expect(accountStartDate(created, daysAgo(2))).toBe(created);
    expect(isWithinCalibrationWindow(accountStartDate(created, daysAgo(2)))).toBe(false);
  });

  it('a new account (row created 3 days ago) is calibrating', () => {
    expect(isWithinCalibrationWindow(accountStartDate(daysAgo(3), undefined))).toBe(true);
  });

  it('falls back to the stamp only when the row has no creation date', () => {
    const stamp = daysAgo(2);
    expect(accountStartDate(undefined, stamp)).toBe(stamp);
    expect(accountStartDate(null, undefined)).toBeUndefined();
  });
});

describe('admin panel classification (the "Calibration Phase (Day 1-7)" badge)', () => {
  const breakdownFor = async (row: any) => {
    mockProfileRows = [row];
    const [user] = await SupabaseAdminService.fetchAllUsers();
    return PBWRService.calculatePBWR((user as any).fullProfile, 0, user.id);
  };

  it('an old account edited recently is NOT in calibration and gets its adjustments', async () => {
    const b = await breakdownFor({ id: 'old-user-0001', created_at: daysAgo(40), profile: blob(daysAgo(1)) });
    expect(b.isCalibrationPeriod).toBe(false);
    expect(b.workEnvAdj).toBe(250);
    expect(b.healthAdj).toBe(400);
    expect(b.activityAdj + b.tempAdj + b.humidityAdj).toBeGreaterThan(0); // from the 7-day (mock) history
  });

  it('an old account never stamped (onboarding only) is NOT in calibration', async () => {
    const b = await breakdownFor({ id: 'old-user-0002', created_at: daysAgo(40), profile: blob() });
    expect(b.isCalibrationPeriod).toBe(false);
  });

  it('the reported account: created 15 Sep, profile edited today (stamp today), active mock telemetry', async () => {
    // Real row values (live Supabase format, microsecond timestamp with offset).
    jest.useFakeTimers({ now: new Date('2026-09-29T10:00:00Z') });
    try {
      const b = await breakdownFor({
        id: '546fbfa8-test',
        created_at: '2026-09-15T04:05:06.731608+00:00',
        profile: {
          gender: 'Male', age: '39', weightKg: '80', workEnvironment: 'indoor',
          medicalConditions: [], activityLevel: 'active',
          accountCreatedAt: '2026-09-29T06:07:26.577Z', // written by today's profile edit
        },
      });
      expect(b.isCalibrationPeriod).toBe(false);
      expect(b.activityAdj).toBeGreaterThan(0);
      expect(b.tempAdj).toBeGreaterThan(0);
      expect(b.humidityAdj).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('the admin panel hands PBWRService the server creation date, not the edit stamp', async () => {
    mockProfileRows = [{ id: 'x-1', created_at: '2026-09-15T04:05:06.731608+00:00', profile: blob('2026-09-29T06:07:26.577Z') }];
    const [user] = await SupabaseAdminService.fetchAllUsers();
    expect((user as any).fullProfile.accountCreatedAt).toBe('2026-09-15T04:05:06.731Z');
  });

  it('a brand-new account is in calibration: PBWR only, every adjustment 0', async () => {
    const b = await breakdownFor({ id: 'new-user-0003', created_at: daysAgo(2), profile: blob() });
    expect(b.isCalibrationPeriod).toBe(true);
    expect([b.activityAdj, b.tempAdj, b.humidityAdj, b.workEnvAdj, b.healthAdj]).toEqual([0, 0, 0, 0, 0]);
    expect(b.finalTarget).toBe(b.pbwrBaseline);
  });
});
