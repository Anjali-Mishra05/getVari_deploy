/**
 * The daily goal holds still for the day it describes.
 *
 * PBWR is a live pipeline over rolling telemetry averages, and each of its
 * Stage 3 bands is a step function — so recomputed on every sensor tick the
 * goal jumped whenever an average crossed a band edge. The reported symptom
 * was "my water requirement is increasing daily"; it was really increasing
 * hourly, and a user who had drunk 2,000 of 4,000 ml at lunch was at 2,000 of
 * 4,500 by the afternoon having drunk nothing in between.
 *
 * These lock the two properties that fixes it: one number per local calendar
 * day, and the same number on every surface that states a goal.
 */

const mockStore = new Map<string, string>();

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

/**
 * The live pipeline, stubbed so a test can move the goal underneath the lock.
 * What is asserted here is that the lock holds, not what PBWR computes — that
 * is `pbwrSpec`'s job.
 */
let mockFinalTarget = 4000;

jest.mock('../src/services/PBWRService', () => ({
  __esModule: true,
  default: {
    calculatePBWR: jest.fn(async (_profile: any, consumed: number) => ({
      pbwrBaseline: 3500,
      activityAdj: 0,
      tempAdj: 0,
      humidityAdj: 0,
      workEnvAdj: 0,
      healthAdj: 0,
      adjustedTotal: mockFinalTarget,
      upperLimit: 5000,
      finalTarget: mockFinalTarget,
      isPhysicianGated: false,
      physicianLimitEntered: false,
      remaining: Math.max(0, mockFinalTarget - consumed),
      isCalibrationPeriod: false,
    })),
  },
}));

import DailyTargetService, {
  clearLockedTarget,
  getTodayBreakdown,
  localDateKey,
  peekTodayTargetMl,
} from '../src/services/DailyTargetService';

const profile = { weightKg: 70, gender: 'Male', age: 30 } as any;

describe('the daily hydration goal is decided once per day', () => {
  beforeEach(() => {
    mockStore.clear();
    mockFinalTarget = 4000;
  });

  it('returns the live figure the first time it is asked, and stores it', async () => {
    const first = await getTodayBreakdown(profile, 0, 'user-1');
    expect(first.finalTarget).toBe(4000);
    expect(await peekTodayTargetMl()).toBe(4000);
  });

  it('holds that figure when the live pipeline moves later the same day', async () => {
    await getTodayBreakdown(profile, 0, 'user-1');

    // An observed average crosses a band edge — steps into Active, say.
    mockFinalTarget = 4900;

    const later = await getTodayBreakdown(profile, 250, 'user-1');
    expect(later.finalTarget).toBe(4000);
  });

  it('recomputes `remaining` against the locked goal, not the stale one', async () => {
    await getTodayBreakdown(profile, 0, 'user-1');
    mockFinalTarget = 4900;

    const later = await getTodayBreakdown(profile, 1500, 'user-1');
    // 4000 locked − 1500 drunk. Against the live 4900 this would read 3400,
    // which is the user losing ground for drinking.
    expect(later.remaining).toBe(2500);
  });

  it('never reports a negative remaining once the goal is met', async () => {
    await getTodayBreakdown(profile, 0, 'user-1');
    const met = await getTodayBreakdown(profile, 5000, 'user-1');
    expect(met.remaining).toBe(0);
  });

  it('takes the new figure once the calendar day rolls over', async () => {
    await getTodayBreakdown(profile, 0, 'user-1');
    mockFinalTarget = 4900;

    // Yesterday's lock, left behind by an app that ran last night.
    mockStore.set(
      'getvari_daily_target',
      JSON.stringify({ date: '2000-01-01', targetMl: 4000 })
    );

    const today = await getTodayBreakdown(profile, 0, 'user-1');
    expect(today.finalTarget).toBe(4900);
  });

  it('recomputes after a profile edit drops the lock', async () => {
    await getTodayBreakdown(profile, 0, 'user-1');
    mockFinalTarget = 3200; // the user corrected their weight downward

    await clearLockedTarget();

    const after = await getTodayBreakdown(profile, 0, 'user-1');
    expect(after.finalTarget).toBe(3200);
  });

  it('peeks without computing, so a background caller cannot start a day', async () => {
    expect(await peekTodayTargetMl()).toBeNull();
    // And having peeked, still nothing is stored — the reminder path falls
    // back to the profile's figure rather than locking a goal of its own.
    expect(mockStore.has('getvari_daily_target')).toBe(false);
  });

  it('ignores a stored entry that is not a usable number', async () => {
    mockStore.set('getvari_daily_target', JSON.stringify({ date: localDateKey(), targetMl: 0 }));
    expect(await peekTodayTargetMl()).toBeNull();

    mockStore.set('getvari_daily_target', 'not json');
    expect(await peekTodayTargetMl()).toBeNull();
  });
});

describe('the day key is the local calendar date', () => {
  it('uses local getters, not the UTC date', () => {
    // 23:30 on the 14th, local time. `toISOString()` would call this the 15th
    // anywhere east of Greenwich — a goal that resets mid-evening.
    const at = new Date(2026, 4, 14, 23, 30, 0);
    expect(localDateKey(at)).toBe('2026-05-14');
  });

  it('pads single-digit months and days', () => {
    expect(localDateKey(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('is exposed on the default export for callers that import the service', () => {
    expect(DailyTargetService.localDateKey(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
});
