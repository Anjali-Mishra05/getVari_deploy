/**
 * The full-screen Hydration Reminder, end to end on the JS side.
 *
 * What is decided natively (is the screen on, is the keyguard up, is the app
 * resumed, does Android honour the full-screen intent) cannot run here; the
 * native module is mocked and these tests assert everything around it: which
 * notifications carry the full-screen intent, that every delivery path records
 * the reminder the full-screen UI is drawn from and asks the native side to
 * present it, that the lock-screen permission is released, that a rebuild
 * never empties or duplicates the queue, and that Log / Snooze still work.
 *
 *   npx jest --config jest.config.logic.js __tests__/fullScreenReminder.test.ts
 */

const mockStore = new Map<string, string>();
const mockOs = new Map<string, { notification: any; trigger: any }>();
let mockTray: Array<{ id: string; notification: any; date?: string }> = [];
const mockCancelledTriggers: string[] = [];
const mockCancelledTray: string[] = [];
const mockNativeCalls: Array<[string, ...any[]]> = [];
let mockPresentOutcome = 'launched';
let mockBudget = Infinity;
let mockCallsUsed = 0;
const mockFailIds = new Set<string>();
const mockSpend = () => {
  if (mockCallsUsed >= mockBudget) throw new Error('process stopped');
  mockCallsUsed++;
};

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
  NativeModules: {
    FullScreenReminderModule: {
      presentReminder: () => {
        mockNativeCalls.push(['presentReminder']);
        return Promise.resolve(mockPresentOutcome);
      },
      setShowOverLockScreen: (enabled: boolean) => {
        mockNativeCalls.push(['setShowOverLockScreen', enabled]);
        return Promise.resolve(true);
      },
      canUseFullScreenIntent: () => Promise.resolve(true),
      canLaunchOverOtherApps: () => Promise.resolve(true),
    },
  },
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
    createChannel: (c: any) => Promise.resolve(c.id),
    deleteChannel: () => Promise.resolve(),
    getChannel: () => Promise.resolve({ id: 'hydration-reminders-v3', importance: 4 }),
    getTriggerNotificationIds: () => Promise.resolve([...mockOs.keys()]),
    getTriggerNotifications: () => Promise.resolve([...mockOs.values()]),
    cancelTriggerNotifications: (ids: string[]) => {
      mockSpend();
      mockCancelledTriggers.push(...ids);
      ids.forEach(id => mockOs.delete(id));
      return Promise.resolve();
    },
    getDisplayedNotifications: () => Promise.resolve([...mockTray]),
    cancelDisplayedNotifications: (ids: string[]) => {
      mockCancelledTray.push(...ids);
      mockTray = mockTray.filter(e => !ids.includes(e.id));
      return Promise.resolve();
    },
    createTriggerNotification: (notification: any, trigger: any) => {
      mockSpend();
      if (mockFailIds.has(notification.id)) return Promise.reject(new Error('native create failed'));
      mockOs.set(notification.id, { notification, trigger });
      return Promise.resolve(notification.id);
    },
    displayNotification: () => Promise.resolve(),
    onForegroundEvent: () => () => {},
    onBackgroundEvent: () => {},
    getInitialNotification: () => Promise.resolve(null),
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

jest.mock('@react-native-firebase/messaging', () => ({}));

jest.mock('../src/services/NotificationHistory', () => ({
  __esModule: true,
  default: {
    recordDelivery: () => Promise.resolve(),
    recordPress: () => Promise.resolve(),
    recordAnswered: () => Promise.resolve(),
  },
}));

import ActiveReminder from '../src/services/ActiveReminder';
import NotificationService, {
  HYDRATION_REMINDER_TYPE,
  REMINDER_FULL_SCREEN_ACTION,
  REMINDER_LOG_ACTION,
  REMINDER_SNOOZE_ACTION,
  SIMULATED_ID_PREFIX,
} from '../src/services/NotificationService';
import buildNotificationContent from '../src/utils/notificationContent';

const DELIVERED = 3;
const ACTION_PRESS = 2;
const MIN = 60_000;
const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m, 0, 0).getTime();
const clock = (t: number) => {
  const x = new Date(t);
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
};
const cadence = () => [...mockOs.values()].filter(q => q.notification.id.startsWith('hydration-reminder-'));
const fixedReminders = () =>
  [...mockOs.values()].filter(q => q.notification.id.startsWith(SIMULATED_ID_PREFIX) && q.notification.data.notificationKey === 'regular_reminder');

/** What the OS hands back when a queued reminder fires now. */
const fired = (id: string) => {
  const q = mockOs.get(id)!;
  return JSON.parse(JSON.stringify(q.notification));
};

/** The background handler in index.js, step for step. */
const backgroundDelivery = async (notification: any) => {
  mockTray.push({ id: notification.id, notification });
  if (await NotificationService.suppressIfAsleep(notification)) return 'suppressed';
  if (await NotificationService.suppressIfRecentlyHydrated(notification)) return 'suppressed';
  if (!(await NotificationService.acceptScheduledDelivery(notification))) return 'rejected';
  notification.data = { ...notification.data, deliveryAccepted: '1' };
  await NotificationService.handleReminderEvent(DELIVERED as any, { notification } as any);
  if (notification.data.type === HYDRATION_REMINDER_TYPE) {
    return NotificationService.presentReminderFullScreen(notification);
  }
  return 'not-a-reminder';
};

/** The foreground listeners in HomeScreen, step for step. */
const foregroundDelivery = async (notification: any) => {
  mockTray.push({ id: notification.id, notification });
  await NotificationService.handleReminderEvent(DELIVERED as any, { notification } as any);
};

beforeEach(async () => {
  jest.useFakeTimers();
  mockStore.clear();
  mockOs.clear();
  mockTray = [];
  mockCancelledTriggers.length = 0;
  mockCancelledTray.length = 0;
  mockNativeCalls.length = 0;
  mockPresentOutcome = 'launched';
  mockBudget = Infinity;
  mockCallsUsed = 0;
  mockFailIds.clear();
  ActiveReminder.__resetForTests();
  NotificationService.markAppOpened(0);
  await NotificationService.clearSleepSchedule();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('Which notifications are full-screen', () => {
  test('the fixed 09:00 / 17:00 / 22:30 Hydration Reminders use the full-screen reminder, at their exact times and text', async () => {
    // Bedtime 00:30 puts Good Night at 23:30, so 22:30 is outside the silence window.
    await NotificationService.setSleepSchedule({ wakeUp: '07:00', sleepStart: '00:30' });
    jest.setSystemTime(at(1, 6));
    await NotificationService.scheduleSimulatedNotifications(at(1, 6));
    const today = fixedReminders().filter(q => new Date(q.trigger.timestamp).getDate() === 1);
    expect(today.map(q => clock(q.trigger.timestamp))).toEqual(['09:00', '17:00', '22:30']);

    const content = buildNotificationContent('regular_reminder')!;
    for (const { notification } of today) {
      expect(notification.android.fullScreenAction).toEqual({ id: REMINDER_FULL_SCREEN_ACTION, launchActivity: 'default' });
      expect(notification.android.category).toBe('alarm');
      expect(notification.android.importance).toBe(4);
      expect(notification.android.actions.map((a: any) => a.pressAction.id)).toEqual([REMINDER_LOG_ACTION, REMINDER_SNOOZE_ACTION]);
      expect(notification.data.type).toBe(HYDRATION_REMINDER_TYPE);
      expect(notification.data.source).toBe('simulation');
      expect(notification.title).toBe(content.title);
      expect(notification.body).toBe(content.body);
    }
  });

  test('the 2-hour reminders use the full-screen reminder', async () => {
    jest.setSystemTime(at(1, 10));
    await NotificationService.scheduleHydrationReminders(at(1, 10));
    expect(cadence().length).toBe(12);
    for (const { notification } of cadence()) {
      expect(notification.android.fullScreenAction?.id).toBe(REMINDER_FULL_SCREEN_ACTION);
      expect(notification.data.type).toBe(HYDRATION_REMINDER_TYPE);
    }
  });

  test('every other notification type stays an ordinary notification', async () => {
    jest.setSystemTime(at(1, 6));
    await NotificationService.scheduleSimulatedNotifications(at(1, 6));
    await NotificationService.scheduleDailyNotifications(at(1, 6));
    const others = [...mockOs.values()].filter(q => q.notification.data.notificationKey !== 'regular_reminder');
    expect(others.length).toBeGreaterThan(0);
    for (const { notification } of others) {
      expect(notification.android.fullScreenAction).toBeUndefined();
      expect(notification.data.type).not.toBe(HYDRATION_REMINDER_TYPE);
    }
  });
});

describe('Delivery paths all lead to the full-screen UI', () => {
  test('foreground: the delivery records the outstanding reminder the full-screen UI is drawn from', async () => {
    jest.setSystemTime(at(1, 6));
    await NotificationService.scheduleSimulatedNotifications(at(1, 6));
    const id = `${SIMULATED_ID_PREFIX}20260901-0900-regular_reminder`;
    jest.setSystemTime(at(1, 9));
    await foregroundDelivery(fired(id));
    expect((await ActiveReminder.due())?.eventId).toBe(`${id}@${at(1, 9)}`);
  });

  test.each([
    ['background, phone unlocked', 'launched'],
    ['background, phone locked or screen off', 'os-full-screen-intent'],
    ['app already on screen', 'already-foreground'],
  ])('%s: the reminder is recorded and native presentation is asked for (-> %s)', async (_state, outcome) => {
    mockPresentOutcome = outcome;
    jest.setSystemTime(at(1, 10));
    await NotificationService.scheduleHydrationReminders(at(1, 10));
    const first = cadence().sort((a, b) => a.trigger.timestamp - b.trigger.timestamp)[0];
    jest.setSystemTime(first.trigger.timestamp);

    expect(await backgroundDelivery(fired(first.notification.id))).toBe(outcome);
    expect(mockNativeCalls).toContainEqual(['presentReminder']);
    expect(await ActiveReminder.due()).not.toBeNull();
  });

  test('a fixed Hydration Reminder takes the same background path', async () => {
    jest.setSystemTime(at(1, 6));
    await NotificationService.scheduleSimulatedNotifications(at(1, 6));
    jest.setSystemTime(at(1, 17));
    expect(await backgroundDelivery(fired(`${SIMULATED_ID_PREFIX}20260901-1700-regular_reminder`))).toBe('launched');
    expect(await ActiveReminder.due()).not.toBeNull();
  });

  test('a non-reminder notification never asks for full-screen presentation', async () => {
    jest.setSystemTime(at(1, 6));
    await NotificationService.scheduleSimulatedNotifications(at(1, 6));
    jest.setSystemTime(at(1, 11));
    expect(await backgroundDelivery(fired(`${SIMULATED_ID_PREFIX}20260901-1100-elevated_risk`))).toBe('not-a-reminder');
    expect(mockNativeCalls.filter(c => c[0] === 'presentReminder')).toHaveLength(0);
    expect(await ActiveReminder.due()).toBeNull();
  });

  test('cold start: a reminder delivered with the app closed is there for the freshly started app', async () => {
    jest.setSystemTime(at(1, 6));
    await NotificationService.scheduleSimulatedNotifications(at(1, 6));
    jest.setSystemTime(at(1, 9));
    await backgroundDelivery(fired(`${SIMULATED_ID_PREFIX}20260901-0900-regular_reminder`));

    // A new JS context: only what was persisted survives.
    ActiveReminder.__resetForTests();
    jest.setSystemTime(at(1, 9, 1));
    expect((await ActiveReminder.due())?.eventId).toContain('0900-regular_reminder');
  });

  test('a reminder the gate withdraws (sleep window) never reaches the full-screen UI', async () => {
    jest.setSystemTime(at(2, 2));
    const n = {
      id: 'hydration-reminder-20260902-0200',
      data: { type: HYDRATION_REMINDER_TYPE, notificationKey: 'regular_reminder', eventId: `hydration-reminder-20260902-0200@${at(2, 2)}` },
    };
    expect(await backgroundDelivery(n)).toBe('suppressed');
    expect(await ActiveReminder.due()).toBeNull();
    expect(mockNativeCalls.filter(c => c[0] === 'presentReminder')).toHaveLength(0);
  });
});

describe('Lock screen', () => {
  test('JS can release showing over the lock screen', async () => {
    expect(await NotificationService.setShowOverLockScreen(false)).toBe(true);
    expect(mockNativeCalls).toContainEqual(['setShowOverLockScreen', false]);
  });
});

describe('Opening the full-screen UI does not remove the reminder', () => {
  test('the app-open rebuild leaves the delivered reminder in the tray and outstanding', async () => {
    jest.setSystemTime(at(1, 10));
    await NotificationService.scheduleHydrationReminders(at(1, 10));
    const first = cadence().sort((a, b) => a.trigger.timestamp - b.trigger.timestamp)[0];
    jest.setSystemTime(first.trigger.timestamp);
    await backgroundDelivery(fired(first.notification.id));

    // The reminder launches the app: markAppOpened + every queue rebuilt.
    NotificationService.markAppOpened(Date.now());
    await NotificationService.scheduleHydrationReminders();
    await NotificationService.scheduleSimulatedNotifications();
    await NotificationService.scheduleDailyNotifications();

    expect(mockCancelledTray).not.toContain(first.notification.id);
    expect(mockTray.map(e => e.id)).toContain(first.notification.id);
    expect(await ActiveReminder.due()).not.toBeNull();
  });

  test('a newer reminder supersedes an older one left in the tray', async () => {
    jest.setSystemTime(at(1, 6));
    await NotificationService.scheduleSimulatedNotifications(at(1, 6));
    jest.setSystemTime(at(1, 9));
    await backgroundDelivery(fired(`${SIMULATED_ID_PREFIX}20260901-0900-regular_reminder`));
    jest.setSystemTime(at(1, 17));
    await backgroundDelivery(fired(`${SIMULATED_ID_PREFIX}20260901-1700-regular_reminder`));

    expect(mockTray.map(e => e.id)).toEqual([`${SIMULATED_ID_PREFIX}20260901-1700-regular_reminder`]);
    expect((await ActiveReminder.due())?.eventId).toContain('1700-regular_reminder');
  });
});

describe('2-hour reminder rescheduling', () => {
  test('reopening the app produces the same ids and times — no duplicates', async () => {
    jest.setSystemTime(at(1, 10));
    await NotificationService.noteIntakeLogged(at(1, 10));
    await NotificationService.scheduleHydrationReminders();
    const before = new Map(cadence().map(q => [q.notification.id, q.trigger.timestamp]));

    jest.setSystemTime(at(1, 10, 40));
    await NotificationService.scheduleHydrationReminders();
    const after = new Map(cadence().map(q => [q.notification.id, q.trigger.timestamp]));

    expect(after).toEqual(before);
    expect(mockCancelledTriggers.filter(id => id.startsWith('hydration-reminder-'))).toHaveLength(0);
    const times = [...after.values()];
    expect(new Set(times).size).toBe(times.length);
  });

  test('stopped after ANY number of native calls, every queued reminder is still there at its time', async () => {
    jest.setSystemTime(at(1, 10));
    await NotificationService.noteIntakeLogged(at(1, 10));
    await NotificationService.scheduleHydrationReminders();
    const before = new Map(cadence().map(q => [q.notification.id, q.trigger.timestamp]));

    mockCallsUsed = 0;
    await NotificationService.scheduleHydrationReminders();
    const calls = mockCallsUsed;
    expect(calls).toBeGreaterThanOrEqual(12);

    for (let stopAfter = 0; stopAfter <= calls; stopAfter++) {
      mockCallsUsed = 0;
      mockBudget = stopAfter;
      await NotificationService.scheduleHydrationReminders();
      mockBudget = Infinity;
      for (const [id, ts] of before) {
        if (mockOs.get(id)?.trigger.timestamp !== ts) throw new Error(`stopped after ${stopAfter}: ${id} missing`);
      }
    }
  });

  test('logging water replaces the queue without first emptying it', async () => {
    jest.setSystemTime(at(1, 13));
    await NotificationService.noteIntakeLogged(at(1, 13));
    await NotificationService.scheduleHydrationReminders();

    jest.setSystemTime(at(1, 13, 20));
    await NotificationService.noteIntakeLogged(at(1, 13, 20));
    mockCallsUsed = 0;
    mockBudget = 1; // the process stops right after the first native call
    await NotificationService.scheduleHydrationReminders();
    mockBudget = Infinity;
    // Nothing was cancelled before the new queue was written.
    expect(cadence().length).toBeGreaterThanOrEqual(12);
  });

  test('one reminder failing to queue does not stop the others', async () => {
    jest.setSystemTime(at(1, 10));
    await NotificationService.scheduleHydrationReminders(at(1, 10));
    const ids = cadence().map(q => q.notification.id);
    mockOs.clear();
    mockFailIds.add(ids[2]);
    await NotificationService.scheduleHydrationReminders(at(1, 10));
    expect(cadence().map(q => q.notification.id).sort()).toEqual(ids.filter(id => id !== ids[2]).sort());
  });

  test('the 2-hour timing is unchanged: first reminder two hours after the drink', async () => {
    jest.setSystemTime(at(1, 13, 20));
    await NotificationService.noteIntakeLogged(at(1, 13, 20));
    await NotificationService.scheduleHydrationReminders();
    const first = Math.min(...cadence().map(q => q.trigger.timestamp));
    expect(first).toBe(at(1, 15, 20));
  });
});

describe('Snooze / swipe-away never reaches the sleep window', () => {
  const DISMISSED = 0;
  const CASE_1 = { wakeUp: '07:00', sleepStart: '23:30' };
  const CASE_2 = { wakeUp: '09:00', sleepStart: '01:00' };

  /**
   * A reminder delivered (and already accepted by the delivery gate) at `t`,
   * so one is outstanding. Accepted up front because these times sit near the
   * fixed 22:30 reminder, and the spacing gate is not what these tests are about.
   */
  const outstandingAt = async (t: number) => {
    jest.setSystemTime(t);
    const id = `hydration-reminder-test-${t}`;
    const n = {
      id,
      title: 't',
      body: 'b',
      data: { type: HYDRATION_REMINDER_TYPE, notificationKey: 'regular_reminder', eventId: `${id}@${t}`, deliveryAccepted: '1' },
      android: {},
    };
    mockTray.push({ id, notification: n });
    await NotificationService.handleReminderEvent(DELIVERED as any, { notification: n } as any);
    expect(await ActiveReminder.due()).not.toBeNull();
    return n;
  };
  const nudge = () => mockOs.get('hydration-snooze-nudge');
  const withinSleep = (s: { wakeUp: string; sleepStart: string }, t: number) => {
    const { isAsleepAt } = require('../src/utils/sleepWindow');
    return isAsleepAt(s, t);
  };

  test('Test 1 (07:00/23:30): Snooze 15 at 23:20 does not return at 23:35 — it returns at 10:00 (after Good Morning 08:00, an hour clear of the fixed 09:00 reminder)', async () => {
    await NotificationService.setSleepSchedule(CASE_1);
    const n = await outstandingAt(at(1, 23, 0));
    jest.setSystemTime(at(1, 23, 20));
    await NotificationService.handleReminderEvent(ACTION_PRESS as any, { notification: n, pressAction: { id: REMINDER_SNOOZE_ACTION } } as any);

    expect(nudge()!.trigger.timestamp).toBe(at(2, 10, 0));
    expect(withinSleep(CASE_1, nudge()!.trigger.timestamp)).toBe(false);
    expect((await ActiveReminder.current())?.wakeAt).toBe(at(2, 10, 0));
  });

  test('Test 2 (09:00/01:00): Snooze 15 at 00:50 does not return at 01:05 — it returns after wake, clear of the fixed 09:00 and Good Morning', async () => {
    await NotificationService.setSleepSchedule(CASE_2);
    const n = await outstandingAt(at(2, 0, 30));
    jest.setSystemTime(at(2, 0, 50));
    expect(await NotificationService.snoozeReminder(15)).toBe(at(2, 12, 0));
    expect(nudge()!.trigger.timestamp).toBe(at(2, 12, 0));
    expect(withinSleep(CASE_2, nudge()!.trigger.timestamp)).toBe(false);
    void n;
  });

  test('swipe-away 30 min before bedtime (Test 1, 23:10 -> 23:40) returns at 10:00 instead', async () => {
    await NotificationService.setSleepSchedule(CASE_1);
    const n = await outstandingAt(at(1, 23, 5));
    jest.setSystemTime(at(1, 23, 10));
    await NotificationService.handleReminderEvent(DISMISSED as any, { notification: n } as any);
    expect(nudge()!.trigger.timestamp).toBe(at(2, 10, 0));
  });

  test('swipe-away at 00:45 (Test 2 -> 01:15) returns after wake instead', async () => {
    await NotificationService.setSleepSchedule(CASE_2);
    const n = await outstandingAt(at(2, 0, 40));
    jest.setSystemTime(at(2, 0, 45));
    await NotificationService.handleReminderEvent(DISMISSED as any, { notification: n } as any);
    expect(withinSleep(CASE_2, nudge()!.trigger.timestamp)).toBe(false);
    expect(nudge()!.trigger.timestamp).toBe(at(2, 12, 0));
  });

  test.each([
    ['Test 1', CASE_1, at(1, 23, 0), at(1, 23, 31), at(2, 7, 30), at(2, 10, 0)],
    ['Test 2', CASE_2, at(2, 0, 30), at(2, 1, 1), at(2, 8, 59), at(2, 12, 0)],
  ])('%s: the full-screen UI cannot reopen during sleep, and the reminder is back after wake', async (_l, schedule, deliveredAt, asleep1, asleep2, back) => {
    await NotificationService.setSleepSchedule(schedule);
    await outstandingAt(deliveredAt);
    jest.setSystemTime(deliveredAt + 10 * MIN);
    await NotificationService.snoozeReminder(15);

    for (const t of [asleep1, asleep2]) {
      jest.setSystemTime(t);
      expect(await NotificationService.reminderDueNow()).toBeNull();
      // Still stored: not lost, just not shown.
      expect(await ActiveReminder.current()).not.toBeNull();
    }
    jest.setSystemTime(back);
    expect(await NotificationService.reminderDueNow()).not.toBeNull();
  });

  test('an unsnoozed reminder left open at Good Night is hidden until Good Morning', async () => {
    // CASE_1: Good Night 22:30, Good Morning 07:30.
    await NotificationService.setSleepSchedule(CASE_1);
    await outstandingAt(at(1, 22, 0));
    jest.setSystemTime(at(1, 22, 29));
    expect(await NotificationService.reminderDueNow()).not.toBeNull();
    jest.setSystemTime(at(1, 22, 30));
    expect(await NotificationService.reminderDueNow()).toBeNull();
    jest.setSystemTime(at(2, 7, 15)); // awake, but before Good Morning
    expect(await NotificationService.reminderDueNow()).toBeNull();
    jest.setSystemTime(at(2, 7, 30));
    expect(await NotificationService.reminderDueNow()).not.toBeNull();
  });

  test.each([
    ['Test 1', CASE_1, at(1, 23, 35)],
    ['Test 2', CASE_2, at(2, 1, 5)],
  ])('%s: locked phone / background / closed app — a nudge arriving in the sleep window is withdrawn and never presented', async (_l, schedule, t) => {
    await NotificationService.setSleepSchedule(schedule);
    await ActiveReminder.raise('hydration-reminder-x@1', t - 20 * MIN);
    await ActiveReminder.snooze(15, t - 15 * MIN);
    // A nudge already queued for this minute (e.g. by an older build) fires.
    jest.setSystemTime(t);
    mockNativeCalls.length = 0;
    const n = { id: 'hydration-snooze-nudge', data: { type: HYDRATION_REMINDER_TYPE, notificationKey: 'regular_reminder', eventId: `hydration-snooze-nudge@${t}` } };
    expect(await backgroundDelivery(n)).toBe('suppressed');
    expect(mockTray.map(e => e.id)).not.toContain('hydration-snooze-nudge');
    expect(mockNativeCalls.filter(c => c[0] === 'presentReminder')).toHaveLength(0);
    // The app opened (cold start in a fresh JS context) still shows nothing,
    // and drops any lock-screen display immediately rather than after a grace.
    ActiveReminder.__resetForTests();
    expect(await NotificationService.reminderDueNow()).toBeNull();
    expect(await NotificationService.lockScreenReleaseDelayMs(8000)).toBe(0);
    expect(await ActiveReminder.current()).not.toBeNull();
  });

  test('awake, the lock-screen grace period is unchanged', async () => {
    await NotificationService.setSleepSchedule(CASE_1);
    jest.setSystemTime(at(1, 14, 0));
    expect(await NotificationService.lockScreenReleaseDelayMs(8000)).toBe(8000);
  });

  test('the moved nudge is delivered full-screen after Good Morning (Test 1, 10:00)', async () => {
    await NotificationService.setSleepSchedule(CASE_1);
    const n = await outstandingAt(at(1, 23, 0));
    jest.setSystemTime(at(1, 23, 20));
    await NotificationService.snoozeReminder(15);
    void n;

    jest.setSystemTime(at(2, 10, 0));
    mockNativeCalls.length = 0;
    expect(await backgroundDelivery(fired('hydration-snooze-nudge'))).toBe('launched');
    expect(mockNativeCalls).toContainEqual(['presentReminder']);
    expect(await NotificationService.reminderDueNow()).not.toBeNull();
  });

  test('awake-time Snooze is unchanged: 15 minutes, same full-screen nudge', async () => {
    await NotificationService.setSleepSchedule(CASE_1);
    await outstandingAt(at(1, 21, 40));
    expect(await NotificationService.snoozeReminder(15)).toBe(at(1, 21, 55));
    expect(nudge()!.trigger.timestamp).toBe(at(1, 21, 55));
    expect(nudge()!.notification.android.fullScreenAction?.id).toBe(REMINDER_FULL_SCREEN_ACTION);
    jest.setSystemTime(at(1, 21, 55));
    expect(await NotificationService.reminderDueNow()).not.toBeNull();
  });
});

describe('Log and Snooze keep working', () => {
  const deliverFixedNine = async () => {
    jest.setSystemTime(at(1, 6));
    await NotificationService.scheduleSimulatedNotifications(at(1, 6));
    jest.setSystemTime(at(1, 9));
    const n = fired(`${SIMULATED_ID_PREFIX}20260901-0900-regular_reminder`);
    await backgroundDelivery(n);
    return n;
  };

  test('Log from the notification: verdict log-primary, and answering clears the reminder and the tray', async () => {
    const n = await deliverFixedNine();
    const verdict = await NotificationService.handleReminderEvent(ACTION_PRESS as any, {
      notification: n,
      pressAction: { id: REMINDER_LOG_ACTION },
    } as any);
    expect(verdict).toBe('log-primary');
    expect(NotificationService.readPrimaryAmountMl(n)).toBeGreaterThan(0);

    // HydrationService settles the reminder after the write.
    await NotificationService.resolveActiveReminder(250);
    expect(await ActiveReminder.due()).toBeNull();
    expect(mockCancelledTray).toContain(n.id);
  });

  test('Snooze: the reminder is held back and a full-screen nudge is queued', async () => {
    const n = await deliverFixedNine();
    await NotificationService.handleReminderEvent(ACTION_PRESS as any, {
      notification: n,
      pressAction: { id: REMINDER_SNOOZE_ACTION },
    } as any);

    expect(await ActiveReminder.due()).toBeNull(); // snoozed, not answered
    const nudge = mockOs.get('hydration-snooze-nudge');
    expect(nudge).toBeDefined();
    expect(nudge!.trigger.timestamp).toBe(at(1, 9) + 15 * MIN);
    expect(nudge!.notification.android.fullScreenAction?.id).toBe(REMINDER_FULL_SCREEN_ACTION);
    expect(await ActiveReminder.due(at(1, 9) + 15 * MIN)).not.toBeNull();
  });
});
