/**
 * Behavioural verification of every notification the app can raise (N1–N24).
 *
 * The existing `edgeCases.test.ts` asserts that the triggers *exist*; this
 * suite drives `NotificationEngine.evaluate` with a crafted world (clock,
 * sensors, logs, risk score, persisted cooldown state) and asserts that the
 * notification the spec promises is the one that actually reaches
 * `NotificationService.displayNotification`.
 *
 *   npx jest --config jest.config.logic.js __tests__/notificationTriggers.test.ts
 */

import { unhedgedWord } from '../src/utils/notificationCopy';
import type {
  SensorData,
  UserProfile,
  HydrationLog,
  HydrationRiskDetails,
} from '../src/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/** In-memory AsyncStorage so the engine's cooldown state really persists. */
const mockStore = new Map<string, string>();

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

const mockDisplayNotification = jest.fn((..._args: any[]) => Promise.resolve());
const mockRequestPermission = jest.fn((..._args: any[]) => Promise.resolve(true));
/**
 * The quiet window as `NotificationService` sees it — the persisted schedule,
 * which is a different source from the one on the profile. The engine has to
 * honour either of them saying "asleep", so the two are driven apart here.
 */
const mockIsSleeping = jest.fn((..._args: any[]) => Promise.resolve(false));

// The factory runs while the hoisted imports resolve, i.e. before the `const`s
// above are initialised — so every reference to them has to be lazy.
const mockMsSinceLastNotification = jest.fn(() => Promise.resolve(Infinity));

jest.mock('../src/services/NotificationService', () => ({
  __esModule: true,
  default: {
    requestPermission: (...args: any[]) => mockRequestPermission.apply(null, args as []),
    displayNotification: (...args: any[]) => mockDisplayNotification.apply(null, args as []),
    scheduleHydrationReminders: () => Promise.resolve(),
    isSleeping: (...args: any[]) => mockIsSleeping.apply(null, args as []),
    // The gap between alerts now spans both delivery paths — the engine's own
    // and the scheduled reminder's — so it reads this shared stamp rather than
    // only its own state. Infinity is "nothing has been shown yet".
    msSinceLastNotification: (...args: any[]) => mockMsSinceLastNotification.apply(null, args as []),
    noteNotificationShown: () => Promise.resolve(),
    noteIntakeLogged: () => Promise.resolve(),
  },
}));

const mockGetHistory = jest.fn(() => Promise.resolve([] as any[]));

jest.mock('../src/services/TelemetryHistoryService', () => ({
  __esModule: true,
  default: {
    getHistory: (...args: any[]) => mockGetHistory.apply(null, args as []),
    isFresh: () => true,
  },
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {},
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  AndroidStyle: { BIGTEXT: 1 },
}));

jest.mock('@react-native-firebase/messaging', () => ({}));

import NotificationEngine, {
  NotificationOutcome,
  NotificationTrigger,
} from '../src/services/NotificationEngine';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const ENGINE_STATE_KEY = 'getvari_notification_engine_state';

/**
 * Titles are unique per trigger, so the delivered title is a faithful way to
 * name which of the 24 notifications actually fired.
 */
const TITLE_TO_TRIGGER: Record<string, NotificationTrigger> = {
  '💧 Hydration': 'regular_reminder',
  '⚠️ Low Intake': 'low_intake_12pm',
  '⚠️ Below Target': 'below_target_4pm',
  '🕒 Hydration Gap': 'no_water_3h',
  '🎉 Goal Achieved': 'goal_achieved',
  '📈 Elevated Risk': 'elevated_risk',
  '🚨 High Risk': 'high_risk',
  '✅ Risk Improved': 'risk_improved',
  '🔥 Extreme Heat': 'extreme_heat',
  '☀️ High Temperature': 'high_temp',
  '💧 High Humidity': 'high_humidity',
  '🚶 Inactivity': 'inactivity',
  '💪 Post-Activity': 'post_activity',
  '🏃 Long Activity': 'long_activity',
  '🔋 Low Battery': 'low_battery',
  '⚡ Fully Charged': 'fully_charged',
  '🌅 Good Morning': 'morning_msg',
  '🌙 Bedtime': 'night_msg',
  '📊 Weekly Progress': 'weekly_summary',
  '🤖 Smart Nudge': 'ai_reminder',
  '🤖 Intake Insight': 'ai_insight',
  '🤖 Activity Note': 'ai_activity',
  '🤖 Smart Risk': 'ai_risk',
  '🤖 Pattern Alert': 'ai_progress',
};

const baseProfile = (over: Partial<UserProfile> = {}): UserProfile => ({
  age: 30,
  gender: 'female',
  weightKg: 62,
  activityLevel: 'moderate' as any,
  fitnessGoal: 'maintain' as any,
  workEnvironment: 'indoor' as any,
  waterHabit: 'average' as any,
  targetDailyMl: 2500,
  sleepSchedule: { sleepStart: '23:00', wakeUp: '07:00' },
  ...over,
});

const baseSensor = (over: Partial<SensorData> = {}): SensorData => ({
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

/**
 * A log written `hoursAgo` before the scenario's clock.
 *
 * The offset is kept and resolved inside `fire`, after the system time has
 * been set — building the timestamp here would anchor it to whatever the
 * previous test left on the clock.
 */
type RelativeLog = HydrationLog & { readonly hoursAgo: number };

const logAt = (hoursAgo: number, amountMl: number): RelativeLog => ({
  id: `log-${hoursAgo}-${amountMl}`,
  timestamp: '',
  reportedAt: '',
  amountMl,
  source: 'manual',
  hoursAgo,
});

const resolveLogs = (logs: RelativeLog[]): HydrationLog[] =>
  logs.map(({ hoursAgo, ...log }) => {
    const at = new Date(Date.now() - hoursAgo * 3600_000).toISOString();
    return { ...log, timestamp: at, reportedAt: at };
  });

interface Scenario {
  at: Date;
  sensor?: Partial<SensorData>;
  profile?: Partial<UserProfile>;
  logs?: RelativeLog[];
  score?: number | null;
  /** Seed the engine's persisted state (cooldowns, activity timers). */
  state?: {
    lastAlerts?: Record<string, number>;
    activeStartTimestamp?: number | null;
    inactiveStartTimestamp?: number | null;
    lastDeliveredAt?: number;
    riskAlertActive?: boolean;
  };
}

/** Runs one evaluation and returns both halves of its decision. */
const evaluate = async (s: Scenario): Promise<NotificationOutcome> => {
  jest.setSystemTime(s.at);
  if (s.state) {
    mockStore.set(
      ENGINE_STATE_KEY,
      JSON.stringify({
        lastAlerts: s.state.lastAlerts ?? {},
        activeStartTimestamp: s.state.activeStartTimestamp ?? null,
        inactiveStartTimestamp: s.state.inactiveStartTimestamp ?? null,
        lastDeliveredAt: s.state.lastDeliveredAt ?? 0,
        riskAlertActive: s.state.riskAlertActive ?? false,
      })
    );
  }
  mockDisplayNotification.mockClear();

  return NotificationEngine.evaluate({
    sensorData: baseSensor(s.sensor),
    profile: baseProfile(s.profile),
    todayLogs: resolveLogs(s.logs ?? []),
    solvedRisk: risk(s.score === undefined ? null : s.score),
  });
};

/**
 * The triggers whose conditions held this tick.
 *
 * Rule tests assert on this rather than on what reached the tray: only one
 * notification is delivered per evaluation (burst control), so a rule that
 * fires alongside a more urgent one is correct even though it is held back.
 * Delivery itself is covered by `fire` and the "Burst control" suite.
 */
const raise = async (s: Scenario): Promise<NotificationTrigger[]> =>
  (await evaluate(s)).raised;

/** Runs one evaluation and returns the triggers that were actually delivered. */
const fire = async (s: Scenario): Promise<NotificationTrigger[]> => {
  await evaluate(s);
  return mockDisplayNotification.mock.calls
    .map((call: any[]) => TITLE_TO_TRIGGER[call[0]])
    .filter(Boolean) as NotificationTrigger[];
};

/** The bodies of everything delivered this tick, in order. */
const bodies = (): string[] => mockDisplayNotification.mock.calls.map((call: any[]) => call[1]);

/** The body delivered under `title`, or undefined when nothing was. */
const bodyOf = (title: string): string | undefined =>
  mockDisplayNotification.mock.calls.find((call: any[]) => call[0] === title)?.[1];

/** Monday, so the weekly-summary window is reachable. */
const MONDAY = (h: number, m = 0) => new Date(2026, 7, 31, h, m, 0, 0);
/** Tuesday, for everything that must not collide with the weekly summary. */
const TUESDAY = (h: number, m = 0) => new Date(2026, 8, 1, h, m, 0, 0);

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  mockStore.clear();
  mockDisplayNotification.mockClear();
  mockRequestPermission.mockClear();
  mockRequestPermission.mockResolvedValue(true as any);
  mockIsSleeping.mockClear();
  mockIsSleeping.mockResolvedValue(false as any);
  mockGetHistory.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// N1–N24: every trigger fires under the condition the spec describes
// ---------------------------------------------------------------------------

describe('Notification triggers N1-N24', () => {
  test('N1: regular_reminder is delivered by the scheduler, not by evaluate()', async () => {
    // The 2-minute hydration nudge is queued by
    // NotificationService.scheduleHydrationReminders (covered in
    // reminderScheduling.test.ts). evaluate() must never raise it itself,
    // otherwise the user gets the same nudge twice.
    const raised = await raise({ at: TUESDAY(14), logs: [logAt(0.2, 250)] });
    expect(raised).not.toContain('regular_reminder');
  });

  test('N2: low_intake_12pm fires at the midpoint of the awake day below 50% of target', async () => {
    const raised = await raise({ at: TUESDAY(15), logs: [logAt(1, 500)] });
    expect(raised).toContain('low_intake_12pm');
  });

  test('N2b: low_intake_12pm stays silent at noon when already above 50%', async () => {
    const raised = await raise({ at: TUESDAY(12), logs: [logAt(1, 1600)] });
    expect(raised).not.toContain('low_intake_12pm');
  });

  test('N3: simulated notifications are scheduled, not raised dynamically by evaluate()', async () => {
    const raised = await raise({ at: TUESDAY(16), logs: [logAt(1, 1000)] });
    expect(raised).not.toContain('below_target_4pm');
    expect(raised).not.toContain('focus_alert');
    expect(raised).not.toContain('priority_alert');
  });

  test('N4: the old 3-hour hydration-gap trigger is disabled', async () => {
    const raised = await raise({ at: TUESDAY(14), logs: [logAt(4, 250)] });
    expect(raised).not.toContain('no_water_3h');
  });

  test('N4b: no_water_3h stays silent inside the 3-hour window', async () => {
    const raised = await raise({ at: TUESDAY(14), logs: [logAt(1, 250)] });
    expect(raised).not.toContain('no_water_3h');
  });

  test('N5: goal_achieved fires once the daily target is met', async () => {
    const raised = await raise({ at: TUESDAY(18), logs: [logAt(1, 2600)] });
    expect(raised).toContain('goal_achieved');
  });

  test('N6: elevated_risk is scheduled via clock-time simulation, not raised by evaluate()', async () => {
    const raised = await raise({ at: TUESDAY(14), score: 65, logs: [logAt(1, 900)] });
    expect(raised).not.toContain('elevated_risk');
  });

  test('N7: high_risk fires at score >= 80', async () => {
    const raised = await raise({ at: TUESDAY(14), score: 85, logs: [logAt(1, 900)] });
    expect(raised).toContain('high_risk');
  });

  test('N8: risk_improved is scheduled via clock-time simulation, not raised by evaluate()', async () => {
    const now = TUESDAY(14).getTime();
    const raised = await raise({
      at: TUESDAY(14),
      score: 30,
      logs: [logAt(1, 900)],
      state: { lastAlerts: { high_risk: now - 3600_000 }, riskAlertActive: true },
    });
    expect(raised).not.toContain('risk_improved');
  });

  test('N11: high_temp fires between 30 and 35 °C', async () => {
    const raised = await raise({ at: TUESDAY(14), sensor: { temperature: 31 }, logs: [logAt(1, 900)] });
    expect(raised).toContain('high_temp');
    expect(raised).not.toContain('extreme_heat');
  });

  test('N12: extreme_heat is not part of the current notification specification', async () => {
    const raised = await raise({ at: TUESDAY(14), sensor: { temperature: 38 }, logs: [logAt(1, 900)] });
    expect(raised).not.toContain('extreme_heat');
    expect(raised).not.toContain('high_temp');
  });

  test('N13: high_humidity fires at or above 70% RH', async () => {
    const raised = await raise({ at: TUESDAY(14), sensor: { humidity: 80 }, logs: [logAt(1, 900)] });
    expect(raised).toContain('high_humidity');
  });

  // N17/N18 — the 07:00 and 22:00 messages are queued with the OS by
  // NotificationService.scheduleDailyNotifications (covered in
  // reminderScheduling.test.ts) so they arrive at their own time rather than
  // whenever the dashboard next mounts. evaluate() must not raise them too, or
  // the user gets each greeting twice.
  test('N17/N18: the daily greetings are not raised by evaluate()', async () => {
    expect(await raise({ at: TUESDAY(7, 0), logs: [logAt(0.2, 250)] })).not.toContain('morning_msg');
    expect(await raise({ at: TUESDAY(22, 0), logs: [logAt(0.2, 250)] })).not.toContain('night_msg');
  });

  test('N19: weekly_summary is switched off and never raised', async () => {
    const raised = await raise({ at: MONDAY(8), logs: [logAt(0.2, 250)] });
    expect(raised).not.toContain('weekly_summary');
  });

  test('N19b: no Weekly Progress notification is shown on a Monday', async () => {
    jest.setSystemTime(MONDAY(8));
    mockDisplayNotification.mockClear();
    mockGetHistory.mockResolvedValue([{}, {}]);
    await NotificationEngine.evaluate({
      sensorData: baseSensor(),
      profile: baseProfile(),
      todayLogs: resolveLogs([logAt(0.2, 250)]),
      solvedRisk: risk(null),
    });
    const summary = mockDisplayNotification.mock.calls.find((c: any[]) => c[0] === '📊 Weekly Progress');
    expect(summary).toBeUndefined();
  });

  test('N20-N24: obsolete/AI triggers are not raised by evaluate()', async () => {
    const raised = await raise({ at: TUESDAY(11), logs: [] });
    expect(raised).not.toContain('ai_reminder');
    expect(raised).not.toContain('ai_insight');
    expect(raised).not.toContain('ai_activity');
    expect(raised).not.toContain('ai_risk');
    expect(raised).not.toContain('ai_progress');
  });
});

// ---------------------------------------------------------------------------
// Delivery rules: cooldowns, once-per-day, quiet hours, permission
// ---------------------------------------------------------------------------

describe('Notification delivery rules', () => {
  test('risk alerts respect the 30-minute cooldown', async () => {
    const first = await fire({ at: TUESDAY(14), score: 85, logs: [logAt(1, 900)] });
    expect(first).toContain('high_risk');

    // 10 minutes later — still inside the cooldown.
    const second = await fire({ at: TUESDAY(14, 10), score: 85, logs: [logAt(1, 900)] });
    expect(second).not.toContain('high_risk');

    // 35 minutes after the first — cooldown expired.
    const third = await fire({ at: TUESDAY(14, 35), score: 85, logs: [logAt(1, 900)] });
    expect(third).toContain('high_risk');
  });

  test('environmental alerts are limited to once per day', async () => {
    // Enough logged that no intake alert competes for the one delivery slot.
    const first = await fire({ at: TUESDAY(12), sensor: { temperature: 31 }, logs: [logAt(1, 2000)] });
    expect(first).toContain('high_temp');

    const second = await fire({ at: TUESDAY(13), sensor: { temperature: 31 }, logs: [logAt(1, 2000)] });
    expect(second).not.toContain('high_temp');

    const third = await fire({ at: new Date(2026, 8, 2, 12), sensor: { temperature: 31 }, logs: [logAt(1, 2000)] });
    expect(third).toContain('high_temp');
  });

  test('goal_achieved is delivered at most once per day', async () => {
    expect(await fire({ at: TUESDAY(18), logs: [logAt(1, 2600)] })).toContain('goal_achieved');
    expect(await fire({ at: TUESDAY(19), logs: [logAt(1, 2600)] })).not.toContain('goal_achieved');
  });

  test('routine notifications are muted inside the sleep window', async () => {
    // 02:00, inside the default 23:00-07:00 window.
    const fired = await fire({ at: TUESDAY(2), sensor: { temperature: 38 }, logs: [logAt(5, 2600)] });
    expect(fired).not.toContain('goal_achieved');
  });

  test('critical risk alerts are raised during sleep but NOT delivered', async () => {
    jest.setSystemTime(TUESDAY(2));
    mockDisplayNotification.mockClear();
    mockStore.clear();
    const evaluation = await NotificationEngine.evaluate({
      sensorData: baseSensor(),
      profile: baseProfile(),
      todayLogs: [],
      solvedRisk: risk(90),
    });

    expect(evaluation.raised).toContain('high_risk');
    expect(evaluation.delivered).toHaveLength(0);
    expect(mockDisplayNotification).not.toHaveBeenCalled();

    // Verify lastAlerts was NOT updated (important for cooldown logic)
    const state = JSON.parse(mockStore.get(ENGINE_STATE_KEY) || '{}');
    expect(state.lastAlerts?.high_risk).toBeUndefined();
  });

  test('the stored quiet window silences the app even with none on the profile', async () => {
    mockIsSleeping.mockResolvedValue(true as any);

    const fired = await fire({
      at: TUESDAY(14),
      profile: { sleepSchedule: undefined },
      sensor: { temperature: 38 },
      score: 85,
      logs: [logAt(5, 400)],
    });

    expect(fired).toHaveLength(0);
  });

  test('a window on the profile still silences the app on its own', async () => {
    mockIsSleeping.mockResolvedValue(false as any);
    const fired = await fire({ at: TUESDAY(2), sensor: { temperature: 38 }, score: 85 });
    expect(fired).toHaveLength(0);
  });

  test('nothing is delivered when notification permission is denied', async () => {
    mockRequestPermission.mockResolvedValue(false as any);
    const fired = await fire({ at: TUESDAY(14), score: 85, logs: [logAt(4, 900)] });
    expect(fired).toHaveLength(0);
  });

  test('cooldown state does NOT advance while permission is denied', async () => {
    mockRequestPermission.mockResolvedValue(false as any);
    await fire({ at: TUESDAY(14), score: 85, logs: [logAt(1, 900)] });

    const persisted = JSON.parse(mockStore.get(ENGINE_STATE_KEY) || '{}');
    expect(persisted.lastAlerts?.high_risk).toBeUndefined();
  });

  test('a missing sensor reading raises no environmental alert', async () => {
    const fired = await fire({
      at: TUESDAY(14),
      sensor: { temperature: null, humidity: null, batteryLevel: null, activityLoad: null },
      logs: [logAt(1, 1200)],
    });
    expect(fired).not.toContain('high_temp');
    expect(fired).not.toContain('high_humidity');
  });
});

// ---------------------------------------------------------------------------
// Burst control & Login quiet window
// ---------------------------------------------------------------------------

describe('Burst control', () => {
  const clump = {
    at: TUESDAY(14),
    sensor: { temperature: 38, humidity: 85 },
    logs: [logAt(4, 900)],
  };

  test('several simultaneous conditions deliver only one notification', async () => {
    const { raised, delivered } = await evaluate(clump);

    const expected = ['high_humidity'];
    expect(raised).toEqual(expect.arrayContaining(expected));
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toBe(raised[0]);
  });

  test('right after login nothing but a high risk alert is delivered for 5 minutes', async () => {
    try {
      NotificationEngine.markSessionStart(TUESDAY(14).getTime());
      const atLogin = await evaluate(clump);
      expect(atLogin.raised.length).toBeGreaterThan(0);
      expect(atLogin.delivered).toHaveLength(0);

      const critical = await evaluate({ ...clump, at: TUESDAY(14, 1), score: 90 });
      expect(critical.delivered).toEqual(['high_risk']);

      mockStore.clear();
      const later = await evaluate({ ...clump, at: TUESDAY(14, 6) });
      expect(later.delivered).toHaveLength(1);
    } finally {
      NotificationEngine.markSessionStart(0);
    }
  });

  test('overlapping evaluations at login do not each deliver', async () => {
    const results = await Promise.all([evaluate(clump), evaluate(clump), evaluate(clump)]);
    const total = results.reduce((n, r) => n + r.delivered.length, 0);
    expect(total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Immutable Excel Notification Copy Verification
// ---------------------------------------------------------------------------

describe('Notification wording', () => {
  test('high_risk carries the exact Excel copy', async () => {
    await evaluate({ at: TUESDAY(14), score: 85, logs: [logAt(4, 900)] });

    const highRiskMsg = bodyOf('🚨 High Risk');
    expect(highRiskMsg).toBe('High hydration risk detected. Please hydrate immediately and follow the recommended water intake.');
  });

  test('Stale risk_improved in pendingTriggers is NOT delivered when risk rises to 85', async () => {
    jest.setSystemTime(TUESDAY(14));
    mockDisplayNotification.mockClear();

    // Seed state with pendingTriggers: ['risk_improved'], riskAlertActive: true
    mockStore.set(
      ENGINE_STATE_KEY,
      JSON.stringify({
        lastAlerts: {},
        activeStartTimestamp: null,
        inactiveStartTimestamp: null,
        lastDeliveredAt: 0,
        riskAlertActive: true,
        pendingTriggers: ['risk_improved'],
      })
    );

    // Evaluate with high risk score (85)
    const outcome = await NotificationEngine.evaluate({
      sensorData: baseSensor(),
      profile: baseProfile(),
      todayLogs: [],
      solvedRisk: risk(85),
    });

    expect(outcome.delivered).not.toContain('risk_improved');
    expect(outcome.delivered).toContain('high_risk');

    // Verify risk_improved was removed from state's pendingTriggers
    const state = JSON.parse(mockStore.get(ENGINE_STATE_KEY) || '{}');
    expect(state.pendingTriggers).not.toContain('risk_improved');
  });
});

