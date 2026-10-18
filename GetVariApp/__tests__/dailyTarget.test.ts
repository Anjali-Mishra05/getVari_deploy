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

/** The profile row the final target is written to; no real database. */
var mockProfileRows: Record<string, any> = {};
jest.mock('../src/services/SupabaseClient', () => ({
  supabase: {
    from: () => {
      let id: string | null = null;
      let patch: any = null;
      const self: any = {
        select: () => self,
        update: (value: any) => {
          patch = value;
          return self;
        },
        eq: (_col: string, value: string) => {
          id = value;
          if (patch) {
            if (mockProfileRows[id]) mockProfileRows[id] = { ...mockProfileRows[id], ...patch };
            return Promise.resolve({ data: null, error: null });
          }
          return self;
        },
        maybeSingle: () => Promise.resolve({ data: id ? mockProfileRows[id] ?? null : null, error: null }),
      };
      return self;
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
    expect(await peekTodayTargetMl('user-1')).toBe(4000);
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
      'getvari_daily_target:user-1',
      JSON.stringify({ date: '2000-01-01', targetMl: 4000 })
    );

    const today = await getTodayBreakdown(profile, 0, 'user-1');
    expect(today.finalTarget).toBe(4900);
  });

  it('recomputes after a profile edit drops the lock', async () => {
    await getTodayBreakdown(profile, 0, 'user-1');
    mockFinalTarget = 3200; // the user corrected their weight downward

    await clearLockedTarget('user-1');

    const after = await getTodayBreakdown(profile, 0, 'user-1');
    expect(after.finalTarget).toBe(3200);
  });

  it('peeks without computing, so a background caller cannot start a day', async () => {
    expect(await peekTodayTargetMl('user-1')).toBeNull();
    // And having peeked, still nothing is stored — the reminder path falls
    // back to the profile's figure rather than locking a goal of its own.
    expect(mockStore.has('getvari_daily_target:user-1')).toBe(false);
  });

  it('ignores a stored entry that is not a usable number', async () => {
    mockStore.set('getvari_daily_target:user-1', JSON.stringify({ date: localDateKey(), targetMl: 0 }));
    expect(await peekTodayTargetMl('user-1')).toBeNull();

    mockStore.set('getvari_daily_target:user-1', 'not json');
    expect(await peekTodayTargetMl('user-1')).toBeNull();
  });
});

describe('the final target is per account and stored on the account’s profile', () => {
  beforeEach(() => {
    mockStore.clear();
    mockFinalTarget = 4000;
    mockProfileRows = {
      'user-1': { id: 'user-1', profile: { fullName: 'A', targetDailyMl: 3100 } },
      'user-2': { id: 'user-2', profile: { fullName: 'B', targetDailyMl: 2600 } },
    };
  });

  it('two accounts on one device never share a day’s lock', async () => {
    await getTodayBreakdown(profile, 0, 'user-1');
    mockFinalTarget = 2900;
    const b = await getTodayBreakdown(profile, 0, 'user-2');
    expect(b.finalTarget).toBe(2900);
    expect(await peekTodayTargetMl('user-1')).toBe(4000);
    expect(await peekTodayTargetMl('user-2')).toBe(2900);
  });

  it('writes the capped final target (not the Adjusted Total) onto the profile row', async () => {
    await getTodayBreakdown(profile, 0, 'user-1');
    const stored = mockProfileRows['user-1'].profile;
    expect(stored.targetDailyMl).toBe(4000);
    // The device's zone travels with the date, so the admin panel can tell
    // which day `date` means.
    expect(stored.dailyTarget).toEqual({
      date: localDateKey(),
      finalTargetMl: 4000,
      adjustedTotalMl: 4000,
      upperLimitMl: 5000,
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
    });
    expect(stored.fullName).toBe('A'); // the rest of the profile untouched
    expect(mockProfileRows['user-2'].profile.targetDailyMl).toBe(2600); // other account untouched
  });

  it('a new day stores the new day’s target for that account', async () => {
    mockStore.set('getvari_daily_target:user-1', JSON.stringify({ date: '2000-01-01', targetMl: 4000, persisted: true }));
    mockProfileRows['user-1'].profile.dailyTarget = { date: '2000-01-01', finalTargetMl: 4000, adjustedTotalMl: 4000, upperLimitMl: 5000 };
    mockFinalTarget = 4700;
    await getTodayBreakdown(profile, 0, 'user-1');
    expect(mockProfileRows['user-1'].profile.dailyTarget).toMatchObject({ date: localDateKey(), finalTargetMl: 4700 });
    expect(mockProfileRows['user-1'].profile.targetDailyMl).toBe(4700);
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
