/**
 * Behavioural verification of the 17 documented edge cases (EC-1 … EC-17).
 *
 * `edgeCases.test.ts` already lists the same seventeen, but eight of its cases
 * are comment-only placeholders that pass without executing anything. This
 * suite exercises the real code path behind each one, so a regression in the
 * behaviour actually turns a test red.
 *
 *   npx jest --config jest.config.logic.js __tests__/edgeCasesStrict.test.ts
 */

import type { SensorData, UserProfile, HydrationRiskDetails } from '../src/types';

// ---------------------------------------------------------------------------
// Mocks — every factory dereferences its capture lazily, because the factories
// run while the hoisted imports resolve (before the consts below are set).
// ---------------------------------------------------------------------------

const mockStore = new Map<string, string>();

/** Rows the fake Supabase will hand back, plus what was written to it. */
const mockDb: {
  logRows: any[];
  profile: any;
  telemetryRows: any[];
  inserted: any[];
  upserted: any[];
  insertError: any;
  selectError: any;
} = {
  logRows: [],
  profile: null,
  telemetryRows: [],
  inserted: [],
  upserted: [],
  insertError: null,
  selectError: null,
};

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 31 },
}));

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
    clear: () => {
      mockStore.clear();
      return Promise.resolve();
    },
  },
}));

/**
 * A chainable stand-in for the Supabase query builder.
 *
 * Every call site in the app builds a chain and then awaits it, so the builder
 * is both chainable and thenable; which rows come back depends on the table
 * and whether the chain was a write.
 */
jest.mock('../src/services/SupabaseClient', () => {
  const build = (table: string) => {
    let write: 'insert' | 'upsert' | null = null;
    let payload: any = null;

    const settle = () => {
      if (write === 'insert') {
        if (mockDb.insertError) return { data: null, error: mockDb.insertError };
        mockDb.inserted.push(payload);
        return { data: [payload], error: null };
      }
      if (write === 'upsert') {
        mockDb.upserted.push(payload);
        return { data: payload, error: null };
      }
      if (mockDb.selectError) return { data: null, error: mockDb.selectError };
      if (table === 'getvari_telemetry_snapshots') return { data: mockDb.telemetryRows, error: null };
      if (table === 'getvari_profiles') return { data: mockDb.profile ? { profile: mockDb.profile } : null, error: null };
      return { data: mockDb.logRows, error: null };
    };

    const builder: any = {
      insert: (row: any) => {
        write = 'insert';
        payload = row;
        return builder;
      },
      upsert: (rows: any) => {
        write = 'upsert';
        payload = rows;
        return builder;
      },
      select: () => builder,
      eq: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve(settle()),
      then: (onFulfilled: any, onRejected: any) => Promise.resolve(settle()).then(onFulfilled, onRejected),
    };
    return builder;
  };

  return { supabase: { from: (table: string) => build(table) } };
});

jest.mock('../src/services/AuthService', () => ({
  AuthService: { getCurrentUserId: () => Promise.resolve('test-user-123') },
}));

jest.mock('../src/services/ChatBus', () => ({
  __esModule: true,
  default: { emitHydrationLogged: () => {} },
  emitHydrationLogged: () => {},
}));

const mockDisplayNotification = jest.fn((..._args: any[]) => Promise.resolve());
const mockRequestPermission = jest.fn((..._args: any[]) => Promise.resolve(true));

const mockMsSinceLastNotification = jest.fn(() => Promise.resolve(Infinity));

jest.mock('../src/services/NotificationService', () => ({
  __esModule: true,
  default: {
    requestPermission: (...a: any[]) => mockRequestPermission.apply(null, a as []),
    displayNotification: (...a: any[]) => mockDisplayNotification.apply(null, a as []),
    scheduleHydrationReminders: () => Promise.resolve(),
    isSleeping: () => Promise.resolve(false),
    // The gap between alerts now spans both delivery paths — the engine's own
    // and the scheduled reminder's — so it reads this shared stamp rather than
    // only its own state. Infinity is "nothing has been shown yet".
    msSinceLastNotification: (...args: any[]) => mockMsSinceLastNotification.apply(null, args as []),
    noteNotificationShown: () => Promise.resolve(),
    noteIntakeLogged: () => Promise.resolve(),
  },
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {},
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  AndroidStyle: { BIGTEXT: 1 },
}));
jest.mock('@react-native-firebase/messaging', () => ({}));

import { HydrationRiskEngine } from '../src/utils/hydrationRiskEngine';
import { RISK_THRESHOLDS, WATER_LOG_LIMITS, validateSensorReading, SENSOR_LIMITS } from '../src/config/edgeCaseConfig';
import HydrationService, { generateRequestId } from '../src/services/HydrationService';
import NotificationEngine from '../src/services/NotificationEngine';
import TelemetryHistoryService from '../src/services/TelemetryHistoryService';
import ProfileService from '../src/services/ProfileService';

// ---------------------------------------------------------------------------

const TELEMETRY_KEY = '@telemetry_history_7d';
const ENGINE_STATE_KEY = 'getvari_notification_engine_state';

const profile: UserProfile = {
  age: 30,
  gender: 'female',
  weightKg: 62,
  activityLevel: 'moderate' as any,
  fitnessGoal: 'maintain' as any,
  workEnvironment: 'indoor' as any,
  waterHabit: 'average' as any,
  targetDailyMl: 2500,
  sleepSchedule: { sleepStart: '23:00', wakeUp: '07:00' },
};

const sensor = (over: Partial<SensorData> = {}): SensorData => ({
  heartRate: null,
  steps: null,
  activityLoad: null,
  temperature: null,
  humidity: null,
  sweatGSR: null,
  hydrationScore: 80,
  batteryLevel: null,
  rssi: -50,
  lastUpdated: new Date().toISOString(),
  ...over,
});

const risk = (score: number | null): HydrationRiskDetails =>
  ({
    score,
    status: 'Mild Risk',
    color: '',
    bgColor: '',
    textGlow: '',
    meaning: '',
    suggestedAction: '',
    heartLoad: null,
    activityLoad: null,
    temperatureLoad: null,
    humidityLoad: null,
    timeLoad: null,
  } as HydrationRiskDetails);

const firedTitles = () => mockDisplayNotification.mock.calls.map((c: any[]) => c[0]);

beforeEach(() => {
  mockStore.clear();
  mockDb.logRows = [];
  mockDb.profile = null;
  mockDb.telemetryRows = [];
  mockDb.inserted = [];
  mockDb.upserted = [];
  mockDb.insertError = null;
  mockDb.selectError = null;
  mockDisplayNotification.mockClear();
  mockRequestPermission.mockClear();
  mockRequestPermission.mockResolvedValue(true as any);
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('EC-1: Bluetooth disconnected — fall back to 7-day history', () => {
  test('a score is still produced from historical averages', () => {
    const historical = { avgHR: 70, avgSteps: 5000, avgTemp: 25, avgHumidity: 50 };
    const result = HydrationRiskEngine.solveRisk(
      { heartRate: null, activityLoad: null, temperature: null, humidity: null, timeSinceWaterIntake: 1 },
      undefined,
      historical
    );
    expect(result.score).not.toBeNull();
    expect(result.status).not.toBe('Insufficient Data');
    expect(result.heartLoad).toBe(10); // 70 bpm → the lowest load band
    expect(result.temperatureLoad).toBe(30); // 25 °C → the 22-28 band
  });

  test('the historical step count is converted into an activity load, not dropped', () => {
    const result = HydrationRiskEngine.solveRisk(
      { heartRate: null, activityLoad: null, temperature: null, humidity: null, timeSinceWaterIntake: 1 },
      undefined,
      { avgHR: 70, avgSteps: 10000, avgTemp: 25, avgHumidity: 50 }
    );
    // 10 000 steps → 80/100 activity → the 80+ band.
    expect(result.activityLoad).toBe(90);
  });
});

describe('EC-2: sensor failure / impossible reading — Device Error', () => {
  test('a heart rate above the physiological ceiling is reported as Device Error', () => {
    const result = HydrationRiskEngine.solveRisk({
      heartRate: 300,
      activityLoad: 50,
      temperature: 25,
      humidity: 50,
      timeSinceWaterIntake: 1,
    });
    expect(result.status).toBe('Device Error');
    expect(result.score).toBeNull();
  });

  test('a heart rate below the physiological floor is reported as Device Error', () => {
    const result = HydrationRiskEngine.solveRisk({
      heartRate: 12,
      activityLoad: 50,
      temperature: 25,
      humidity: 50,
      timeSinceWaterIntake: 1,
    });
    expect(result.status).toBe('Device Error');
  });

  test('out-of-range readings are rejected by the shared validator, not zeroed', () => {
    expect(validateSensorReading(300, SENSOR_LIMITS.HEART_RATE)).toBeNull();
    expect(validateSensorReading(NaN, SENSOR_LIMITS.TEMPERATURE)).toBeNull();
    expect(validateSensorReading(Infinity, SENSOR_LIMITS.HUMIDITY)).toBeNull();
    expect(validateSensorReading(undefined, SENSOR_LIMITS.BATTERY)).toBeNull();
    expect(validateSensorReading(0, SENSOR_LIMITS.BATTERY)).toBe(0); // a real zero survives
  });
});

describe('EC-3: stale sensor data — excluded past 15 minutes', () => {
  test('a 20-minute-old reading is stale', () => {
    expect(TelemetryHistoryService.isFresh(new Date(Date.now() - 20 * 60_000).toISOString())).toBe(false);
  });

  test('a 5-minute-old reading is still fresh', () => {
    expect(TelemetryHistoryService.isFresh(new Date(Date.now() - 5 * 60_000).toISOString())).toBe(true);
  });
});

describe('EC-4: future-dated water intake is blocked', () => {
  test('an intake an hour in the future is rejected', async () => {
    const res = await HydrationService.logWater({
      amountMl: 250,
      reportedAt: new Date(Date.now() + 3600_000).toISOString(),
      requestId: generateRequestId('ec4'),
    });
    expect(res.status).toBe('error');
    expect(res.error).toMatch(/Future/i);
    expect(mockDb.inserted).toHaveLength(0);
  });
});

describe('EC-5: backdated water intake is accepted and preserved', () => {
  test('yesterday’s intake is written with the reported time, not the write time', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const res = await HydrationService.logWater({
      amountMl: 250,
      reportedAt: past,
      requestId: generateRequestId('ec5'),
    });
    expect(res.status).toBe('logged');
    expect(mockDb.inserted).toHaveLength(1);
    expect(mockDb.inserted[0].reported_at).toBe(past);
    expect(mockDb.inserted[0].timestamp).not.toBe(past);
  });
});

describe('EC-6: unrealistic intake needs confirmation', () => {
  test('more than twice the rolling average is held for confirmation', async () => {
    jest.spyOn(HydrationService, 'getRolling7DayIntakeAvg').mockResolvedValue(500);
    const res = await HydrationService.logWater({ amountMl: 2000, requestId: generateRequestId('ec6a') });
    expect(res.needsConfirmation).toBe(true);
    expect(res.status).toBe('error');
    expect(mockDb.inserted).toHaveLength(0);
  });

  test('the 1500 mL floor applies even when the rolling average is tiny', async () => {
    jest.spyOn(HydrationService, 'getRolling7DayIntakeAvg').mockResolvedValue(100);
    const ok = await HydrationService.logWater({ amountMl: 1400, requestId: generateRequestId('ec6b') });
    expect(ok.needsConfirmation).toBeUndefined();
    expect(ok.status).toBe('logged');
    expect(WATER_LOG_LIMITS.DEFAULT_MAX_SINGLE_ML).toBe(1500);
  });

  test('an explicit confirmation writes the entry through', async () => {
    jest.spyOn(HydrationService, 'getRolling7DayIntakeAvg').mockResolvedValue(500);
    const res = await HydrationService.logWater({
      amountMl: 2000,
      confirmed: true,
      requestId: generateRequestId('ec6c'),
    });
    expect(res.status).toBe('logged');
    expect(mockDb.inserted).toHaveLength(1);
  });

  test('a non-positive amount is rejected outright', async () => {
    const zero = await HydrationService.logWater({ amountMl: 0, requestId: generateRequestId('ec6d') });
    expect(zero.status).toBe('error');
    const negative = await HydrationService.logWater({ amountMl: -250, requestId: generateRequestId('ec6e') });
    expect(negative.status).toBe('error');
    expect(mockDb.inserted).toHaveLength(0);
  });
});

describe('EC-7: manual intake is tagged with its verification source', () => {
  test('a user-reported entry is stored as user-reported', async () => {
    await HydrationService.logWater({
      amountMl: 250,
      verificationSource: 'user-reported',
      requestId: generateRequestId('ec7a'),
    });
    expect(mockDb.inserted[0].verification_source).toBe('user-reported');
  });

  test('a sensor-verified entry keeps its stronger provenance', async () => {
    await HydrationService.logWater({
      amountMl: 250,
      verificationSource: 'sensor-verified',
      source: 'smart_cap',
      requestId: generateRequestId('ec7b'),
    });
    expect(mockDb.inserted[0].verification_source).toBe('sensor-verified');
    expect(mockDb.inserted[0].source).toBe('smart_cap');
  });

  test('an untagged entry defaults to the weaker, user-reported provenance', async () => {
    await HydrationService.logWater({ amountMl: 250, requestId: generateRequestId('ec7c') });
    expect(mockDb.inserted[0].verification_source).toBe('user-reported');
  });
});

describe('EC-8: offline / replayed writes are idempotent', () => {
  test('the same request id never produces a second row', async () => {
    const id = generateRequestId('offline');
    const first = await HydrationService.logWater({ amountMl: 250, requestId: id });
    const second = await HydrationService.logWater({ amountMl: 250, requestId: id });

    expect(first.status).toBe('logged');
    expect(second.status).toBe('duplicate');
    expect(mockDb.inserted).toHaveLength(1);
  });

  test('two simultaneous writes of the same request share one round trip', async () => {
    const id = generateRequestId('race');
    const [a, b] = await Promise.all([
      HydrationService.logWater({ amountMl: 300, requestId: id }),
      HydrationService.logWater({ amountMl: 300, requestId: id }),
    ]);
    expect(mockDb.inserted).toHaveLength(1);
    expect([a.status, b.status]).toContain('logged');
  });

  test('a primary-key collision from the server is reported as a duplicate, not an error', async () => {
    mockDb.insertError = { code: '23505', message: 'duplicate key value' };
    const res = await HydrationService.logWater({ amountMl: 250, requestId: generateRequestId('pk') });
    expect(res.status).toBe('duplicate');
  });

  test('request ids are unique per call and carry their origin', () => {
    const a = generateRequestId('offline');
    const b = generateRequestId('offline');
    expect(a).toContain('offline');
    expect(a).not.toBe(b);
  });
});

describe('EC-9: notifications disabled on the phone', () => {
  /**
   * This asserted the opposite until the engine was corrected: it expected the
   * cooldown to advance even though nothing was shown.
   *
   * A cooldown exists to stop the *user* being alerted too often. With
   * permission denied the user was not alerted at all, so there is nothing to
   * cool down from — and advancing it would mean that the moment they grant
   * permission, the app believes it has already warned them and stays silent
   * for a full cooldown window. That is the one moment the alert matters most.
   *
   * See the permission branch in `NotificationEngine.evaluateNow`, which
   * updates `lastAlerts` only on an actual delivery.
   */
  test('nothing is delivered, and no cooldown is spent on the alert nobody saw', async () => {
    mockRequestPermission.mockResolvedValue(false as any);
    await NotificationEngine.evaluate({
      sensorData: sensor(),
      profile,
      todayLogs: [],
      solvedRisk: risk(90),
    });

    expect(mockDisplayNotification).not.toHaveBeenCalled();

    // The trigger was raised and suppressed, so either no state was written at
    // all or it was written without a timestamp for this trigger. Both are the
    // same claim: the cooldown was not spent.
    const raw = mockStore.get(ENGINE_STATE_KEY);
    const lastAlerts = raw ? JSON.parse(raw).lastAlerts ?? {} : {};
    expect(lastAlerts.high_risk).toBeUndefined();
  });

  test('and the alert still lands once permission is granted', async () => {
    // The point of not spending the cooldown: the next evaluation delivers.
    mockRequestPermission.mockResolvedValue(false as any);
    await NotificationEngine.evaluate({
      sensorData: sensor(),
      profile,
      todayLogs: [],
      solvedRisk: risk(90),
    });
    expect(mockDisplayNotification).not.toHaveBeenCalled();

    mockRequestPermission.mockResolvedValue(true as any);
    await NotificationEngine.evaluate({
      sensorData: sensor(),
      profile,
      todayLogs: [],
      solvedRisk: risk(90),
    });

    expect(mockDisplayNotification).toHaveBeenCalled();
  });
});

describe('EC-10: the sleep window is absolute', () => {
  /**
   * EC-10 originally asserted the opposite: that a high-risk alert bypasses
   * quiet hours and is delivered at 02:00 with `ignoreSleepWindow`. That was
   * never built, and it contradicts a decision the engine states outright —
   * "the sleep window is an absolute block: if the user is asleep, nothing is
   * delivered and cooldown state is not updated".
   *
   * The decision was kept rather than the assertion. Hydration is not a
   * condition that deteriorates in the minutes it takes to reach morning, and
   * an app that wakes someone at 2 AM about drinking water is one whose
   * notifications get turned off entirely — at which point it cannot warn
   * them about anything. The alert is not lost: the engine re-raises the
   * trigger on the next evaluation after wake-up, because a suppressed alert
   * also leaves its cooldown unspent.
   *
   * This now pins the behaviour that actually exists, so the conflict cannot
   * be reintroduced silently.
   */
  test('nothing is delivered at 02:00, not even a high-risk alert', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 1, 2, 0, 0));
    try {
      await NotificationEngine.evaluate({
        sensorData: sensor({ temperature: 38 }),
        profile,
        todayLogs: [],
        solvedRisk: risk(90),
      });
    } finally {
      jest.useRealTimers();
    }

    expect(mockDisplayNotification).not.toHaveBeenCalled();
  });

  test('the same conditions do deliver once the user is awake', async () => {
    // Same inputs, same profile, middle of the afternoon: the suppression is
    // the sleep window and nothing else.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 1, 14, 0, 0));
    try {
      await NotificationEngine.evaluate({
        sensorData: sensor({ temperature: 38 }),
        profile,
        todayLogs: [],
        solvedRisk: risk(90),
      });
    } finally {
      jest.useRealTimers();
    }

    expect(firedTitles()).toContain('🚨 High Risk');
  });
});

describe('EC-11: fluctuating scores do not produce repeated alerts', () => {
  test('trigger at 60, hold through the 40-60 dead band, recover below 40', async () => {
    expect(RISK_THRESHOLDS.ELEVATED).toBe(60);
    expect(RISK_THRESHOLDS.RECOVERY).toBe(40);

    jest.useFakeTimers();
    const base = new Date(2026, 8, 1, 14, 0, 0).getTime();
    try {
      /**
       * 1800 mL half an hour ago — 72% of the 2500 mL target.
       *
       * The day's intake is deliberately healthy so that no hydration rule is
       * raised alongside the risk ones: the engine delivers a single
       * notification per evaluation, and this test is about the risk band, not
       * about which of two true conditions wins the tick.
       */
      const healthyDay = (nowMs: number) => [
        {
          id: 'ec11-log',
          timestamp: new Date(nowMs - 30 * 60_000).toISOString(),
          reportedAt: new Date(nowMs - 30 * 60_000).toISOString(),
          amountMl: 1800,
          source: 'manual' as const,
        },
      ];

      const at = async (offsetMs: number, score: number) => {
        jest.setSystemTime(base + offsetMs);
        const { delivered } = await NotificationEngine.evaluate({
          sensorData: sensor(),
          profile,
          todayLogs: healthyDay(base + offsetMs),
          solvedRisk: risk(score),
        });
        return delivered;
      };

      expect(await at(0, 65)).toContain('elevated_risk');

      // Inside the dead band an hour later: neither a new alert nor a recovery.
      const deadBand = await at(3600_000, 50);
      expect(deadBand).not.toContain('elevated_risk');
      expect(deadBand).not.toContain('risk_improved');

      // Below the recovery threshold: exactly one recovery message.
      expect(await at(2 * 3600_000, 35)).toContain('risk_improved');
      expect(await at(3 * 3600_000, 30)).not.toContain('risk_improved');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('EC-12: phone formatted — the profile is restored from the backend', () => {
  test('a wiped device rebuilds the profile from the stored row', async () => {
    mockStore.clear(); // nothing local survives a format
    mockDb.profile = { ...profile, fullName: 'Restored User', targetDailyMl: 3000 };

    const restored = await ProfileService.fetchProfile('test-user-123');
    expect(restored).not.toBeNull();
    expect(restored!.fullName).toBe('Restored User');
    expect(restored!.sleepSchedule).toEqual({ sleepStart: '23:00', wakeUp: '07:00' });

    // The stored 3000 is *not* what comes back. The goal is derived, and the
    // row's copy of it is only ever as fresh as the last save — so it is
    // recomputed on read from the answers that are stored: 62 kg × 49.1 ×
    // 1.00, the PBWR baseline for a 30-year-old woman, with an indoor work
    // environment adding nothing.
    expect(restored!.targetDailyMl).toBe(3044);
  });

  test('a stale stored goal never outranks a physician limit', async () => {
    mockStore.clear();
    // The dangerous shape: a row written before the physician gate existed, so
    // it carries a fluid-restricted diagnosis, a doctor's limit, and a goal
    // computed by the old formula that ignored the limit entirely.
    mockDb.profile = {
      ...profile,
      medicalConditions: ['ckd'],
      physicianLimitMl: 1000,
      targetDailyMl: 3250,
    };

    const restored = await ProfileService.fetchProfile('test-user-123');
    // The doctor's number wins, not the cached one.
    expect(restored!.targetDailyMl).toBe(1000);
  });

  test('a restricted row with no limit on file comes back with a recomputed goal', async () => {
    // The physician limit is optional: the stored goal is recomputed from the
    // formula rather than dropped.
    mockStore.clear();
    mockDb.profile = { ...profile, medicalConditions: ['ckd'], targetDailyMl: 3250 };

    const restored = await ProfileService.fetchProfile('test-user-123');
    expect(restored!.targetDailyMl).toEqual(expect.any(Number));
  });

  test('a user with no stored row resolves to null rather than a fabricated profile', async () => {
    mockDb.profile = null;
    expect(await ProfileService.fetchProfile('test-user-123')).toBeNull();
  });
});

describe('EC-13: app deleted and reinstalled — cloud state parity', () => {
  test('today’s intake comes back from the backend with empty local storage', async () => {
    mockStore.clear();
    const iso = new Date().toISOString();
    mockDb.logRows = [
      { id: 'r1', timestamp: iso, reported_at: iso, amount_ml: 500, source: 'manual', verification_source: 'user-reported' },
      { id: 'r2', timestamp: iso, reported_at: iso, amount_ml: 250, source: 'ai_chat', verification_source: 'user-reported' },
    ];
    mockDb.profile = { ...profile, targetDailyMl: 2800 };

    const totals = await HydrationService.getTodayTotals('test-user-123');
    expect(totals.totalMl).toBe(750);
    expect(totals.targetMl).toBe(2800);
  });

  test('a backend read failure degrades to an empty day rather than throwing', async () => {
    mockDb.selectError = { message: 'network unreachable' };
    const logs = await HydrationService.fetchTodayLogs('test-user-123');
    expect(logs).toEqual([]);
  });
});

describe('EC-14: AI credits exhausted — fall back to rule-based notifications', () => {
  /**
   * A waking Tuesday afternoon, pinned.
   *
   * An AI nudge respects the quiet window like every other notification, and
   * this profile sleeps 23:00-07:00 — so running the suite late in the evening
   * used to fail these four on a rule they are not about. The clock is the
   * input here, so it is stated rather than inherited from whoever ran it.
   */
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 1, 14, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
    NotificationEngine.setAiQuotaExhausted(false);
  });

  test('an exhausted quota degrades the AI nudge to its rule-based equivalent', async () => {
    NotificationEngine.setAiQuotaExhausted(true);
    expect(NotificationEngine.isAiQuotaExhausted()).toBe(true);

    await NotificationEngine.triggerAI('reminder', profile);

    // The plain reminder goes out; the AI-phrased one does not.
    expect(firedTitles()).toContain('💧 Hydration');
    expect(firedTitles()).not.toContain('🤖 Smart Nudge');
  });

  test('each AI nudge has a rule-based substitute, and progress alone is dropped', async () => {
    NotificationEngine.setAiQuotaExhausted(true);

    const substitutes: Array<[Parameters<typeof NotificationEngine.triggerAI>[0], string | null]> = [
      ['reminder', '💧 Hydration'],
      ['insight', '⚠️ Below Target'],
      ['activity', '💪 Post-Activity'],
      ['risk', '📈 Elevated Risk'],
      ['progress', null], // congratulatory — not worth waking the user without AI text
    ];

    for (const [type, expectedTitle] of substitutes) {
      mockStore.clear(); // reset the 12-hour spam gate between nudges
      mockDisplayNotification.mockClear();
      await NotificationEngine.triggerAI(type, profile);

      if (expectedTitle) {
        expect(firedTitles()).toEqual([expectedTitle]);
      } else {
        expect(mockDisplayNotification).not.toHaveBeenCalled();
      }
    }
  });

  test('the AI nudge returns once the quota is restored', async () => {
    NotificationEngine.setAiQuotaExhausted(true);
    await NotificationEngine.triggerAI('reminder', profile);
    expect(firedTitles()).toContain('💧 Hydration');

    mockStore.clear();
    mockDisplayNotification.mockClear();
    NotificationEngine.setAiQuotaExhausted(false);
    await NotificationEngine.triggerAI('reminder', profile);
    expect(firedTitles()).toContain('🤖 Smart Nudge');
  });

  test('a rule-based substitute still consumes the 12-hour spam gate', async () => {
    NotificationEngine.setAiQuotaExhausted(true);
    await NotificationEngine.triggerAI('reminder', profile);
    expect(firedTitles()).toContain('💧 Hydration');

    mockDisplayNotification.mockClear();
    await NotificationEngine.triggerAI('insight', profile);
    expect(mockDisplayNotification).not.toHaveBeenCalled();
  });

  test('a rule-based equivalent exists for every AI nudge', async () => {
    // Even without the quota switch, the rule-based path must be able to cover
    // the same ground: an unhydrated afternoon must still raise a non-AI alert.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 1, 16, 0, 0));
    try {
      await NotificationEngine.evaluate({
        sensorData: sensor(),
        profile,
        todayLogs: [],
        solvedRisk: risk(null),
      });
    } finally {
      jest.useRealTimers();
    }
    expect(firedTitles()).toContain('⚠️ Below Target');
  });
});

describe('EC-15: AI spam protection — one nudge per 12 hours', () => {
  test('a second AI trigger inside 12 hours is suppressed', async () => {
    jest.useFakeTimers();
    const base = new Date(2026, 8, 1, 9, 0, 0).getTime();
    try {
      jest.setSystemTime(base);
      await NotificationEngine.triggerAI('reminder', profile);
      expect(firedTitles()).toContain('🤖 Smart Nudge');

      mockDisplayNotification.mockClear();
      jest.setSystemTime(base + 6 * 3600_000);
      await NotificationEngine.triggerAI('insight', profile);
      expect(mockDisplayNotification).not.toHaveBeenCalled();

      // Past the 12-hour gate the next nudge is allowed through.
      jest.setSystemTime(base + 13 * 3600_000);
      await NotificationEngine.triggerAI('insight', profile);
      expect(firedTitles()).toContain('🤖 Intake Insight');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('EC-16: unknown device / charging state — null propagation', () => {
  test('an all-null reading yields no score rather than a zero score', () => {
    const result = HydrationRiskEngine.solveRisk({
      heartRate: null,
      activityLoad: null,
      temperature: null,
      humidity: null,
      timeSinceWaterIntake: null,
    });
    expect(result.score).toBeNull();
    expect(result.status).toBe('Insufficient Data');
  });

  test('two missing inputs are enough to withhold a score', () => {
    const result = HydrationRiskEngine.solveRisk({
      heartRate: 70,
      activityLoad: 30,
      temperature: 25,
      humidity: null,
      timeSinceWaterIntake: null,
    });
    expect(result.score).toBeNull();
    expect(result.status).toBe('Insufficient Data');
  });

  test('a null battery level raises neither the low nor the full alert', async () => {
    await NotificationEngine.evaluate({
      sensorData: sensor({ batteryLevel: null }),
      profile,
      todayLogs: [],
      solvedRisk: risk(null),
    });
    expect(firedTitles()).not.toContain('🔋 Low Battery');
    expect(firedTitles()).not.toContain('⚡ Fully Charged');
  });
});

describe('EC-17: physical damage — three consecutive dead snapshots', () => {
  const snapshot = (date: string, dead: boolean) => ({
    date,
    avgTemp: dead ? null : 25,
    avgHumidity: dead ? null : 50,
    totalSteps: dead ? null : 5000,
    avgHeartRate: dead ? null : 70,
  });

  test('three consecutive all-null snapshots read as damage', async () => {
    mockStore.set(
      TELEMETRY_KEY,
      JSON.stringify([snapshot('2026-08-28', false), snapshot('2026-08-29', true), snapshot('2026-08-30', true), snapshot('2026-08-31', true)])
    );
    expect(await TelemetryHistoryService.checkDeviceDamage()).toBe(true);
  });

  test('a single good reading in the window clears the verdict', async () => {
    mockStore.set(
      TELEMETRY_KEY,
      JSON.stringify([snapshot('2026-08-29', true), snapshot('2026-08-30', false), snapshot('2026-08-31', true)])
    );
    expect(await TelemetryHistoryService.checkDeviceDamage()).toBe(false);
  });

  test('fewer than three snapshots is not enough evidence', async () => {
    mockStore.set(TELEMETRY_KEY, JSON.stringify([snapshot('2026-08-30', true), snapshot('2026-08-31', true)]));
    expect(await TelemetryHistoryService.checkDeviceDamage()).toBe(false);
  });

  test('no history at all is not damage', async () => {
    expect(await TelemetryHistoryService.checkDeviceDamage()).toBe(false);
  });
});
