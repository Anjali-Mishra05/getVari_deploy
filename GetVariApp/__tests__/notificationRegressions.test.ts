/**
 * Regressions: the Hydration Reminder's Log / Snooze actions, the in-app bell
 * history for every delivered notification, and which notifications are
 * full-screen. Uses the real NotificationHistory (the bell's store), with
 * Notifee and AsyncStorage mocked.
 *
 *   npx jest --config jest.config.logic.js __tests__/notificationRegressions.test.ts
 */

const mockStore = new Map<string, string>();
const mockOs = new Map<string, { notification: any; trigger: any }>();
let mockTray: Array<{ id: string; notification: any; date?: string }> = [];
const mockCancelledTray: string[] = [];
let mockForegroundListeners: Array<(e: any) => void> = [];

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
  NativeModules: {
    FullScreenReminderModule: {
      presentReminder: () => Promise.resolve('launched'),
      setShowOverLockScreen: () => Promise.resolve(true),
    },
  },
  DeviceEventEmitter: { emit: () => {}, addListener: () => ({ remove: () => {} }) },
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
    getChannel: () => Promise.resolve({ importance: 4 }),
    getTriggerNotificationIds: () => Promise.resolve([...mockOs.keys()]),
    getTriggerNotifications: () => Promise.resolve([...mockOs.values()]),
    cancelTriggerNotifications: (ids: string[]) => {
      ids.forEach(id => mockOs.delete(id));
      return Promise.resolve();
    },
    getDisplayedNotifications: () => Promise.resolve([...mockTray]),
    cancelDisplayedNotifications: (ids: string[]) => {
      mockCancelledTray.push(...ids);
      mockTray = mockTray.filter(e => !ids.includes(e.id));
      return Promise.resolve();
    },
    createTriggerNotification: (n: any, t: any) => {
      mockOs.set(n.id, { notification: n, trigger: t });
      return Promise.resolve(n.id);
    },
    displayNotification: (n: any) => {
      mockTray.push({ id: n.id, notification: n });
      // Android reports the post back to the foreground listeners.
      mockForegroundListeners.forEach(l => l({ type: 3, detail: { notification: n } }));
      return Promise.resolve();
    },
    onForegroundEvent: (listener: (e: any) => void) => {
      mockForegroundListeners.push(listener);
      return () => {
        mockForegroundListeners = mockForegroundListeners.filter(l => l !== listener);
      };
    },
    onBackgroundEvent: () => {},
    getInitialNotification: () => Promise.resolve(null),
    getNotificationSettings: () => Promise.resolve({ authorizationStatus: 1, android: { alarm: 1 } }),
  },
  AlarmType: { SET_ALARM_CLOCK: 1, SET_EXACT_AND_ALLOW_WHILE_IDLE: 0 },
  AndroidCategory: { ALARM: 'alarm' },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  AndroidStyle: { BIGTEXT: 1 },
  AndroidNotificationSetting: { ENABLED: 1, DISABLED: 0 },
  AndroidVisibility: { PUBLIC: 1 },
  AuthorizationStatus: { DENIED: 0, AUTHORIZED: 1 },
  EventType: { DISMISSED: 0, PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3 },
  TriggerType: { TIMESTAMP: 0 },
}));

jest.mock('@react-native-firebase/messaging', () => ({}));

import ActiveReminder from '../src/services/ActiveReminder';
import NotificationHistory from '../src/services/NotificationHistory';
import NotificationService, {
  HYDRATION_REMINDER_TYPE,
  REMINDER_FULL_SCREEN_ACTION,
  REMINDER_LOG_ACTION,
  REMINDER_SNOOZE_ACTION,
  SIMULATED_ID_PREFIX,
} from '../src/services/NotificationService';

const DELIVERED = 3;
const ACTION_PRESS = 2;
const MIN = 60_000;
const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m, 0, 0).getTime();
/**
 * What Android hands back when a queued notification fires. The event id is
 * made unique per call (keeping its `@<time>` suffix): the service remembers
 * processed ids for the life of the process, so reusing one across tests would
 * make a fresh delivery look like a repeat.
 */
let seq = 0;
const fired = (id: string) => {
  const n = JSON.parse(JSON.stringify(mockOs.get(id)!.notification));
  n.data.eventId = n.data.eventId.replace('@', `~${++seq}@`);
  return n;
};
const sim = (hhmm: string, key: string) => `${SIMULATED_ID_PREFIX}20260901-${hhmm}-${key}`;
const labels = (n: any) => (n.android?.actions ?? []).map((a: any) => a.title);

/** Android posts it, then index.js runs (app in background or closed), step for step. */
const deliverInBackground = async (n: any) => {
  mockTray.push({ id: n.id, notification: n });
  if (!(await NotificationService.handleBackgroundDelivery(n))) return false;
  await NotificationService.handleReminderEvent(DELIVERED as any, { notification: n } as any);
  return true;
};

beforeEach(async () => {
  jest.useFakeTimers();
  mockStore.clear();
  mockOs.clear();
  mockTray = [];
  mockCancelledTray.length = 0;
  mockForegroundListeners = [];
  ActiveReminder.__resetForTests();
  NotificationService.markAppOpened(0);
  await NotificationService.clearSleepSchedule();
  jest.setSystemTime(at(1, 6));
  await NotificationService.scheduleSimulatedNotifications(at(1, 6));
  await NotificationService.scheduleDailyNotifications(at(1, 6));
});

afterEach(() => jest.useRealTimers());

// ---------------------------------------------------------------------------

describe('Issue 1: Hydration Reminder actions', () => {
  test('fixed 09:00 / 17:00 / 22:30 Hydration Reminders carry "Log 500 ml" and "Snooze 15m"', () => {
    // 22:30 is after Good Night (22:00) under the default 23:00 bedtime.
    for (const hhmm of ['0900', '1700']) {
      const n = mockOs.get(sim(hhmm, 'regular_reminder'))!.notification;
      expect(labels(n)).toEqual(['Log 500 ml', 'Snooze 15m']);
      expect(n.android.actions.map((a: any) => a.pressAction.id)).toEqual([REMINDER_LOG_ACTION, REMINDER_SNOOZE_ACTION]);
    }
  });

  test('2-hour Hydration Reminders carry both actions', async () => {
    await NotificationService.scheduleHydrationReminders(at(1, 6));
    const cadence = [...mockOs.values()].filter(q => q.notification.id.startsWith('hydration-reminder-'));
    expect(cadence.length).toBe(12);
    for (const { notification } of cadence) expect(labels(notification)).toEqual(['Log 500 ml', 'Snooze 15m']);
  });

  test('the snooze nudge carries both actions', async () => {
    jest.setSystemTime(at(1, 9));
    await deliverInBackground(fired(sim('0900', 'regular_reminder')));
    await NotificationService.snoozeReminder(15);
    expect(labels(mockOs.get('hydration-snooze-nudge')!.notification)).toEqual(['Log 500 ml', 'Snooze 15m']);
  });

  test('Log: 500 ml is what the action logs, and answering clears the reminder and its tray entry', async () => {
    jest.setSystemTime(at(1, 9));
    const n = fired(sim('0900', 'regular_reminder'));
    await deliverInBackground(n);
    const verdict = await NotificationService.handleReminderEvent(ACTION_PRESS as any, {
      notification: n,
      pressAction: { id: REMINDER_LOG_ACTION },
    } as any);
    expect(verdict).toBe('log-primary');
    expect(NotificationService.readPrimaryAmountMl(n)).toBe(500);

    // What HydrationService does after the write.
    await NotificationService.noteIntakeLogged(at(1, 9));
    await NotificationService.resolveActiveReminder(500);
    expect(await ActiveReminder.current()).toBeNull();
    expect(mockTray.map(e => e.id)).not.toContain(n.id);
    expect(mockOs.has('hydration-snooze-nudge')).toBe(false);
  });

  test('Snooze: one nudge 15 minutes later — pressing it twice does not create a second reminder', async () => {
    jest.setSystemTime(at(1, 9));
    const n = fired(sim('0900', 'regular_reminder'));
    await deliverInBackground(n);
    for (const t of [at(1, 9, 0), at(1, 9, 1)]) {
      jest.setSystemTime(t);
      await NotificationService.handleReminderEvent(ACTION_PRESS as any, {
        notification: n,
        pressAction: { id: REMINDER_SNOOZE_ACTION },
      } as any);
    }
    const nudges = [...mockOs.keys()].filter(id => id === 'hydration-snooze-nudge');
    expect(nudges).toHaveLength(1);
    expect(mockOs.get('hydration-snooze-nudge')!.trigger.timestamp).toBe(at(1, 9, 1) + 15 * MIN);
    expect(mockTray.map(e => e.id)).not.toContain(n.id);
  });
});

describe('Issue 2: every delivered notification is in the bell history', () => {
  const titles = async () => (await NotificationHistory.list()).map(r => r.title);

  test('Welcome (shown immediately, foreground) is recorded', async () => {
    const stop = NotificationService.startHistoryTracking();
    jest.setSystemTime(at(1, 14));
    await NotificationService.queueWelcomeNotification();
    await NotificationService.showPendingWelcome();
    await Promise.resolve();
    expect(await titles()).toContain('💧 Welcome to GetVari');
    stop();
  });

  test.each([
    ['09:00 Hydration Reminder', '0900', 'regular_reminder'],
    ['Elevated Risk', '1100', 'elevated_risk'],
    ['Risk Improved', '1130', 'risk_improved'],
    ['FDI / Focus', '1230', 'focus_alert'],
    ['CDI / Priority', '1430', 'priority_alert'],
  ])('%s delivered in the background is recorded', async (_label, hhmm, key) => {
    const t = at(1, Number(hhmm.slice(0, 2)), Number(hhmm.slice(2)));
    jest.setSystemTime(t);
    const n = fired(sim(hhmm, key));
    expect(await deliverInBackground(n)).toBe(true);
    const rows = await NotificationHistory.list();
    expect(rows.map(r => r.id)).toContain(n.data.eventId);
    expect(rows[0].title).toBe(n.title);
  });

  test('Good Morning and Good Night delivered in the background are recorded', async () => {
    for (const [id, t] of [['getvari-daily-morning-20260901', at(1, 7, 30)], ['getvari-daily-night-20260901', at(1, 22)]] as const) {
      jest.setSystemTime(t);
      expect(await deliverInBackground(fired(id))).toBe(true);
    }
    expect(await titles()).toEqual(expect.arrayContaining(['🌅 Good Morning', '🌙 Good Night']));
  });

  test('a 2-hour reminder and the snooze nudge delivered in the background are recorded', async () => {
    await NotificationService.scheduleHydrationReminders(at(1, 6));
    const first = [...mockOs.values()]
      .filter(q => q.notification.id.startsWith('hydration-reminder-'))
      .sort((a, b) => a.trigger.timestamp - b.trigger.timestamp)[0];
    jest.setSystemTime(first.trigger.timestamp);
    const reminder = fired(first.notification.id);
    expect(await deliverInBackground(reminder)).toBe(true);
    await NotificationService.snoozeReminder(15);

    // The nudge fires 15 minutes later. Being dynamic it respects the gates,
    // so the reminder's own delivery stamps are moved out of the way first.
    jest.setSystemTime(first.trigger.timestamp + 15 * MIN);
    mockStore.delete('getvari_recent_delivery_state');
    mockStore.delete('getvari_last_notification_at');
    // 10:15 is within 30 minutes of the fixed 10:30 slot, so the gate moves the
    // nudge to the next clear time rather than delivering it there.
    expect(await deliverInBackground(fired('hydration-snooze-nudge'))).toBe(false);
    const moved = [...mockOs.values()].find(q => q.notification.id.startsWith('getvari-shifted-'))!;
    jest.setSystemTime(moved.trigger.timestamp);
    mockStore.delete('getvari_recent_delivery_state');
    mockStore.delete('getvari_last_notification_at');
    const nudge = fired(moved.notification.id);
    expect(await deliverInBackground(nudge)).toBe(true);

    const ids = (await NotificationHistory.list()).map(r => r.id);
    expect(ids).toEqual(expect.arrayContaining([reminder.data.eventId, nudge.data.eventId]));
  });

  test('event-driven alerts shown by the engine (PBWR 50%, goal, temperature, humidity) are recorded', async () => {
    const stop = NotificationService.startHistoryTracking();
    let t = at(1, 12);
    for (const [key, title] of [
      ['low_intake_12pm', '💧 Low Intake'],
      ['goal_achieved', '🎉 Goal Achieved'],
      ['high_temp', '☀️ High Temperature'],
      ['high_humidity', '💦 High Humidity'],
    ]) {
      jest.setSystemTime(t);
      expect(await NotificationService.displayNotification(title, 'b', undefined, 'local', { notificationKey: key })).toBe(true);
      t += 31 * MIN;
    }
    await Promise.resolve();
    expect(await titles()).toEqual(
      expect.arrayContaining(['💧 Low Intake', '🎉 Goal Achieved', '☀️ High Temperature', '💦 High Humidity'])
    );
    stop();
  });

  test('the same delivery seen by the background handler, the foreground listener and the tray sweep is one row', async () => {
    const stop = NotificationService.startHistoryTracking();
    jest.setSystemTime(at(1, 11));
    const n = fired(sim('1100', 'elevated_risk'));
    await deliverInBackground(n);
    mockForegroundListeners.forEach(l => l({ type: DELIVERED, detail: { notification: { ...n } } }));
    await NotificationService.syncDeliveredFromTray();
    await Promise.resolve();
    expect((await NotificationHistory.list()).filter(r => r.id === n.data.eventId)).toHaveLength(1);
    stop();
  });

  test('a delivery whose background handler never ran is recorded when the app next opens, even hours later', async () => {
    jest.setSystemTime(at(1, 12, 30));
    const n = fired(sim('1230', 'focus_alert'));
    mockTray.push({ id: n.id, notification: n }); // Android posted it; JS did not run
    jest.setSystemTime(at(1, 16, 5));
    await NotificationService.syncDeliveredFromTray();
    const row = (await NotificationHistory.list()).find(r => r.id === n.data.eventId);
    expect(row?.deliveredAt).toBe(at(1, 12, 30));
  });

  test('a delivery the gate rejects in the background is taken out of the tray and not recorded', async () => {
    NotificationService.markAppOpened(at(1, 10, 58));
    jest.setSystemTime(at(1, 11));
    const n = fired(sim('1100', 'elevated_risk'));
    expect(await deliverInBackground(n)).toBe(false); // first 5 minutes after opening
    expect(mockCancelledTray).toContain(n.id);
    expect(await NotificationHistory.list()).toHaveLength(0);
  });

  test('a delivery in the sleep window is withdrawn and not recorded', async () => {
    jest.setSystemTime(at(2, 2));
    const n = { id: 'x', title: 't', data: { notificationKey: 'elevated_risk', eventId: `x@${at(2, 2)}` } };
    expect(await deliverInBackground(n)).toBe(false);
    expect(await NotificationHistory.list()).toHaveLength(0);
  });
});

describe('Issue 3: full-screen only for Hydration Reminders', () => {
  test('fixed and 2-hour Hydration Reminders and the nudge are full-screen', async () => {
    await NotificationService.scheduleHydrationReminders(at(1, 6));
    const reminders = [...mockOs.values()].filter(q => q.notification.data.notificationKey === 'regular_reminder');
    expect(reminders.length).toBeGreaterThan(12);
    for (const { notification } of reminders) {
      expect(notification.android.fullScreenAction?.id).toBe(REMINDER_FULL_SCREEN_ACTION);
      expect(notification.data.type).toBe(HYDRATION_REMINDER_TYPE);
    }
    jest.setSystemTime(at(1, 9));
    await deliverInBackground(fired(sim('0900', 'regular_reminder')));
    await NotificationService.snoozeReminder(15);
    expect(mockOs.get('hydration-snooze-nudge')!.notification.android.fullScreenAction?.id).toBe(REMINDER_FULL_SCREEN_ACTION);
  });

  test('Risk, FDI, CDI, Good Morning and Good Night are ordinary notifications', () => {
    const others = [...mockOs.values()].filter(q => q.notification.data.notificationKey !== 'regular_reminder');
    expect(new Set(others.map(q => q.notification.data.notificationKey))).toEqual(
      new Set(['elevated_risk', 'risk_improved', 'focus_alert', 'priority_alert', 'morning_msg', 'night_msg'])
    );
    for (const { notification } of others) {
      expect(notification.android.fullScreenAction).toBeUndefined();
      expect(notification.android.actions).toBeUndefined();
      expect(notification.data.type).not.toBe(HYDRATION_REMINDER_TYPE);
    }
  });

  test('Welcome and engine alerts are ordinary notifications', async () => {
    jest.setSystemTime(at(1, 14));
    await NotificationService.queueWelcomeNotification();
    await NotificationService.showPendingWelcome();
    jest.setSystemTime(at(1, 14, 40));
    await NotificationService.displayNotification('💦 High Humidity', 'b', undefined, 'local', { notificationKey: 'high_humidity' });
    expect(mockTray).toHaveLength(2);
    for (const { notification } of mockTray) {
      expect(notification.android.fullScreenAction).toBeUndefined();
      expect(notification.data.type).not.toBe(HYDRATION_REMINDER_TYPE);
    }
  });

  test('a Hydration Reminder arriving in the sleep window is withdrawn and never presented', async () => {
    jest.setSystemTime(at(2, 2));
    const n = {
      id: 'hydration-snooze-nudge',
      data: { type: HYDRATION_REMINDER_TYPE, notificationKey: 'regular_reminder', eventId: `hydration-snooze-nudge@${at(2, 2)}` },
    };
    expect(await deliverInBackground(n)).toBe(false);
    expect(await NotificationService.reminderDueNow()).toBeNull();
  });
});
