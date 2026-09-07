/**
 * The profile stopped being write-once when it became editable, and two
 * invariants now carry the whole feature: a save must merge rather than
 * replace, and everything derived from the answers must be recomputed from
 * them. Both are easy to break and invisible until a user loses their paired
 * device or keeps a goal that no longer matches their weight.
 */

// `var` + `mock` prefix so the hoisted jest.mock factories below can see these.
var mockProfileRow: any = null;
var mockUpsertError: any = null;
var mockUpserted: any[] = [];
var mockSleepScheduleCalls: any[] = [];
var mockUserId: string | null = 'user-1';

jest.mock('../src/services/NotificationService', () => ({
  __esModule: true,
  default: {
    setSleepSchedule: jest.fn(async (schedule: any) => {
      mockSleepScheduleCalls.push(schedule);
    }),
  },
}));

jest.mock('../src/services/AuthService', () => ({
  AuthService: {
    getCurrentUserId: jest.fn(async () => mockUserId),
    // Saves stamp the row with the session's phone number so a returning user
    // can be matched back to it; the editor reads it from here.
    getStoredSession: jest.fn(async () => ({
      userId: mockUserId,
      phoneNumber: '+919876543210',
      isDemo: true,
      createdAt: new Date().toISOString(),
    })),
  },
}));

jest.mock('../src/services/SupabaseClient', () => {
  const thenable = (produce: () => { data: any; error: any }) => {
    const query: any = {
      eq: () => query,
      maybeSingle: async () => produce(),
      then: (resolve: any, reject: any) => Promise.resolve(produce()).then(resolve, reject),
    };
    return query;
  };

  return {
    supabase: {
      from: () => ({
        select: () => thenable(() => ({ data: mockProfileRow, error: null })),
        upsert: async (row: any) => {
          mockUpserted.push(row);
          return { data: null, error: mockUpsertError };
        },
      }),
    },
  };
});

import { computeTargetDailyMl } from '../src/utils/hydrationTarget';
import { updateProfile } from '../src/services/ProfileService';

/** The blob a finished onboarding leaves behind. */
const storedProfile = {
  fullName: 'Asha',
  email: 'asha@example.com',
  age: 30,
  gender: 'Female',
  weightKg: 60,
  selectedCity: 'Bengaluru',
  location: 'Bengaluru',
  latitude: 12.97,
  longitude: 77.59,
  medicalConditions: [],
  activityLevel: 'moderate',
  sleepSchedule: { sleepStart: '23:00', wakeUp: '07:00' },
  awakeHoursPerDay: 16,
  targetDailyMl: 2200,
  connectedDeviceId: 'AA:BB:CC:DD:EE:FF',
};

beforeEach(() => {
  mockProfileRow = { profile: { ...storedProfile } };
  mockUpsertError = null;
  mockUpserted = [];
  mockSleepScheduleCalls = [];
  mockUserId = 'user-1';
});

/** The blob handed to Supabase by the most recent save. */
const savedProfile = () => mockUpserted[mockUpserted.length - 1].profile;

describe('computeTargetDailyMl', () => {
  it('starts from the PBWR baseline: weight × gender rate × age factor', () => {
    // §2. 60 kg female, 19–39 → 60 × 49.1 × 1.00 = 2946.
    expect(computeTargetDailyMl({ weightKg: 60, gender: 'Female', age: 30 })).toBe(2946);
    // 60 kg male → 60 × 56.9 × 1.00 = 3414.
    expect(computeTargetDailyMl({ weightKg: 60, gender: 'Male', age: 30 })).toBe(3414);
  });

  it('scales the baseline down with age', () => {
    // §2 age bands: 1.00 / 0.95 / 0.90.
    expect(computeTargetDailyMl({ weightKg: 60, gender: 'Female', age: 45 })).toBe(2799); // ×0.95
    expect(computeTargetDailyMl({ weightKg: 60, gender: 'Female', age: 65 })).toBe(2651); // ×0.90
  });

  it('reads the gender rate whatever case the row stored it in', () => {
    // Onboarding has written both "Female" and "female"; an exact match gave
    // the lowercase rows the male rate and a baseline 16% too high.
    expect(computeTargetDailyMl({ weightKg: 60, gender: 'female', age: 30 })).toBe(2946);
  });

  it('adds the work-environment band', () => {
    // §4. AC office +250, heavy outdoor +1300.
    const base = { weightKg: 60, gender: 'Female' as const, age: 30 };
    expect(computeTargetDailyMl({ ...base, workEnvironment: 'indoor' })).toBe(2946);
    expect(computeTargetDailyMl({ ...base, workEnvironment: 'ac_office' })).toBe(3196);
    expect(computeTargetDailyMl({ ...base, workEnvironment: 'heavy_outdoor' })).toBe(4246);
  });

  it('applies the adjustment of a condition that needs no doctor', () => {
    // §4 health table: diabetes +400.
    expect(
      computeTargetDailyMl({ weightKg: 60, gender: 'Female', age: 30, medicalConditions: ['diabetes'] })
    ).toBe(3346);
  });

  it('leaves the observed bands at zero with no telemetry to read', () => {
    // §3: activity, temperature and humidity come from seven days of
    // observation, never from a declared category or the chosen city. This
    // entry point has no history, so all three contribute nothing — the
    // calibration-window behaviour, and the reason `PBWRService` exists.
    const base = { weightKg: 60, gender: 'Female' as const, age: 30 };
    expect(computeTargetDailyMl({ ...base, activityLevel: 'elite' })).toBe(2946);
    expect(computeTargetDailyMl({ ...base, selectedCity: 'Chennai' })).toBe(2946);
  });

  it('refuses to compute a goal for a fluid-restricted condition', () => {
    // CKD, hypertension and heart disease are all `requiresPhysicianLimit`.
    expect(computeTargetDailyMl({ weightKg: 60, medicalConditions: ['ckd'] })).toBeNull();
    expect(
      computeTargetDailyMl({ weightKg: 60, medicalConditions: ['diabetes', 'hypertension'] })
    ).toBeNull();
  });

  it('ignores a condition it has no rule for', () => {
    expect(
      computeTargetDailyMl({ weightKg: 60, gender: 'Female', age: 30, medicalConditions: ['cardio'] })
    ).toBe(2946);
  });

  it('caps at the §6 ceiling and floors at the §7 minimum', () => {
    // A tiny frame still gets the 1.5 L floor.
    expect(computeTargetDailyMl({ weightKg: 25, gender: 'Female', age: 65 })).toBe(1500);
    // A heavy frame is capped: 140 × 56.9 = 7966, healthy male ceiling 4500.
    expect(computeTargetDailyMl({ weightKg: 140, gender: 'Male', age: 30 })).toBe(4500);
    // Declaring high strain raises the ceiling to the §6 Gym row, 5000.
    expect(
      computeTargetDailyMl({ weightKg: 140, gender: 'Male', age: 30, activityLevel: 'elite' })
    ).toBe(5000);
  });
});

describe('updateProfile', () => {
  it('merges the patch over the stored blob instead of replacing it', async () => {
    const result = await updateProfile({ fullName: 'Asha Menon', weightKg: 65 });

    expect(result.status).toBe('saved');
    const saved = savedProfile();
    expect(saved.fullName).toBe('Asha Menon');
    expect(saved.weightKg).toBe(65);
    // Nothing the editor never showed may be dropped on the way through.
    expect(saved.connectedDeviceId).toBe('AA:BB:CC:DD:EE:FF');
    expect(saved.latitude).toBe(12.97);
    expect(saved.email).toBe('asha@example.com');
  });

  it('recomputes the daily goal from the corrected answers', async () => {
    await updateProfile({ weightKg: 65 });
    // 65 kg female, age 30 → 65 × 49.1 × 1.00 = 3191.5 → 3192.
    expect(savedProfile().targetDailyMl).toBe(3192);
  });

  it('moves the goal when a diagnosis is added', async () => {
    await updateProfile({ medicalConditions: ['diabetes'] });
    // 60 × 49.1 = 2946, + the §4 diabetes adjustment of 400.
    expect(savedProfile().targetDailyMl).toBe(3346);
  });

  it('keeps the dashboard’s location field in step with the chosen city', async () => {
    await updateProfile({ selectedCity: 'Chennai' });
    expect(savedProfile().location).toBe('Chennai');
    // The city moves the risk engine's climate band, not the goal: §4 bands
    // temperature and humidity from what the device observed.
    expect(savedProfile().targetDailyMl).toBe(2946);
  });

  it('recomputes waking hours and hands the window to the OS', async () => {
    await updateProfile({ sleepSchedule: { sleepStart: '00:30', wakeUp: '06:30' } });

    expect(savedProfile().sleepSchedule).toEqual({ sleepStart: '00:30', wakeUp: '06:30' });
    expect(savedProfile().awakeHoursPerDay).toBe(18);
    expect(mockSleepScheduleCalls).toEqual([{ sleepStart: '00:30', wakeUp: '06:30' }]);
  });

  it('returns the merged profile so the dashboard can adopt it without a refetch', async () => {
    const result = await updateProfile({ age: 31 });
    expect(result).toMatchObject({ status: 'saved', profile: { age: 31, fullName: 'Asha' } });
  });

  it('reports a failed write instead of pretending it saved', async () => {
    mockUpsertError = { message: 'network down' };
    const result = await updateProfile({ age: 31 });
    expect(result).toEqual({ status: 'error', error: 'network down' });
    expect(mockSleepScheduleCalls).toHaveLength(0);
  });

  it('refuses to write for a signed-out device', async () => {
    mockUserId = null;
    const result = await updateProfile({ age: 31 });
    expect(result).toEqual({ status: 'unauthenticated' });
    expect(mockUpserted).toHaveLength(0);
  });

  it('saves a first edit even when no row exists yet', async () => {
    mockProfileRow = null;
    const result = await updateProfile({
      fullName: 'New User',
      weightKg: 70,
      activityLevel: 'light',
    });

    expect(result.status).toBe('saved');
    // No stored row, so no age or gender either: Stage 1 falls back to 30
    // years and the male rate — 70 × 56.9 × 1.00.
    expect(savedProfile()).toMatchObject({ fullName: 'New User', targetDailyMl: 3983 });
  });
});
