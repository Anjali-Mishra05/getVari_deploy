/**
 * The full-screen reminder: what happens between a reminder firing and the
 * user answering it.
 *
 * Every case here is one of the reported failures, written as the behaviour
 * that has to hold instead:
 *
 *  - open the notification, do nothing, come back later → the prompt is still
 *    there (it used to have gone "inactive")
 *  - swipe the notification out of the shade → the reminder comes back rather
 *    than being lost
 *  - the amount most people log is already selected → one tap, not two
 *  - the reminder is raised as an alarm, so it is not delivered half an hour
 *    late
 *
 *   npx jest --config jest.config.logic.js __tests__/reminderPrompt.test.ts
 */

const mockStore = new Map<string, string>();
const mockQueued: Array<{ notification: any; trigger: any }> = [];
const mockOsQueue = new Set<string>();
const mockDisplayed: any[] = [];
const mockCancelledDisplayed: string[] = [];
let mockAuthStatus = 1; // AuthorizationStatus.AUTHORIZED

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
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
    requestPermission: () => Promise.resolve({ authorizationStatus: mockAuthStatus }),
    createChannel: (channel: any) => Promise.resolve(channel.id),
    deleteChannel: () => Promise.resolve(),
    getChannel: () => Promise.resolve({ id: 'hydration-reminders-v3', importance: 4 }),
    getTriggerNotificationIds: () => Promise.resolve([...mockOsQueue]),
    cancelTriggerNotifications: (ids: string[]) => {
      ids.forEach(id => mockOsQueue.delete(id));
      return Promise.resolve();
    },
    getDisplayedNotifications: () => Promise.resolve([...mockDisplayed]),
    cancelDisplayedNotifications: (ids: string[]) => {
      mockCancelledDisplayed.push(...ids);
      return Promise.resolve();
    },
    createTriggerNotification: (notification: any, trigger: any) => {
      mockQueued.push({ notification, trigger });
      mockOsQueue.add(notification.id);
      return Promise.resolve(notification.id);
    },
    displayNotification: () => Promise.resolve(),
    onForegroundEvent: () => () => {},
    onBackgroundEvent: () => {},
    getNotificationSettings: () =>
      Promise.resolve({ authorizationStatus: mockAuthStatus, android: { alarm: 1 } }),
  },
  AlarmType: { SET_ALARM_CLOCK: 1, SET_EXACT_AND_ALLOW_WHILE_IDLE: 0 },
  AndroidCategory: { ALARM: 'alarm', REMINDER: 'reminder' },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  AndroidStyle: { BIGTEXT: 1 },
  AndroidNotificationSetting: { ENABLED: 1 },
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

import ActiveReminder, {
  DISMISS_SNOOZE_MS,
  SNOOZE_OPTIONS_MIN,
  STALE_AFTER_MS,
} from '../src/services/ActiveReminder';
import NotificationService, {
  HYDRATION_REMINDER_TYPE,
  NOTIFICATION_SNOOZE_MIN,
  REMINDER_LOG_ACTION,
  REMINDER_SNOOZE_ACTION,
} from '../src/services/NotificationService';
import { primaryQuickAmount, quickLogAmounts } from '../src/utils/hydrationAmounts';

/** Notifee's `EventType`, as the mock above defines it. */
const DISMISSED = 0;
const PRESS = 1;
const ACTION_PRESS = 2;
const DELIVERED = 3;

/** A reminder notification as the OS hands it back on an event. */
const reminderEvent = (eventId = 'hydration-reminder-1@1000', primaryMl = '500') => ({
  notification: {
    id: 'hydration-reminder-1',
    title: '💧 Hydration',
    body: 'Time to hydrate! Please drink some water to stay hydrated.',
    data: { type: HYDRATION_REMINDER_TYPE, eventId, primaryMl },
  },
});

/**
 * A fixed, waking Tuesday afternoon.
 *
 * Without this the suite ran on the wall clock, which meant every assertion
 * about a delivered reminder depended on what time the developer happened to
 * run it: the app withdraws a delivery that lands inside the quiet window, and
 * with no schedule stored that window is the 23:00-07:00 default. Running the
 * tests after eleven at night made them fail on a rule they are not about.
 */
const DAYTIME = new Date(2026, 8, 1, 14, 0, 0);

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(DAYTIME);
  mockStore.clear();
  mockQueued.length = 0;
  mockOsQueue.clear();
  mockDisplayed.length = 0;
  mockCancelledDisplayed.length = 0;
  mockAuthStatus = 1;
  ActiveReminder.__resetForTests();
  await NotificationService.clearSleepSchedule();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('A reminder stays answerable', () => {
  test('opening it and doing nothing leaves it outstanding', async () => {
    await NotificationService.handleReminderEvent(DELIVERED as any, reminderEvent());
    // The press only *opens* the prompt; it is not an answer.
    const verdict = await NotificationService.handleReminderEvent(PRESS as any, reminderEvent());
    expect(verdict).toBe('open-prompt');

    // Coming back to it later — a fresh read, as a relaunched app would do —
    // still finds a reminder to present. This is the regression that made a
    // notification go "inactive" once it had been opened.
    expect(await ActiveReminder.due()).not.toBeNull();
  });

  test('a reminder survives a restart of the app', async () => {
    await NotificationService.handleReminderEvent(DELIVERED as any, reminderEvent());
    expect(await ActiveReminder.due()).not.toBeNull();

    // A restart: in-memory state is gone, storage is not.
    ActiveReminder.__resetForTests();

    const restored = await ActiveReminder.due();
    expect(restored?.eventId).toBe('hydration-reminder-1@1000');
  });

  test('only an answer clears it', async () => {
    await NotificationService.handleReminderEvent(DELIVERED as any, reminderEvent());
    await NotificationService.resolveActiveReminder();
    expect(await ActiveReminder.due()).toBeNull();
  });

  test('a reminder older than the staleness ceiling is dropped, not shown', async () => {
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);

    await ActiveReminder.raise('hydration-reminder-1@1000', now);
    expect(await ActiveReminder.due(now + 60_000)).not.toBeNull();

    // A phone left in a drawer: the cadence has produced fresher reminders by
    // now, and greeting the user with yesterday's is worse than nothing.
    expect(await ActiveReminder.due(now + STALE_AFTER_MS + 1)).toBeNull();
    expect(await ActiveReminder.current()).toBeNull();
  });
});

describe('Swiping the notification away does not lose the reminder', () => {
  test('a dismissal becomes a snooze rather than an answer', async () => {
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);

    await NotificationService.handleReminderEvent(DISMISSED as any, reminderEvent());

    const record = await ActiveReminder.current();
    expect(record).not.toBeNull();
    expect(record!.state).toBe('snoozed');
    expect(record!.wakeAt).toBe(now + DISMISS_SNOOZE_MS);

    // Nothing to show right now…
    expect(await ActiveReminder.due(now + 60_000)).toBeNull();
    // …but it comes back on its own.
    expect(await ActiveReminder.due(now + DISMISS_SNOOZE_MS + 1)).not.toBeNull();
  });

  test('a dismissal queues the notification that brings it back', async () => {
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);

    await NotificationService.handleReminderEvent(DISMISSED as any, reminderEvent());

    const nudge = mockQueued.find(q => q.notification.id === 'hydration-snooze-nudge');
    expect(nudge).toBeDefined();
    expect(nudge!.trigger.timestamp).toBe(now + DISMISS_SNOOZE_MS);
    expect(nudge!.notification.data.type).toBe(HYDRATION_REMINDER_TYPE);
  });

  test('the snooze nudge survives the cadence rebuild a foreground triggers', async () => {
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);

    await NotificationService.handleReminderEvent(DISMISSED as any, reminderEvent());
    expect(mockOsQueue.has('hydration-snooze-nudge')).toBe(true);

    // Opening the app rebuilds the 2-hourly queue, which cancels every id
    // under the reminder prefix. The snooze deliberately sits outside it —
    // otherwise a user who opened the app would silently lose the reminder
    // they had just asked to be reminded about.
    await NotificationService.scheduleHydrationReminders(now);
    expect(mockOsQueue.has('hydration-snooze-nudge')).toBe(true);
  });
});

describe('Snooze and reschedule', () => {
  test('the shade’s snooze button pushes the reminder back without opening the app', async () => {
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);

    const verdict = await NotificationService.handleReminderEvent(ACTION_PRESS as any, {
      ...reminderEvent(),
      pressAction: { id: REMINDER_SNOOZE_ACTION },
    });

    // 'none' is the point: snoozing must not drag the app to the front.
    expect(verdict).toBe('none');

    const record = await ActiveReminder.current();
    expect(record!.state).toBe('snoozed');
    expect(record!.wakeAt).toBe(now + NOTIFICATION_SNOOZE_MIN * 60_000);
  });

  test('the shade’s log button asks the caller to write the primary amount', async () => {
    const verdict = await NotificationService.handleReminderEvent(ACTION_PRESS as any, {
      ...reminderEvent('hydration-reminder-1@1000', '750'),
      pressAction: { id: REMINDER_LOG_ACTION },
    });

    expect(verdict).toBe('log-primary');
    // Read off the notification, so a handler running before the admin config
    // has loaded still logs the amount whose label the user actually read.
    expect(
      NotificationService.readPrimaryAmountMl(
        reminderEvent('hydration-reminder-1@1000', '750').notification as any
      )
    ).toBe(750);
  });

  test('each snooze replaces the previous nudge instead of stacking', async () => {
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);

    await ActiveReminder.raise('hydration-reminder-1@1000', now);
    await NotificationService.snoozeReminder(15);
    await NotificationService.snoozeReminder(30);

    const nudges = mockQueued.filter(q => q.notification.id === 'hydration-snooze-nudge');
    expect(nudges.length).toBe(2);
    // Both were queued, but only one is held by the OS — the second cancelled
    // the first, so the user is nudged once rather than twice.
    expect([...mockOsQueue].filter(id => id === 'hydration-snooze-nudge').length).toBe(1);
    expect(nudges[1].trigger.timestamp).toBe(now + 30 * 60_000);
  });

  test('a reschedule into the past or into the sleep window is refused', async () => {
    jest.useFakeTimers();
    // 22:00, an hour before the default 23:00 bedtime.
    const now = new Date(2026, 8, 1, 22, 0, 0).getTime();
    jest.setSystemTime(now);
    await ActiveReminder.raise('hydration-reminder-1@1000', now);

    expect(await NotificationService.rescheduleReminderAt(now - 1000)).toBe(false);
    // 01:00 the next morning is inside 23:00–07:00. Accepting it would promise
    // a reminder the sleep rule guarantees will never be shown.
    expect(
      await NotificationService.rescheduleReminderAt(new Date(2026, 8, 2, 1, 0, 0).getTime())
    ).toBe(false);

    // 22:30 is still awake, so this one is honoured.
    expect(
      await NotificationService.rescheduleReminderAt(new Date(2026, 8, 1, 22, 30, 0).getTime())
    ).toBe(true);
  });

  test('snoozing with nothing outstanding does nothing at all', async () => {
    expect(await NotificationService.snoozeReminder(15)).toBeNull();
    expect(mockQueued.length).toBe(0);
  });
});

describe('The reminder notification is built to be answered', () => {
  test('it is queued as an alarm, so it is not batched or delayed', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 9, 0, 0).getTime();
    jest.setSystemTime(now);

    await NotificationService.scheduleHydrationReminders(now);
    expect(mockQueued.length).toBeGreaterThan(0);

    for (const { trigger } of mockQueued) {
      // SET_ALARM_CLOCK (1), not SET_EXACT_AND_ALLOW_WHILE_IDLE (0): only the
      // former is exempt from the Doze rate limit that delivered reminders up
      // to half an hour late.
      expect(trigger.alarmManager.type).toBe(1);
    }
  });

  test('it carries a full-screen action, so it takes over the screen', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 1, 9, 0, 0).getTime());
    await NotificationService.scheduleHydrationReminders();

    for (const { notification } of mockQueued) {
      expect(notification.android.fullScreenAction).toEqual({
        id: 'hydration-full-screen',
        launchActivity: 'default',
      });
      // ALARM ranks it above the social chatter it was getting lost in, and
      // is what survives Do Not Disturb's "alarms only" mode.
      expect(notification.android.category).toBe('alarm');
    }
  });

  test('it offers log and snooze without opening the app', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 1, 9, 0, 0).getTime());
    await NotificationService.scheduleHydrationReminders();

    const { notification } = mockQueued[0];
    const [log, snooze] = notification.android.actions;

    expect(log.title).toBe(`Log ${primaryQuickAmount().label}`);
    expect(log.pressAction.id).toBe(REMINDER_LOG_ACTION);

    expect(snooze.title).toBe(`Snooze ${NOTIFICATION_SNOOZE_MIN}m`);
    expect(snooze.pressAction.id).toBe(REMINDER_SNOOZE_ACTION);
    // No launchActivity: snoozing must not bring the app to the front.
    expect(snooze.pressAction.launchActivity).toBeUndefined();

    // The action must survive the press that triggers it.
    expect(notification.android.autoCancel).toBe(false);
  });

  test('the amount the log button offers is stamped on the notification', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 1, 9, 0, 0).getTime());
    await NotificationService.scheduleHydrationReminders();

    for (const { notification } of mockQueued) {
      expect(notification.data.primaryMl).toBe(String(primaryQuickAmount().ml));
    }
  });
});

describe('One tap, not two', () => {
  test('exactly one amount is marked as the one to pre-select', async () => {
    const amounts = quickLogAmounts();
    expect(amounts.length).toBeGreaterThan(0);

    const primary = primaryQuickAmount();
    expect(amounts).toContainEqual(primary);
    // The shipped list marks 500 ml, which is the amount the reported defect
    // was about having to choose every time.
    expect(primary.ml).toBe(500);
  });

  test('there is always an amount to pre-select, even with none flagged', async () => {
    const AppConfigStore = require('../src/config/appConfigStore');
    const original = AppConfigStore.current();

    AppConfigStore.adopt({
      ...original,
      quickLogAmounts: [
        { ml: 200, label: '200 ml', primary: false },
        { ml: 400, label: '400 ml', primary: false },
      ],
    });

    // Falls back to the first, rather than leaving the user with nothing
    // selected and a disabled button.
    expect(primaryQuickAmount().ml).toBe(200);

    AppConfigStore.adopt(original);
  });
});

describe('Repeat deliveries of one press', () => {
  test('the same reminder delivered three ways is one outstanding reminder', async () => {
    // The OS can deliver one press through the foreground listener, the
    // background handler and getInitialNotification().
    await NotificationService.handleReminderEvent(DELIVERED as any, reminderEvent());
    await NotificationService.handleReminderEvent(PRESS as any, reminderEvent());
    await NotificationService.noteReminderDelivered(reminderEvent().notification as any);

    const record = await ActiveReminder.current();
    expect(record!.eventId).toBe('hydration-reminder-1@1000');
    expect(record!.snoozeCount).toBe(0);
  });

  test('a second reminder delivery is suppressed by the global spacing rule', async () => {
    await NotificationService.handleReminderEvent(DELIVERED as any, reminderEvent('event-a'));
    await NotificationService.handleReminderEvent(DELIVERED as any, reminderEvent('event-b'));

    // A second delivery inside the global gap must not create another prompt.
    const record = await ActiveReminder.current();
    expect(record!.eventId).toBe('event-a');
  });

  test('a non-reminder notification is ignored entirely', async () => {
    const verdict = await NotificationService.handleReminderEvent(PRESS as any, {
      notification: { id: 'getvari-daily-morning-0', data: { type: 'daily_message' } },
    });

    expect(verdict).toBe('none');
    expect(await ActiveReminder.current()).toBeNull();
  });
});

describe('The snooze options the UI offers', () => {
  test('every offered snooze is a real, forward-moving delay', () => {
    expect(SNOOZE_OPTIONS_MIN.length).toBeGreaterThan(0);
    for (const minutes of SNOOZE_OPTIONS_MIN) {
      expect(minutes).toBeGreaterThan(0);
    }
    // Ascending, so the list reads as a scale rather than a jumble.
    expect([...SNOOZE_OPTIONS_MIN]).toEqual([...SNOOZE_OPTIONS_MIN].sort((a, b) => a - b));
  });
});
