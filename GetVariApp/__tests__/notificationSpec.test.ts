/**
 * The notification specification, end to end through the real
 * `NotificationService` with Notifee mocked: exact simulation times, actual
 * wake/sleep times, the sleep window, the quiet period after opening the app,
 * spacing, the hydration timer, missed alarms, Risk Improved gating, schedule
 * changes and duplicate prevention.
 *
 * Engine-side rules (risk 60-79, FDI/CDI, once-daily, temperature/humidity,
 * goal, PBWR 50%) are covered in `notificationTriggers.test.ts`.
 *
 *   npx jest --config jest.config.logic.js __tests__/notificationSpec.test.ts
 */

const mockStore = new Map<string, string>();
const mockQueued: Array<{ notification: any; trigger: any }> = [];
const mockOsQueue = new Map<string, any>();
const mockCancelledIds: string[] = [];
const mockCancelledDisplayed: string[] = [];
const mockShown: any[] = [];
/**
 * Native queue calls allowed before the fake process "stops" (frozen or
 * killed in the background): every create/cancel after that throws.
 */
let mockBudget = Infinity;
let mockCallsUsed = 0;
/** Ids whose create fails, to prove one failure does not stop the rest. */
const mockFailIds = new Set<string>();
const mockSpend = () => {
  if (mockCallsUsed >= mockBudget) throw new Error('process stopped');
  mockCallsUsed++;
};

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 33 },
  NativeModules: {},
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
  },
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    requestPermission: () => Promise.resolve({ authorizationStatus: 1 }),
    createChannel: (channel: any) => Promise.resolve(channel.id),
    deleteChannel: () => Promise.resolve(),
    getChannel: () => Promise.resolve(null),
    getTriggerNotificationIds: () => Promise.resolve([...mockOsQueue.keys()]),
    getTriggerNotifications: () => Promise.resolve([...mockOsQueue.values()]),
    cancelTriggerNotifications: (ids: string[]) => {
      mockSpend();
      mockCancelledIds.push(...ids);
      ids.forEach(id => mockOsQueue.delete(id));
      return Promise.resolve();
    },
    getDisplayedNotifications: () => Promise.resolve([]),
    cancelDisplayedNotifications: (ids: string[]) => {
      mockCancelledDisplayed.push(...ids);
      return Promise.resolve();
    },
    createTriggerNotification: (notification: any, trigger: any) => {
      mockSpend();
      if (mockFailIds.has(notification.id)) return Promise.reject(new Error(`native create failed: ${notification.id}`));
      mockQueued.push({ notification, trigger });
      // Same id replaces, as Notifee does.
      mockOsQueue.set(notification.id, { notification, trigger });
      return Promise.resolve(notification.id);
    },
    displayNotification: (notification: any) => {
      mockShown.push(notification);
      return Promise.resolve();
    },
    onForegroundEvent: () => () => {},
    onBackgroundEvent: () => {},
    getNotificationSettings: () => Promise.resolve({ authorizationStatus: 1, android: { alarm: 1 } }),
  },
  AlarmType: { SET_ALARM_CLOCK: 1, SET_EXACT_AND_ALLOW_WHILE_IDLE: 0 },
  AndroidCategory: { ALARM: 'alarm', REMINDER: 'reminder' },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  AndroidStyle: { BIGTEXT: 1 },
  AndroidNotificationSetting: { ENABLED: 1, DISABLED: 0 },
  AndroidVisibility: { PRIVATE: 0, PUBLIC: 1, SECRET: -1 },
  AuthorizationStatus: { DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 },
  EventType: { DISMISSED: 0, PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3 },
  TriggerType: { TIMESTAMP: 0 },
}));

jest.mock('@react-native-firebase/messaging', () => ({
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2 },
  getMessaging: () => ({}),
  getToken: () => Promise.resolve('token'),
  onMessage: () => () => {},
  requestPermission: () => Promise.resolve(1),
  setBackgroundMessageHandler: () => {},
}));

jest.mock('../src/services/NotificationHistory', () => ({
  __esModule: true,
  default: {
    recordDelivery: () => Promise.resolve(),
    recordPress: () => Promise.resolve(),
  },
}));

import { isAsleepAt } from '../src/utils/sleepWindow';
import { NOTIFICATION_SIMULATION } from '../src/config/edgeCaseConfig';
import NotificationService, {
  HYDRATION_REMINDER_TYPE,
  REMINDER_INTERVAL_MS,
  SHIFTED_ID_PREFIX,
  SIMULATED_ID_PREFIX,
  SIMULATED_SCHEDULE_SLOTS,
  clearOfScheduledSlots,
  calculateDailySimulatedSchedule,
  isInSilenceWindow,
  nextActiveAt,
} from '../src/services/NotificationService';

const MIN = 60_000;
const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m, 0, 0).getTime();
const clock = (t: number) => {
  const x = new Date(t);
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
};
const localDay = (t: number) => new Date(t).toDateString();
const queuedWith = (prefix: string) =>
  [...mockOsQueue.values()].filter(q => q.notification.id.startsWith(prefix));

/**
 * A scheduled notification as the OS hands it back on delivery. Each call is
 * a distinct notification: the service remembers processed event ids for the
 * life of the process, so reusing one across tests would leak state.
 */
let seq = 0;
const scheduled = (key: string, scheduledAt: number, extra: Record<string, string> = {}) => {
  const id = `spec-${key}-${++seq}`;
  return {
    id,
    title: key,
    body: key,
    data: { notificationKey: key, eventId: `${id}@${scheduledAt}`, ...extra },
  } as any;
};

beforeEach(async () => {
  jest.useFakeTimers();
  mockStore.clear();
  mockQueued.length = 0;
  mockOsQueue.clear();
  mockCancelledIds.length = 0;
  mockCancelledDisplayed.length = 0;
  mockShown.length = 0;
  NOTIFICATION_SIMULATION.ENABLED = true;
  NOTIFICATION_SIMULATION.CHECK_FIXED_SLOT_CONDITIONS = false;
  mockBudget = Infinity;
  mockCallsUsed = 0;
  mockFailIds.clear();
  NotificationService.markAppOpened(0);
  await NotificationService.clearSleepSchedule();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('Simulation: exact times', () => {
  test('the day is queued at exactly the specified times, tagged as simulation', async () => {
    const now = at(1, 6, 0);
    jest.setSystemTime(now);
    await NotificationService.setSleepSchedule({ sleepStart: '23:59', wakeUp: '06:00' });
    await NotificationService.scheduleSimulatedNotifications(now);

    const today = queuedWith(SIMULATED_ID_PREFIX)
      .filter(q => new Date(q.trigger.timestamp).getDate() === 1)
      .sort((a, b) => a.trigger.timestamp - b.trigger.timestamp)
      .map(q => `${clock(q.trigger.timestamp)} ${q.notification.data.notificationKey}`);

    expect(today).toEqual([
      '09:00 regular_reminder',
      '10:30 focus_alert',
      '11:00 elevated_risk',
      '11:30 risk_improved',
      '12:30 focus_alert',
      '14:30 priority_alert',
      '16:00 focus_alert',
      '17:00 regular_reminder',
      '18:30 priority_alert',
      '20:00 elevated_risk',
      '20:30 risk_improved',
      // Before Good Night (22:59): kept at its exact time.
      '22:30 regular_reminder',
    ]);
    for (const q of queuedWith(SIMULATED_ID_PREFIX)) {
      expect(q.notification.data.source).toBe('simulation');
      expect(q.notification.data.reason).toMatch(/^simulation slot \d\d:\d\d$/);
    }
  });

  test('slots inside the sleep window are never queued (22:00-07:00 drops 22:30)', async () => {
    const now = at(1, 6, 0);
    jest.setSystemTime(now);
    await NotificationService.setSleepSchedule({ sleepStart: '22:00', wakeUp: '07:00' });
    await NotificationService.scheduleSimulatedNotifications(now);

    const times = queuedWith(SIMULATED_ID_PREFIX).map(q => q.trigger.timestamp);
    expect(times.length).toBeGreaterThan(0);
    expect(times.some(t => clock(t) === '22:30')).toBe(false);
    expect(times.every(t => !isAsleepAt({ sleepStart: '22:00', wakeUp: '07:00' }, t))).toBe(true);
  });

  test('slots already past are not queued, so nothing fires late on app open', async () => {
    const now = at(1, 12, 0);
    jest.setSystemTime(now);
    await NotificationService.scheduleSimulatedNotifications(now);
    expect(queuedWith(SIMULATED_ID_PREFIX).every(q => q.trigger.timestamp > now)).toBe(true);
    expect(
      queuedWith(SIMULATED_ID_PREFIX).some(q => new Date(q.trigger.timestamp).getDate() === 1 && clock(q.trigger.timestamp) === '11:00')
    ).toBe(false);
  });

  test('turning simulation off clears the simulated queue and queues nothing', async () => {
    const now = at(1, 6, 0);
    jest.setSystemTime(now);
    await NotificationService.scheduleSimulatedNotifications(now);
    expect(queuedWith(SIMULATED_ID_PREFIX).length).toBeGreaterThan(0);

    NOTIFICATION_SIMULATION.ENABLED = false;
    await NotificationService.scheduleSimulatedNotifications(now);
    expect(queuedWith(SIMULATED_ID_PREFIX)).toHaveLength(0);
  });
});

describe('At actual: Good Morning / Good Night', () => {
  test('wake + 30 min and sleep - 1h, tagged as actual with the reason', async () => {
    const now = at(1, 5, 0);
    jest.setSystemTime(now);
    await NotificationService.setSleepSchedule({ sleepStart: '22:15', wakeUp: '06:45' });
    mockOsQueue.clear();
    await NotificationService.scheduleDailyNotifications(now);

    const firstDay = queuedWith('getvari-daily-').filter(q => new Date(q.trigger.timestamp).getDate() === 1);
    const byKey = Object.fromEntries(firstDay.map(q => [q.notification.data.notificationKey, q]));
    expect(clock(byKey.morning_msg.trigger.timestamp)).toBe('07:15');
    expect(clock(byKey.night_msg.trigger.timestamp)).toBe('21:15');
    expect(byKey.morning_msg.notification.data.source).toBe('actual');
    expect(byKey.morning_msg.notification.data.reason).toBe('wake-up 06:45 + 30 min');
    expect(byKey.night_msg.notification.data.reason).toBe('bedtime 22:15 - 1h');
  });
});

describe('Sleep window has absolute priority', () => {
  test('an immediate risk alert is not displayed during sleep', async () => {
    jest.setSystemTime(at(2, 3, 0));
    const shown = await NotificationService.displayNotification('🚨 High Risk', 'x', undefined, 'local', {
      notificationKey: 'high_risk',
    });
    expect(shown).toBe(false);
    expect(mockShown).toHaveLength(0);
  });

  test('a scheduled risk alert delivered during sleep is dropped', async () => {
    const t = at(2, 23, 30);
    jest.setSystemTime(t);
    expect(await NotificationService.acceptScheduledDelivery(scheduled('elevated_risk', t))).toBe(false);
  });

  test('cross-midnight window: 00:30 is asleep for 23:00-07:00, 06:59 too, 07:00 is not', async () => {
    for (const [time, asleep] of [[at(2, 0, 30), true], [at(2, 6, 59), true], [at(2, 7, 0), false]] as const) {
      jest.setSystemTime(time);
      expect(await NotificationService.isSleeping(time)).toBe(asleep);
    }
  });
});

describe('First 5 minutes after opening the app', () => {
  // The dynamic-path rules on their own; the fixed schedule's interplay is
  // covered in "Fixed schedule".
  beforeEach(() => {
    NOTIFICATION_SIMULATION.ENABLED = false;
  });

  test('nothing is displayed, then delivery resumes after 5 minutes', async () => {
    const opened = at(1, 14, 0);
    jest.setSystemTime(opened);
    NotificationService.markAppOpened(opened);

    jest.setSystemTime(opened + 4 * MIN);
    expect(
      await NotificationService.displayNotification('t', 'b', undefined, 'local', { notificationKey: 'high_humidity' })
    ).toBe(false);

    jest.setSystemTime(opened + 5 * MIN);
    expect(
      await NotificationService.displayNotification('t', 'b', undefined, 'local', { notificationKey: 'high_humidity' })
    ).toBe(true);
  });

  test('successful login: the Welcome is delivered immediately, with no 5-minute wait', async () => {
    // HomeScreen after login: the quiet period starts, then the owed welcome.
    const opened = at(1, 14, 0);
    jest.setSystemTime(opened);
    await NotificationService.queueWelcomeNotification(); // OtpScreen, on success
    NotificationService.markAppOpened(opened);
    await NotificationService.showPendingWelcome();

    expect(mockShown).toHaveLength(1);
    expect(mockShown[0].data.notificationKey).toBe('welcome');
    expect(mockShown[0].data.source).toBe('event');
    expect(mockShown[0].data.reason).toBe('login');
    // Exact copy, title and channel unchanged.
    expect(mockShown[0].title).toBe('💧 Welcome to GetVari');
    expect(mockShown[0].body).toBe(
      '💧 You’re all set! We’ll track your hydration and remind you when your body needs it. 💙'
    );
    expect(mockShown[0].android.channelId).toBe('hydration-reminders-v3');
    // Nothing deferred to later.
    expect(mockOsQueue.has('getvari-welcome')).toBe(false);
    expect(mockStore.has('getvari_pending_welcome')).toBe(false);
  });

  test('login 10 minutes after another notification: still immediate', async () => {
    await NotificationService.noteNotificationShown(at(1, 13, 50));
    jest.setSystemTime(at(1, 14, 0));
    await NotificationService.queueWelcomeNotification();
    NotificationService.markAppOpened(at(1, 14, 0));
    await NotificationService.showPendingWelcome();
    expect(mockShown.map(n => n.data.notificationKey)).toEqual(['welcome']);
  });

  test('opening the app without a new successful login does not trigger a Welcome', async () => {
    jest.setSystemTime(at(1, 14, 0));
    NotificationService.markAppOpened(at(1, 14, 0));
    await NotificationService.showPendingWelcome();
    expect(mockShown).toHaveLength(0);
    expect(mockOsQueue.has('getvari-welcome')).toBe(false);
  });

  test('one login gives one Welcome, however often the dashboard opens', async () => {
    jest.setSystemTime(at(1, 14, 0));
    await NotificationService.queueWelcomeNotification();
    for (const m of [0, 1, 20, 40]) {
      jest.setSystemTime(at(1, 14, m));
      NotificationService.markAppOpened(at(1, 14, m));
      await NotificationService.showPendingWelcome();
    }
    expect(mockShown.filter(n => n.data.notificationKey === 'welcome')).toHaveLength(1);
  });

  test('the immediate exemption is the Welcome’s alone: other notifications still wait out the quiet period', async () => {
    jest.setSystemTime(at(1, 14, 0));
    await NotificationService.queueWelcomeNotification();
    NotificationService.markAppOpened(at(1, 14, 0));
    await NotificationService.showPendingWelcome();
    jest.setSystemTime(at(1, 14, 1));
    expect(
      await NotificationService.displayNotification('t', 'b', undefined, 'local', { notificationKey: 'high_humidity' })
    ).toBe(false);
  });

  test('first login outside the quiet period: sent immediately', async () => {
    jest.setSystemTime(at(1, 14, 0));
    await NotificationService.queueWelcomeNotification();
    await NotificationService.showPendingWelcome();
    expect(mockShown).toHaveLength(1);
    expect(mockShown[0].data.notificationKey).toBe('welcome');
    expect(mockShown[0].data.source).toBe('event');
  });

  test('first login during sleep: the Welcome is still shown at once (the only sleep-window exception)', async () => {
    const opened = at(2, 1, 0);
    jest.setSystemTime(opened);
    NotificationService.markAppOpened(opened);
    await NotificationService.queueWelcomeNotification();
    await NotificationService.showPendingWelcome();
    expect(mockShown).toHaveLength(1);
    expect(mockShown[0].data.notificationKey).toBe('welcome');
    expect(mockOsQueue.has('getvari-welcome')).toBe(false);
    // Delivered, so no longer owed: not shown again for the same login.
    expect(mockStore.has('getvari_pending_welcome')).toBe(false);
  });

  test('a dynamic scheduled notification landing in the quiet period is shifted to its end, not burst', async () => {
    const opened = at(1, 14, 0);
    jest.setSystemTime(opened + 1 * MIN);
    NotificationService.markAppOpened(opened);

    const n = scheduled('focus_alert', opened + 1 * MIN);
    expect(await NotificationService.acceptScheduledDelivery(n)).toBe(false);
    const shifted = queuedWith(SHIFTED_ID_PREFIX);
    expect(shifted).toHaveLength(1);
    expect(shifted[0].trigger.timestamp).toBe(opened + 5 * MIN);
    expect(shifted[0].notification.data.originalEventId).toBe(n.data.eventId);
  });
});

describe('Spacing', () => {
  beforeEach(() => {
    NOTIFICATION_SIMULATION.ENABLED = false;
  });

  test('a 2-hour reminder is kept 30 minutes after the last notification; Dynamic ones are not', async () => {
    const t = at(1, 13, 0);
    jest.setSystemTime(t);
    expect(await NotificationService.acceptScheduledDelivery(scheduled('focus_alert', t))).toBe(true);

    // A Dynamic notification 20 minutes later is delivered at its time.
    jest.setSystemTime(t + 20 * MIN);
    expect(await NotificationService.acceptScheduledDelivery(scheduled('priority_alert', t + 20 * MIN))).toBe(true);

    // A 2-hour reminder 9 minutes after that is moved to 30 minutes after it.
    jest.setSystemTime(t + 29 * MIN);
    const reminder = scheduled('regular_reminder', t + 29 * MIN, { source: 'actual', type: HYDRATION_REMINDER_TYPE });
    expect(await NotificationService.acceptScheduledDelivery(reminder)).toBe(false);
    expect(queuedWith(SHIFTED_ID_PREFIX)[0].trigger.timestamp).toBe(t + 50 * MIN);
  });

  test('the same notification is not shown twice within one hour', async () => {
    const t = at(1, 14, 0);
    jest.setSystemTime(t);
    expect(await NotificationService.acceptScheduledDelivery(scheduled('focus_alert', t))).toBe(true);
    jest.setSystemTime(t + 45 * MIN);
    expect(await NotificationService.acceptScheduledDelivery(scheduled('focus_alert', t + 45 * MIN))).toBe(false);
    expect(queuedWith(SHIFTED_ID_PREFIX)[0].trigger.timestamp).toBe(t + 60 * MIN);
  });

  test('the 2-hour cadence is built clear of every simulated slot and daily message', async () => {
    NOTIFICATION_SIMULATION.ENABLED = true;
    jest.setSystemTime(at(1, 7, 10));
    await NotificationService.scheduleHydrationReminders(at(1, 7, 10));
    const sims = calculateDailySimulatedSchedule(undefined, new Date(2026, 8, 1));
    const cadence = queuedWith('hydration-reminder-').map(q => q.trigger.timestamp);
    expect(cadence.length).toBeGreaterThan(0);
    for (const t of cadence.filter(x => new Date(x).getDate() === 1)) {
      for (const s of sims) {
        const guard = s.trigger === 'regular_reminder' ? 60 * MIN : 30 * MIN;
        expect(Math.abs(t - s.timestamp)).toBeGreaterThanOrEqual(guard);
      }
      // Good Morning 08:00 and Good Night 22:00 for the default window.
      expect(Math.abs(t - at(1, 8))).toBeGreaterThanOrEqual(30 * MIN);
      expect(Math.abs(t - at(1, 22))).toBeGreaterThanOrEqual(30 * MIN);
    }
  });

  test('clearOfScheduledSlots only ever moves forward', () => {
    for (let m = 7 * 60; m < 23 * 60; m += 7) {
      const t = at(1, 0, m);
      expect(clearOfScheduledSlots(t)).toBeGreaterThanOrEqual(t);
    }
  });
});

describe('Hydration reminder timer', () => {
  test('logging water restarts the 2-hour countdown from the drink', async () => {
    const drink = at(1, 13, 20);
    jest.setSystemTime(drink);
    await NotificationService.noteIntakeLogged(drink);
    await NotificationService.scheduleHydrationReminders();

    const first = Math.min(...queuedWith('hydration-reminder-').map(q => q.trigger.timestamp));
    expect(first).toBe(drink + REMINDER_INTERVAL_MS);
  });

  test('opening the app later does not restart it', async () => {
    const drink = at(1, 13, 20);
    jest.setSystemTime(drink);
    await NotificationService.noteIntakeLogged(drink);
    await NotificationService.scheduleHydrationReminders();

    jest.setSystemTime(drink + 70 * MIN);
    await NotificationService.scheduleHydrationReminders();
    const first = Math.min(...queuedWith('hydration-reminder-').map(q => q.trigger.timestamp));
    expect(first).toBe(drink + REMINDER_INTERVAL_MS);
  });

  test('a slot missed while the app was closed is skipped, not sent on open', async () => {
    const drink = at(1, 13, 20);
    await NotificationService.noteIntakeLogged(drink);
    // Reopened at 15:40: the 15:20 slot has gone by.
    jest.setSystemTime(at(1, 15, 40));
    await NotificationService.scheduleHydrationReminders();
    const first = Math.min(...queuedWith('hydration-reminder-').map(q => q.trigger.timestamp));
    expect(first).toBeGreaterThan(at(1, 15, 40));
    expect(first).toBeGreaterThanOrEqual(drink + 2 * REMINDER_INTERVAL_MS);
  });

  test('a reminder arriving within 2 hours of a drink is withdrawn', async () => {
    const t = at(1, 14, 0);
    jest.setSystemTime(t);
    await NotificationService.noteIntakeLogged(t - 30 * MIN);
    const withdrawn = await NotificationService.suppressIfRecentlyHydrated({
      id: 'getvari-simulated-x',
      data: { type: HYDRATION_REMINDER_TYPE },
    } as any);
    expect(withdrawn).toBe(true);
  });

  test('the reminder queue is never inside the sleep window', async () => {
    jest.setSystemTime(at(1, 21, 0));
    await NotificationService.scheduleHydrationReminders(at(1, 21, 0));
    const times = queuedWith('hydration-reminder-').map(q => q.trigger.timestamp);
    expect(times.every(t => !isAsleepAt({ sleepStart: '23:00', wakeUp: '07:00' }, t))).toBe(true);
  });
});

describe('Missed scheduled times', () => {
  beforeEach(() => {
    NOTIFICATION_SIMULATION.ENABLED = false;
  });

  test('a delivery more than 15 minutes late is dropped', async () => {
    const due = at(1, 11, 0);
    jest.setSystemTime(due + 20 * MIN);
    expect(await NotificationService.acceptScheduledDelivery(scheduled('focus_alert', due))).toBe(false);
    expect(queuedWith(SHIFTED_ID_PREFIX)).toHaveLength(0);
  });

  test('a delivery a few minutes late is still accepted', async () => {
    const due = at(1, 11, 0);
    jest.setSystemTime(due + 3 * MIN);
    expect(await NotificationService.acceptScheduledDelivery(scheduled('focus_alert', due))).toBe(true);
  });
});

describe('Risk Improved only after a risk alert (dynamic path)', () => {
  beforeEach(() => {
    NOTIFICATION_SIMULATION.ENABLED = false;
  });

  test('with no risk alert before it, it is dropped', async () => {
    const t = at(1, 11, 30);
    jest.setSystemTime(t);
    expect(await NotificationService.acceptScheduledDelivery(scheduled('risk_improved', t))).toBe(false);
  });

  test('after an Elevated Risk it is delivered, and only once', async () => {
    const er = at(1, 11, 0);
    jest.setSystemTime(er);
    expect(await NotificationService.acceptScheduledDelivery(scheduled('elevated_risk', er))).toBe(true);

    const ri = at(1, 11, 30);
    jest.setSystemTime(ri);
    expect(await NotificationService.acceptScheduledDelivery(scheduled('risk_improved', ri))).toBe(true);

    const again = at(1, 12, 40);
    jest.setSystemTime(again);
    expect(await NotificationService.acceptScheduledDelivery(scheduled('risk_improved', again))).toBe(false);
  });

  test('if Elevated Risk was suppressed by sleep, its Risk Improved is dropped too', async () => {
    await NotificationService.setSleepSchedule({ sleepStart: '19:30', wakeUp: '07:00' });
    const er = at(1, 20, 0);
    jest.setSystemTime(er);
    expect(await NotificationService.acceptScheduledDelivery(scheduled('elevated_risk', er))).toBe(false);
    const ri = at(1, 20, 30);
    jest.setSystemTime(ri);
    expect(await NotificationService.acceptScheduledDelivery(scheduled('risk_improved', ri))).toBe(false);
  });
});

describe('Fixed schedule: exact times win', () => {
  const fixed = (key: string, ts: number) => scheduled(key, ts, { source: 'simulation' });
  const snapshot = (atMs: number, values: { riskScore?: number | null; fdi?: number | null; cdi?: number | null }) =>
    NotificationService.noteConditionSnapshot({
      at: atMs,
      riskScore: values.riskScore ?? null,
      fdi: values.fdi ?? null,
      cdi: values.cdi ?? null,
    });

  test('a fixed slot is delivered at its time even 10 minutes after another notification', async () => {
    await NotificationService.noteNotificationShown(at(1, 10, 50));
    jest.setSystemTime(at(1, 11, 0));
    expect(await NotificationService.acceptScheduledDelivery(fixed('elevated_risk', at(1, 11, 0)))).toBe(true);
    expect(queuedWith(SHIFTED_ID_PREFIX)).toHaveLength(0);
  });

  test('a fixed Hydration Reminder is not moved by the one-hour rule nor withdrawn after a drink', async () => {
    // A Hydration Reminder 30 minutes earlier (recorded as delivered).
    jest.setSystemTime(at(1, 8, 30));
    expect(
      await NotificationService.displayNotification('t', 'b', undefined, 'local', { notificationKey: 'regular_reminder' })
    ).toBe(true);
    await NotificationService.noteIntakeLogged(at(1, 8, 50));

    jest.setSystemTime(at(1, 9, 0));
    const nine = { ...fixed('regular_reminder', at(1, 9, 0)), data: { ...fixed('regular_reminder', at(1, 9, 0)).data, type: HYDRATION_REMINDER_TYPE } };
    expect(await NotificationService.suppressIfRecentlyHydrated(nine)).toBe(false);
    expect(await NotificationService.acceptScheduledDelivery(nine)).toBe(true);
    expect(queuedWith(SHIFTED_ID_PREFIX)).toHaveLength(0);
  });

  test('a fixed slot in the first 5 minutes after opening is suppressed, not moved', async () => {
    NotificationService.markAppOpened(at(1, 10, 58));
    jest.setSystemTime(at(1, 11, 0));
    expect(await NotificationService.acceptScheduledDelivery(fixed('elevated_risk', at(1, 11, 0)))).toBe(false);
    expect(queuedWith(SHIFTED_ID_PREFIX)).toHaveLength(0);
  });

  test('a fixed slot inside the sleep window is suppressed', async () => {
    await NotificationService.setSleepSchedule({ sleepStart: '22:00', wakeUp: '07:00' });
    jest.setSystemTime(at(1, 22, 30));
    expect(await NotificationService.acceptScheduledDelivery(fixed('regular_reminder', at(1, 22, 30)))).toBe(false);
    expect(queuedWith(SHIFTED_ID_PREFIX)).toHaveLength(0);
  });

  describe('Risk Improved, Focus and Priority: delivered at their fixed times with no condition check (for now)', () => {
    const SIX = [
      ['risk_improved', 11, 30],
      ['risk_improved', 20, 30],
      ['focus_alert', 12, 30],
      ['focus_alert', 16, 0],
      ['priority_alert', 14, 30],
      ['priority_alert', 18, 30],
    ] as const;

    test('the switch is off', () => {
      expect(NOTIFICATION_SIMULATION.CHECK_FIXED_SLOT_CONDITIONS).toBe(false);
    });

    test('all six are queued at their exact times with no readings at all', async () => {
      const now = at(1, 6, 0);
      jest.setSystemTime(now);
      await NotificationService.scheduleSimulatedNotifications(now);
      const today = queuedWith(SIMULATED_ID_PREFIX)
        .filter(q => new Date(q.trigger.timestamp).getDate() === 1)
        .map(q => `${clock(q.trigger.timestamp)} ${q.notification.data.notificationKey}`);
      for (const [key, h, m] of SIX) {
        expect(today).toContain(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${key}`);
      }
    });

    // Readings that would each have failed the old condition.
    const failingReadings: Array<[string, (t: number) => Promise<void>]> = [
      ['no reading at all', async () => {}],
      ['a stale reading', t => snapshot(t - 60 * MIN, { riskScore: 20, fdi: 90, cdi: 90 })],
      ['risk 90, FDI 10, CDI 10', t => snapshot(t - 1 * MIN, { riskScore: 90, fdi: 10, cdi: 10 })],
      ['risk 40, FDI 59.9, CDI 59.9', t => snapshot(t - 1 * MIN, { riskScore: 40, fdi: 59.9, cdi: 59.9 })],
    ];

    for (const [key, h, m] of SIX) {
      test.each(failingReadings)(`${key} at ${h}:${String(m).padStart(2, '0')} is delivered with %s`, async (_label, seed) => {
        const t = at(1, h, m);
        await seed(t);
        jest.setSystemTime(t);
        expect(await NotificationService.acceptScheduledDelivery(fixed(key, t))).toBe(true);
        expect(queuedWith(SHIFTED_ID_PREFIX)).toHaveLength(0);
      });
    }

    test('Risk Improved needs no Elevated Risk before it', async () => {
      jest.setSystemTime(at(1, 11, 30));
      expect(await NotificationService.acceptScheduledDelivery(fixed('risk_improved', at(1, 11, 30)))).toBe(true);
    });

    test('none of the six is moved by the 30-minute or one-hour rules', async () => {
      for (const [key, h, m] of SIX) {
        const t = at(2, h, m);
        // Something else was shown 5 minutes earlier, and the same kind 40.
        await NotificationService.noteNotificationShown(t - 5 * MIN);
        jest.setSystemTime(t);
        expect(await NotificationService.acceptScheduledDelivery(fixed(key, t))).toBe(true);
      }
      expect(queuedWith(SHIFTED_ID_PREFIX)).toHaveLength(0);
    });

    test('global safety rules still apply: sleep window and the first 5 minutes suppress, never move', async () => {
      await NotificationService.setSleepSchedule({ sleepStart: '18:00', wakeUp: '07:00' });
      jest.setSystemTime(at(1, 18, 30));
      expect(await NotificationService.acceptScheduledDelivery(fixed('priority_alert', at(1, 18, 30)))).toBe(false);

      NotificationService.markAppOpened(at(1, 12, 28));
      jest.setSystemTime(at(1, 12, 30));
      expect(await NotificationService.acceptScheduledDelivery(fixed('focus_alert', at(1, 12, 30)))).toBe(false);
      expect(queuedWith(SHIFTED_ID_PREFIX)).toHaveLength(0);
    });
  });

  describe('when CHECK_FIXED_SLOT_CONDITIONS is switched back on, the conditions apply again', () => {
    beforeEach(() => {
      NOTIFICATION_SIMULATION.CHECK_FIXED_SLOT_CONDITIONS = true;
    });
    afterEach(() => {
      NOTIFICATION_SIMULATION.CHECK_FIXED_SLOT_CONDITIONS = false;
    });

    test('Risk Improved: needs a risk alert before it and risk < 40', async () => {
      jest.setSystemTime(at(1, 11, 30));
      expect(await NotificationService.acceptScheduledDelivery(fixed('risk_improved', at(1, 11, 30)))).toBe(false);

      jest.setSystemTime(at(1, 20, 0));
      expect(await NotificationService.acceptScheduledDelivery(fixed('elevated_risk', at(1, 20, 0)))).toBe(true);
      await snapshot(at(1, 20, 28), { riskScore: 35 });
      jest.setSystemTime(at(1, 20, 30));
      expect(await NotificationService.acceptScheduledDelivery(fixed('risk_improved', at(1, 20, 30)))).toBe(true);
    });

    test('Focus: FDI >= 60; Priority: CDI >= 60', async () => {
      await snapshot(at(1, 12, 25), { fdi: 59.9 });
      jest.setSystemTime(at(1, 12, 30));
      expect(await NotificationService.acceptScheduledDelivery(fixed('focus_alert', at(1, 12, 30)))).toBe(false);

      await snapshot(at(1, 14, 25), { cdi: 60 });
      jest.setSystemTime(at(1, 14, 30));
      expect(await NotificationService.acceptScheduledDelivery(fixed('priority_alert', at(1, 14, 30)))).toBe(true);
    });
  });

  test('Elevated Risk (11:00 / 20:00) has no condition: sent without any reading', async () => {
    jest.setSystemTime(at(1, 20, 0));
    expect(await NotificationService.acceptScheduledDelivery(fixed('elevated_risk', at(1, 20, 0)))).toBe(true);
  });

  test('a dynamic notification on a fixed slot: both keep their time and both are delivered', async () => {
    // Wake 10:00 puts Good Morning at 11:00, on top of the fixed 11:00 slot.
    await NotificationService.setSleepSchedule({ wakeUp: '10:00', sleepStart: '00:00' });
    jest.setSystemTime(at(1, 11, 0));
    const gm = scheduled('morning_msg', at(1, 11, 0), { source: 'actual' });
    expect(await NotificationService.acceptScheduledDelivery(gm)).toBe(true);
    expect(await NotificationService.acceptScheduledDelivery(fixed('elevated_risk', at(1, 11, 0)))).toBe(true);
    expect(queuedWith(SHIFTED_ID_PREFIX)).toHaveLength(0);
  });

  test('a dynamic notification is not held back by a fixed or hydration one before it', async () => {
    await NotificationService.noteNotificationShown(at(1, 10, 45));
    jest.setSystemTime(at(1, 10, 50));
    expect(await NotificationService.acceptScheduledDelivery(scheduled('high_humidity', at(1, 10, 50)))).toBe(true);
    expect(queuedWith(SHIFTED_ID_PREFIX)).toHaveLength(0);
    // ...and the fixed 11:00 slot, 10 minutes after it, is delivered too.
    jest.setSystemTime(at(1, 11, 0));
    expect(await NotificationService.acceptScheduledDelivery(fixed('elevated_risk', at(1, 11, 0)))).toBe(true);
  });
});

describe('07:00 Day Start sends nothing', () => {
  test('no fixed slot exists at 07:00', () => {
    expect(SIMULATED_SCHEDULE_SLOTS.some(s => s.hour === 7 && s.minute === 0)).toBe(false);
  });

  test('building every queue for a 07:00 wake-up puts nothing at 07:00', async () => {
    const now = at(1, 6, 0);
    jest.setSystemTime(now);
    await NotificationService.setSleepSchedule({ sleepStart: '23:00', wakeUp: '07:00' });
    await NotificationService.scheduleSimulatedNotifications(now);
    await NotificationService.scheduleDailyNotifications(now);
    await NotificationService.scheduleHydrationReminders(now);

    expect(mockOsQueue.size).toBeGreaterThan(0);
    for (const q of mockOsQueue.values()) {
      expect(clock(q.trigger.timestamp)).not.toBe('07:00');
    }
    // Good Morning is at actual (wake + 30 min), not at the day start.
    const morning = queuedWith('getvari-daily-morning-').map(q => clock(q.trigger.timestamp));
    expect(new Set(morning)).toEqual(new Set(['07:30']));
  });

  test('Good Morning and Good Night follow the actual times, not the 08:00 / 23:30 examples', async () => {
    const now = at(1, 5, 0);
    jest.setSystemTime(now);
    await NotificationService.setSleepSchedule({ sleepStart: '22:00', wakeUp: '06:00' });
    mockOsQueue.clear();
    await NotificationService.scheduleDailyNotifications(now);
    const times = new Set(queuedWith('getvari-daily-').map(q => clock(q.trigger.timestamp)));
    expect(times).toEqual(new Set(['06:30', '21:00']));
  });
});

describe('Rebuilds never empty the queue (fixed and at-actual)', () => {
  const NOW = at(1, 10, 0);
  /** id -> timestamp for everything the fixed and daily rebuilds own. */
  const snapshotQueue = () =>
    new Map(
      [...mockOsQueue.entries()]
        .filter(([id]) => id.startsWith(SIMULATED_ID_PREFIX) || id.startsWith('getvari-daily-'))
        .map(([id, q]) => [id, q.trigger.timestamp as number])
    );
  const rebuild = async () => {
    await NotificationService.scheduleDailyNotifications(NOW);
    await NotificationService.scheduleSimulatedNotifications(NOW);
  };

  test('stopped after ANY number of native calls, every queued slot is still there at its time', async () => {
    jest.setSystemTime(NOW);
    await rebuild();
    const before = snapshotQueue();
    const todaysFixed = [...before.keys()].filter(id => id.includes('-20260901-'));
    expect(todaysFixed.length).toBe(10); // 10:30 .. 20:30; 09:00 has passed, 22:30 is after Good Night

    // How many native calls one full rebuild makes.
    mockCallsUsed = 0;
    await rebuild();
    const callsPerRebuild = mockCallsUsed;
    expect(callsPerRebuild).toBeGreaterThan(80);

    for (let stopAfter = 0; stopAfter <= callsPerRebuild; stopAfter++) {
      mockCallsUsed = 0;
      mockBudget = stopAfter;
      await rebuild();
      mockBudget = Infinity;

      const after = snapshotQueue();
      for (const [id, ts] of before) {
        if (after.get(id) !== ts) {
          throw new Error(`stopped after ${stopAfter} calls: ${id} missing or moved`);
        }
      }
    }
  });

  test('the old cancel-then-recreate failure mode: an interrupted rebuild used to leave 0 of today’s slots', async () => {
    // Documents the bug being fixed: the fixed rebuild made its FIRST call a
    // cancel of every slot. Now its first native call is a create/replace.
    jest.setSystemTime(NOW);
    await rebuild();
    mockCancelledIds.length = 0;
    mockCallsUsed = 0;
    mockBudget = 1;
    await NotificationService.scheduleSimulatedNotifications(NOW);
    mockBudget = Infinity;
    expect(mockCancelledIds).toHaveLength(0);
    expect([...snapshotQueue().keys()].filter(id => id.includes('-20260901-') && id.startsWith(SIMULATED_ID_PREFIX))).toHaveLength(10);
  });

  test('one slot failing to queue does not stop the others', async () => {
    jest.setSystemTime(at(1, 6, 0));
    mockFailIds.add('getvari-simulated-20260901-1230-focus_alert');
    await NotificationService.scheduleSimulatedNotifications(at(1, 6, 0));

    const today = queuedWith(SIMULATED_ID_PREFIX)
      .filter(q => new Date(q.trigger.timestamp).getDate() === 1)
      .map(q => clock(q.trigger.timestamp));
    expect(today).toHaveLength(10); // 22:30 is after Good Night (22:00)
    expect(today).not.toContain('12:30');
    expect(today).toEqual(expect.arrayContaining(['11:30', '14:30', '16:00', '18:30', '20:30']));
    // ...and the next days are complete.
    expect(queuedWith(SIMULATED_ID_PREFIX).filter(q => new Date(q.trigger.timestamp).getDate() === 2)).toHaveLength(11);
  });

  test('stale and old-format ids are removed after the new ones are queued', async () => {
    jest.setSystemTime(at(1, 6, 0));
    for (const id of ['getvari-simulated-focus_alert-0-4', 'getvari-daily-morning-0', 'getvari-simulated-20260831-1230-focus_alert']) {
      mockOsQueue.set(id, { notification: { id, data: {} }, trigger: { timestamp: at(1, 12, 30) } });
    }
    await NotificationService.scheduleDailyNotifications(at(1, 6, 0));
    await NotificationService.scheduleSimulatedNotifications(at(1, 6, 0));

    expect(mockCancelledIds).toEqual(
      expect.arrayContaining(['getvari-simulated-focus_alert-0-4', 'getvari-daily-morning-0', 'getvari-simulated-20260831-1230-focus_alert'])
    );
    const slots = [...mockOsQueue.values()].map(q => `${q.notification.data?.notificationKey}@${q.trigger.timestamp}`);
    expect(new Set(slots).size).toBe(slots.length);
  });

  test('today’s schedule is logged after a rebuild, one line per queued notification', async () => {
    jest.setSystemTime(at(1, 6, 0));
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await NotificationService.scheduleDailyNotifications(at(1, 6, 0));
      await NotificationService.scheduleSimulatedNotifications(at(1, 6, 0));
      const lines = log.mock.calls.map(c => String(c[0])).filter(l => l.startsWith('[Schedule]'));
      const last = lines.lastIndexOf(lines.filter(l => l.includes('Rest of today')).pop()!);
      const table = lines.slice(last + 1);
      for (const [hm, key] of [['11:30', 'risk_improved'], ['12:30', 'focus_alert'], ['14:30', 'priority_alert'], ['16:00', 'focus_alert'], ['18:30', 'priority_alert'], ['20:30', 'risk_improved']]) {
        expect(table.some(l => l.includes(hm) && l.includes('FIXED') && l.includes(key) && l.includes('getvari-simulated-20260901-'))).toBe(true);
      }
      expect(table.some(l => l.includes('07:30') && l.includes('actual') && l.includes('morning_msg'))).toBe(true);
    } finally {
      log.mockRestore();
    }
  });
});

describe('Schedule changes, restarts and duplicate prevention', () => {
  test('changing wake/sleep cancels the old simulated, daily and shifted entries and rebuilds', async () => {
    const now = at(1, 6, 0);
    jest.setSystemTime(now);
    await NotificationService.setSleepSchedule({ sleepStart: '23:00', wakeUp: '07:00' });
    // A notification the gate had shifted under the old schedule.
    mockOsQueue.set(`${SHIFTED_ID_PREFIX}old`, { notification: { id: `${SHIFTED_ID_PREFIX}old` }, trigger: {} });

    await NotificationService.setSleepSchedule({ sleepStart: '21:00', wakeUp: '06:00' });

    expect(mockCancelledIds).toContain(`${SHIFTED_ID_PREFIX}old`);
    expect(queuedWith(SHIFTED_ID_PREFIX)).toHaveLength(0);
    const sims = queuedWith(SIMULATED_ID_PREFIX).map(q => clock(q.trigger.timestamp));
    expect(sims).not.toContain('22:30');
    expect(sims).not.toContain('21:30');
    const daily = queuedWith('getvari-daily-').map(q => clock(q.trigger.timestamp));
    expect(new Set(daily)).toEqual(new Set(['06:30', '20:00']));
  });

  test('rebuilding (app restart) replaces entries under the same ids — no duplicates', async () => {
    const now = at(1, 6, 0);
    jest.setSystemTime(now);
    await NotificationService.scheduleSimulatedNotifications(now);
    await NotificationService.scheduleDailyNotifications(now);
    const before = [...mockOsQueue.keys()].sort();

    // Restarted ten minutes later.
    jest.setSystemTime(now + 10 * MIN);
    await NotificationService.scheduleSimulatedNotifications(now + 10 * MIN);
    await NotificationService.scheduleDailyNotifications(now + 10 * MIN);
    await NotificationService.scheduleHydrationReminders();
    const after = [...mockOsQueue.keys()].filter(id => !id.startsWith('hydration-reminder-')).sort();

    expect(after).toEqual(before);
    const perSlot = new Map<string, number>();
    for (const q of mockOsQueue.values()) {
      const key = `${q.notification.data?.notificationKey}@${q.trigger.timestamp}`;
      perSlot.set(key, (perSlot.get(key) ?? 0) + 1);
    }
    expect([...perSlot.values()].every(n => n === 1)).toBe(true);
  });

  test('rebuilding one source leaves the others untouched', async () => {
    const now = at(1, 6, 0);
    jest.setSystemTime(now);
    await NotificationService.scheduleDailyNotifications(now);
    await NotificationService.scheduleSimulatedNotifications(now);
    const daily = queuedWith('getvari-daily-').length;
    mockCancelledIds.length = 0;

    await NotificationService.scheduleSimulatedNotifications(now);
    await NotificationService.scheduleHydrationReminders(now);
    expect(mockCancelledIds.some(id => id.startsWith('getvari-daily-'))).toBe(false);
    expect(queuedWith('getvari-daily-')).toHaveLength(daily);
  });

  test('a reused cadence id is gated again on a later day, not waved through', async () => {
    const day1 = at(1, 14, 0);
    jest.setSystemTime(day1);
    const n1 = { id: 'hydration-reminder-3', data: { notificationKey: 'regular_reminder', eventId: `hydration-reminder-3@${day1}` } } as any;
    // Before the fix, delivering this marked the bare `hydration-reminder-3`
    // as processed, so every later reminder-3 skipped all the gates.
    expect(await NotificationService.acceptScheduledDelivery(n1)).toBe(true);

    // Same slot id next day, arriving 10 minutes after another notification.
    const day2 = at(2, 14, 0);
    jest.setSystemTime(day2 - 10 * MIN);
    await NotificationService.acceptScheduledDelivery(scheduled('high_humidity', day2 - 10 * MIN));
    jest.setSystemTime(day2);
    const n2 = { id: 'hydration-reminder-3', data: { notificationKey: 'regular_reminder', eventId: `hydration-reminder-3@${day2}` } } as any;
    expect(await NotificationService.acceptScheduledDelivery(n2)).toBe(false);
  });

  test('the same event delivered twice is recorded once', async () => {
    const t = at(1, 14, 0);
    jest.setSystemTime(t);
    const n = scheduled('focus_alert', t);
    expect(await NotificationService.acceptScheduledDelivery(n)).toBe(true);
    jest.setSystemTime(t + 10 * MIN);
    expect(await NotificationService.acceptScheduledDelivery(n)).toBe(true);
    // The repeat did not move the spacing clock.
    expect(await NotificationService.msSinceLastNotification()).toBe(10 * MIN);
  });

  test('the simulation slot table matches the specification timeline', () => {
    expect(SIMULATED_SCHEDULE_SLOTS.map(s => `${s.hour}:${s.minute} ${s.trigger}`)).toEqual([
      '9:0 regular_reminder',
      '10:30 focus_alert',
      '11:0 elevated_risk',
      '11:30 risk_improved',
      '12:30 focus_alert',
      '14:30 priority_alert',
      '16:0 focus_alert',
      '17:0 regular_reminder',
      '18:30 priority_alert',
      '20:0 elevated_risk',
      '20:30 risk_improved',
      '22:30 regular_reminder',
    ]);
  });
});

// Last on purpose: the cached target outlives a test, so every suite above
// runs without one.
describe('Risk Reduced copy', () => {
  test('the risk_improved notification is titled Risk Reduced', () => {
    const { buildNotificationContent } = require('../src/utils/notificationContent');
    const content = buildNotificationContent('risk_improved', 'Anjali Mishra');
    expect(content.title).toBe('🎉 Risk Reduced');
    expect(content.title).not.toContain('Improved');
    expect(content.body).toContain('Your dehydration risk has reduced');
  });
});

describe('Daily Water Requirement: wake + 1h, half an hour after Good Morning', () => {
  const waterQueue = () => queuedWith('getvari-daily-water-');
  const dayOne = () =>
    queuedWith('getvari-daily-')
      .filter(q => new Date(q.trigger.timestamp).getDate() === 1)
      .sort((a, b) => a.trigger.timestamp - b.trigger.timestamp)
      .map(q => `${clock(q.trigger.timestamp)} ${q.notification.data.notificationKey}`);

  test('not queued while no target is known', async () => {
    jest.setSystemTime(at(1, 5, 0));
    await NotificationService.setSleepSchedule({ sleepStart: '23:00', wakeUp: '07:00' });
    await NotificationService.scheduleDailyNotifications(at(1, 5, 0));
    expect(waterQueue()).toHaveLength(0);
    expect(await NotificationService.setDailyWaterTarget(null)).toBe(false);
    expect(await NotificationService.setDailyWaterTarget(0)).toBe(false);
    expect(waterQueue()).toHaveLength(0);
  });

  test('wake 07:00: Good Morning 07:30, Daily Water Requirement 08:00 with the final target', async () => {
    jest.setSystemTime(at(1, 5, 0));
    await NotificationService.setSleepSchedule({ sleepStart: '23:00', wakeUp: '07:00' });
    expect(await NotificationService.setDailyWaterTarget(3250)).toBe(true);

    expect(dayOne()).toEqual(['07:30 morning_msg', '08:00 daily_water_requirement', '22:00 night_msg']);
    const water = mockOsQueue.get('getvari-daily-water-20260901')!.notification;
    expect(water.title).toBe('💧 Daily Water Requirement');
    expect(water.body).toBe(
      'Your water goal for today is 3.25 L (approximately 13 glasses of 250 ml each). Keep sipping throughout the day to stay hydrated!'
    );
    expect(water.data.source).toBe('actual');
    expect(water.data.reason).toBe('wake-up 07:00 + 1h');
  });

  test('once per day, and a rebuild or an unchanged target adds no duplicate', async () => {
    jest.setSystemTime(at(1, 5, 0));
    await NotificationService.setSleepSchedule({ sleepStart: '23:00', wakeUp: '07:00' });
    await NotificationService.setDailyWaterTarget(3250);
    const ids = waterQueue().map(q => q.notification.id).sort();
    expect(ids).toHaveLength(7);
    expect(new Set(waterQueue().map(q => localDay(q.trigger.timestamp))).size).toBe(7);

    mockQueued.length = 0;
    expect(await NotificationService.setDailyWaterTarget(3250)).toBe(false);
    expect(mockQueued).toHaveLength(0); // unchanged: nothing re-queued
    await NotificationService.scheduleDailyNotifications(at(1, 5, 0));
    expect(waterQueue().map(q => q.notification.id).sort()).toEqual(ids);
  });

  test('a changed target rewrites the queued message in place', async () => {
    jest.setSystemTime(at(1, 5, 0));
    await NotificationService.setSleepSchedule({ sleepStart: '23:00', wakeUp: '07:00' });
    await NotificationService.setDailyWaterTarget(3250);
    expect(await NotificationService.setDailyWaterTarget(2900)).toBe(true);
    expect(waterQueue()).toHaveLength(7);
    for (const q of waterQueue()) expect(q.notification.body).toContain('2.9 L (approximately 12 glasses');
  });

  test('follows a changed wake-up time', async () => {
    jest.setSystemTime(at(1, 5, 0));
    await NotificationService.setDailyWaterTarget(3250);
    await NotificationService.setSleepSchedule({ sleepStart: '22:30', wakeUp: '06:15' });
    expect(dayOne()).toEqual(['06:45 morning_msg', '07:15 daily_water_requirement', '21:30 night_msg']);
  });

  test('wake 08:00: Daily Water Requirement 09:00 — and moving the wake-up leaves one per day, not two', async () => {
    jest.setSystemTime(at(1, 5, 0));
    await NotificationService.setSleepSchedule({ sleepStart: '23:00', wakeUp: '07:00' });
    await NotificationService.setDailyWaterTarget(3250);
    expect(clock(mockOsQueue.get('getvari-daily-water-20260901')!.trigger.timestamp)).toBe('08:00');

    await NotificationService.setSleepSchedule({ sleepStart: '00:00', wakeUp: '08:00' });
    expect(dayOne().filter(row => row.endsWith('daily_water_requirement'))).toEqual(['09:00 daily_water_requirement']);
    expect(mockOsQueue.get('getvari-daily-water-20260901')!.notification.data.reason).toBe('wake-up 08:00 + 1h');

    // The 08:00 one was replaced, not joined: still one a day for seven days.
    expect(waterQueue()).toHaveLength(7);
    expect(new Set(waterQueue().map(q => localDay(q.trigger.timestamp))).size).toBe(7);
    for (const q of waterQueue()) expect(clock(q.trigger.timestamp)).toBe('09:00');
  });

  test('delivered at its time, half an hour after Good Morning', async () => {
    await NotificationService.setSleepSchedule({ sleepStart: '23:00', wakeUp: '07:00' });
    jest.setSystemTime(at(1, 7, 30));
    expect(await NotificationService.acceptScheduledDelivery(scheduled('morning_msg', at(1, 7, 30)))).toBe(true);
    jest.setSystemTime(at(1, 8, 0));
    expect(
      await NotificationService.acceptScheduledDelivery(scheduled('daily_water_requirement', at(1, 8, 0)))
    ).toBe(true);
  });

  test('the silence window ends with Good Morning (wake + 30 min), not at wake + 1h', async () => {
    const schedule = { sleepStart: '23:00', wakeUp: '07:00' };
    expect(isInSilenceWindow(schedule, at(1, 7, 29))).toBe(true);
    expect(isInSilenceWindow(schedule, at(1, 7, 30))).toBe(false);
    expect(nextActiveAt(schedule, at(1, 2, 0))).toBe(at(1, 7, 30));

    // Nothing but Good Morning is let through before 07:30.
    jest.setSystemTime(at(1, 7, 15));
    expect(await NotificationService.acceptScheduledDelivery(scheduled('high_humidity', at(1, 7, 15)))).toBe(false);
    expect(await NotificationService.acceptScheduledDelivery(scheduled('elevated_risk', at(1, 7, 15), { source: 'simulation' }))).toBe(false);

    // A fixed slot between Good Morning and wake + 1h is now kept.
    const late = { sleepStart: '23:00', wakeUp: '08:15' }; // Good Morning 08:45
    const slots = calculateDailySimulatedSchedule(late, new Date(at(1, 12))).map(s => clock(s.timestamp));
    expect(slots).toContain('09:00');
  });

  test('a 2-hour reminder still waits until half an hour after the Daily Water Requirement', async () => {
    const schedule = { sleepStart: '23:00', wakeUp: '07:00' };
    NOTIFICATION_SIMULATION.ENABLED = false;
    expect(clock(clearOfScheduledSlots(nextActiveAt(schedule, at(1, 2, 0)), schedule))).toBe('08:30');
    expect(clock(clearOfScheduledSlots(at(1, 7, 45), schedule))).toBe('08:30');
  });
});
