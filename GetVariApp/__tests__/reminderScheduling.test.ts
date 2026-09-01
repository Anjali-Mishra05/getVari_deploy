/**
 * N1 — the recurring hydration reminder.
 *
 * Unlike the other 23 notifications this one is not raised by
 * `NotificationEngine.evaluate`; it is a rolling batch of one-shot triggers
 * queued with Notifee. This suite drives the real `NotificationService` with
 * Notifee mocked and checks the cadence, the sleep-window shift, the reset on
 * a new hydration entry, and the permission gate.
 *
 *   npx jest --config jest.config.logic.js __tests__/reminderScheduling.test.ts
 */

const mockStore = new Map<string, string>();

/** Every trigger notification Notifee was asked to queue. */
const mockQueued: Array<{ notification: any; trigger: any }> = [];
/** Ids the fake OS currently holds — added on queue, removed on cancel. */
const mockOsQueue = new Set<string>();
let mockAuthStatus = 1; // AuthorizationStatus.AUTHORIZED
const mockCancelledIds: string[] = [];

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 33 },
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
    createChannel: () => Promise.resolve('hydration-reminders-v2'),
    deleteChannel: () => Promise.resolve(),
    getTriggerNotificationIds: () => Promise.resolve([...mockOsQueue]),
    cancelTriggerNotifications: (ids: string[]) => {
      mockCancelledIds.push(...ids);
      ids.forEach(id => mockOsQueue.delete(id));
      return Promise.resolve();
    },
    getDisplayedNotifications: () => Promise.resolve([]),
    cancelDisplayedNotifications: () => Promise.resolve(),
    createTriggerNotification: (notification: any, trigger: any) => {
      mockQueued.push({ notification, trigger });
      mockOsQueue.add(notification.id);
      return Promise.resolve(notification.id);
    },
    displayNotification: () => Promise.resolve(),
    onForegroundEvent: () => () => {},
    onBackgroundEvent: () => {},
    // Serves both readers: the exact-alarm check reads `android.alarm`, and
    // the permission check reads `authorizationStatus` — a plain read, with no
    // dialog and no focus change, which is why it is consulted before ever
    // prompting the user.
    getNotificationSettings: () =>
      Promise.resolve({ authorizationStatus: mockAuthStatus, android: { alarm: 1 } }),
  },
  AlarmType: { SET_ALARM_CLOCK: 1, SET_EXACT_AND_ALLOW_WHILE_IDLE: 0 },
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationSetting: { ENABLED: 1 },
  AuthorizationStatus: { DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 },
  EventType: { PRESS: 1, DELIVERED: 3 },
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

import { DEFAULT_SLEEP_SCHEDULE, isAsleepAt } from '../src/utils/sleepWindow';
import NotificationService, {
  DAILY_HORIZON_DAYS,
  DAILY_MESSAGE_TYPE,
  REMINDER_INTERVAL_MS,
  REMINDER_COVERAGE_MS,
  HYDRATION_REMINDER_TYPE,
} from '../src/services/NotificationService';

const SLOTS = Math.floor(REMINDER_COVERAGE_MS / REMINDER_INTERVAL_MS);

beforeEach(async () => {
  mockStore.clear();
  mockQueued.length = 0;
  mockOsQueue.clear();
  mockCancelledIds.length = 0;
  mockAuthStatus = 1;
  // Clears the *user's* window; the 23:00–07:00 default still applies.
  await NotificationService.clearSleepSchedule();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('N1: recurring hydration reminder', () => {
  test('a full window of reminders is queued at the configured interval', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    await NotificationService.scheduleHydrationReminders(now);

    expect(mockQueued).toHaveLength(SLOTS);
    // N1 in the spec: "Regular Hydration Reminder — every 2 hours".
    expect(REMINDER_INTERVAL_MS).toBe(2 * 60 * 60 * 1000);

    const timestamps = mockQueued.map(q => q.trigger.timestamp);
    expect(timestamps[0]).toBe(now + REMINDER_INTERVAL_MS);

    // 12:00 through 22:00 are two hours apart; the slots that would land in
    // the default 23:00–07:00 quiet window are held to 07:00 instead, which is
    // where the cadence picks up again.
    const daytime = timestamps.filter(t => new Date(t).getHours() < 23 && new Date(t).getHours() >= 7);
    for (let i = 1; i < daytime.length; i++) {
      expect(daytime[i] - daytime[i - 1]).toBeGreaterThanOrEqual(REMINDER_INTERVAL_MS);
    }
    expect(timestamps.every(t => !isAsleepAt(DEFAULT_SLEEP_SCHEDULE, t))).toBe(true);
  });

  test('each reminder carries the hydration type and a unique replay id', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    await NotificationService.scheduleHydrationReminders(now);

    const eventIds = new Set<string>();
    for (const { notification } of mockQueued) {
      expect(notification.data.type).toBe(HYDRATION_REMINDER_TYPE);
      // N1's message from the spec, verbatim and on every slot — the
      // "Log your water / still nothing logged" variations were a testing
      // nudge and are gone with the 2-minute cadence.
      expect(notification.title).toBe('💧 Hydration');
      expect(notification.body).toBe(
        'Time to hydrate! Please drink some water to stay hydrated.'
      );
      expect(notification.android.channelId).toBe('hydration-reminders-v2');
      eventIds.add(notification.data.eventId);
    }
    expect(eventIds.size).toBe(mockQueued.length);
  });

  test('reminders that would land in the sleep window are pushed to wake-up', async () => {
    jest.useFakeTimers();
    // 22:50, ten minutes before a 23:00 bedtime: every slot from here lands
    // inside the window, so all of them must reappear from 07:00 rather than
    // firing overnight.
    const now = new Date(2026, 8, 1, 22, 50, 0).getTime();
    jest.setSystemTime(now);

    await NotificationService.setSleepSchedule({ sleepStart: '23:00', wakeUp: '07:00' });
    mockQueued.length = 0;
    await NotificationService.scheduleHydrationReminders(now);

    const wakeUp = new Date(2026, 8, 2, 7, 0, 0).getTime();
    const overnight = mockQueued.filter(q => {
      const t = q.trigger.timestamp;
      return t > new Date(2026, 8, 1, 23, 0, 0).getTime() && t < wakeUp;
    });

    expect(mockQueued.length).toBeGreaterThan(0);
    expect(overnight).toHaveLength(0);
    expect(mockQueued.some(q => q.trigger.timestamp >= wakeUp)).toBe(true);

    // …and not *at* wake-up, which is when the morning message goes out.
    expect(mockQueued.every(q => q.trigger.timestamp !== wakeUp)).toBe(true);
  });

  test('rescheduling cancels the previous queue, so logging water resets the countdown', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    await NotificationService.scheduleHydrationReminders(now);
    const firstBatch = mockQueued.map(q => q.notification.id);
    mockQueued.length = 0;

    // The user logs water twenty minutes later.
    const later = now + 20 * 60_000;
    jest.setSystemTime(later);
    await NotificationService.scheduleHydrationReminders(later);

    expect(mockCancelledIds).toEqual(expect.arrayContaining(firstBatch));
    expect(mockQueued[0].trigger.timestamp).toBe(later + REMINDER_INTERVAL_MS);
  });

  test('nothing is queued when notification permission is denied', async () => {
    mockAuthStatus = 0; // DENIED
    await NotificationService.scheduleHydrationReminders(Date.now());
    expect(mockQueued).toHaveLength(0);
  });
});

describe('N17/N18: fixed-time daily messages', () => {
  const dailyQueue = () => mockQueued.filter(q => q.notification.id.startsWith('getvari-daily-'));

  test('the morning and night messages are queued at 07:00 and 22:00', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    await NotificationService.scheduleDailyNotifications(now);
    const queued = dailyQueue();

    // Today's 07:00 has already passed, so the first slot is tonight's 22:00.
    expect(queued.length).toBeGreaterThan(0);
    expect(new Date(queued[0].trigger.timestamp).getHours()).toBe(22);

    for (const { notification, trigger } of queued) {
      const at = new Date(trigger.timestamp);
      expect(at.getMinutes()).toBe(0);
      expect([7, 22]).toContain(at.getHours());
      expect(at.getTime()).toBeGreaterThan(now);
      expect(notification.data.type).toBe(DAILY_MESSAGE_TYPE);
      expect(notification.android.channelId).toBe('hydration-reminders-v2');
    }

    // A week of both messages, minus the morning that has already gone by.
    expect(queued).toHaveLength(DAILY_HORIZON_DAYS * 2 - 1);
  });

  test('a message that would land inside the sleep window is dropped, not shifted', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    // A late sleeper: 21:00-09:00 swallows both fixed times.
    await NotificationService.setSleepSchedule({ sleepStart: '21:00', wakeUp: '09:00' });
    mockQueued.length = 0;
    await NotificationService.scheduleDailyNotifications(now);

    expect(dailyQueue()).toHaveLength(0);
  });

  test('rescheduling replaces the previous week rather than stacking on it', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    await NotificationService.scheduleDailyNotifications(now);
    const firstBatch = dailyQueue().map(q => q.notification.id);
    mockQueued.length = 0;

    await NotificationService.scheduleDailyNotifications(now);

    expect(mockCancelledIds).toEqual(expect.arrayContaining(firstBatch));
    expect(dailyQueue()).toHaveLength(firstBatch.length);
  });

  test('nothing is queued when notification permission is denied', async () => {
    mockAuthStatus = 0; // DENIED
    await NotificationService.scheduleDailyNotifications(Date.now());
    expect(dailyQueue()).toHaveLength(0);
  });
});

describe('Burst of scheduling calls', () => {
  /**
   * Android re-reports 'active' repeatedly, and a hydration write reschedules
   * too, so several callers can ask for the same rebuild at once. Rebuilding
   * takes real native work, so the queue has to collapse duplicates: without
   * that it grows faster than it drains and a caller awaiting its own turn —
   * the chat's "Saving…" spinner, for one — never gets it.
   */
  test('overlapping calls collapse into one rebuild', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    // Prime the queue so the calls below land while one run is in flight.
    const first = NotificationService.scheduleHydrationReminders(now);
    const burst = Array.from({ length: 20 }, (_, i) =>
      NotificationService.scheduleHydrationReminders(now + i)
    );

    await Promise.all([first, ...burst]);

    // One run in flight plus at most one collapsed follow-up.
    expect(mockQueued.length).toBeLessThanOrEqual(SLOTS * 2);
  });

  test('every caller in a burst is resolved rather than left waiting', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    const settled: string[] = [];
    const calls = [
      NotificationService.scheduleHydrationReminders(now).then(() => settled.push('r1')),
      NotificationService.scheduleDailyNotifications(now).then(() => settled.push('d1')),
      NotificationService.scheduleHydrationReminders(now).then(() => settled.push('r2')),
      NotificationService.scheduleDailyNotifications(now).then(() => settled.push('d2')),
      // The one a hydration write makes, arriving last and behind the rest.
      NotificationService.scheduleHydrationReminders(now).then(() => settled.push('write')),
    ];

    await Promise.all(calls);
    expect(settled).toHaveLength(5);
    expect(settled).toContain('write');
  });
});
