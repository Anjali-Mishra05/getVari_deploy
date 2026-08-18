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
  AuthService: { getCurrentUserId: jest.fn(async () => mockUserId) },
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

import { computeTargetDailyMl, climateModifierFor } from '../src/utils/hydrationTarget';
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
  it('starts from body weight', () => {
    // 60kg * 35 = 2100, already a multiple of 50.
    expect(computeTargetDailyMl({ weightKg: 60 })).toBe(2100);
  });

  it('adds for sustained strain', () => {
    expect(computeTargetDailyMl({ weightKg: 60, activityLevel: 'active' })).toBe(2700);
    expect(computeTargetDailyMl({ weightKg: 60, activityLevel: 'elite' })).toBe(3300);
    expect(computeTargetDailyMl({ weightKg: 60, activityLevel: 'sedentary' })).toBe(2100);
  });

  it('applies each condition, including the one that lowers the ceiling', () => {
    expect(computeTargetDailyMl({ weightKg: 60, medicalConditions: ['diabetes'] })).toBe(2550);
    expect(computeTargetDailyMl({ weightKg: 60, medicalConditions: ['kidney'] })).toBe(1850);
    expect(
      computeTargetDailyMl({ weightKg: 60, medicalConditions: ['diabetes', 'hypertension'] })
    ).toBe(2700);
  });

  it('ignores a condition it has no rule for', () => {
    expect(computeTargetDailyMl({ weightKg: 60, medicalConditions: ['cardio'] })).toBe(2100);
  });

  it('adds a climate allowance by city band', () => {
    expect(climateModifierFor('Chennai')).toBe(350);
    expect(climateModifierFor('Bengaluru')).toBe(100);
    expect(climateModifierFor('Patna')).toBe(0);
    expect(climateModifierFor(undefined)).toBe(0);
    expect(computeTargetDailyMl({ weightKg: 60, selectedCity: 'Chennai' })).toBe(2450);
  });

  it('clamps to a safe range whatever the inputs say', () => {
    expect(computeTargetDailyMl({ weightKg: 40, medicalConditions: ['kidney'] })).toBe(1500);
    expect(
      computeTargetDailyMl({
        weightKg: 140,
        activityLevel: 'elite',
        medicalConditions: ['diabetes'],
        selectedCity: 'Delhi',
      })
    ).toBe(4500);
  });

  it('rounds to something a bottle can actually deliver', () => {
    // 63kg * 35 = 2205 → 2200.
    expect(computeTargetDailyMl({ weightKg: 63 })).toBe(2200);
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
    // 65 * 35 = 2275, +100 for Bengaluru = 2375 → 2400 at the nearest 50.
    expect(savedProfile().targetDailyMl).toBe(2400);
  });

  it('moves the goal when a diagnosis is added', async () => {
    await updateProfile({ medicalConditions: ['diabetes'] });
    // 2100 + 450 + 100 = 2650.
    expect(savedProfile().targetDailyMl).toBe(2650);
  });

  it('keeps the dashboard’s location field in step with the chosen city', async () => {
    await updateProfile({ selectedCity: 'Chennai' });
    expect(savedProfile().location).toBe('Chennai');
    expect(savedProfile().targetDailyMl).toBe(2450);
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
    expect(savedProfile()).toMatchObject({ fullName: 'New User', targetDailyMl: 2450 });
  });
});
