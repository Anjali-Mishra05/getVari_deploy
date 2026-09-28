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
/** Ids withdrawn from the tray, for the sleep-window gate below. */
const mockCancelledDisplayed: string[] = [];
let mockDisplayed: any[] = [];
/** Channels the fake OS holds, so the immutability rule can be asserted. */
const mockChannels = new Map<string, any>();
const mockDeletedChannels: string[] = [];

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 33 },
  // The full-screen-intent bridge. Absent by default, which is exactly the
  // shape the service has to cope with on iOS and on a build without it.
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
    createChannel: (channel: any) => {
      mockChannels.set(channel.id, channel);
      return Promise.resolve(channel.id);
    },
    deleteChannel: (id: string) => {
      mockDeletedChannels.push(id);
      mockChannels.delete(id);
      return Promise.resolve();
    },
    getChannel: (id: string) => Promise.resolve(mockChannels.get(id) ?? null),
    getTriggerNotificationIds: () => Promise.resolve([...mockOsQueue]),
    cancelTriggerNotifications: (ids: string[]) => {
      mockCancelledIds.push(...ids);
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
    // Serves both readers: the exact-alarm check reads `android.alarm`, and
    // the permission check reads `authorizationStatus` — a plain read, with no
    // dialog and no focus change, which is why it is consulted before ever
    // prompting the user.
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

import { DEFAULT_SLEEP_SCHEDULE, isAsleepAt } from '../src/utils/sleepWindow';
import { GENERIC_REMINDER_BODIES } from '../src/utils/reminderContent';
import NotificationService, {
  DAILY_HORIZON_DAYS,
  DAILY_MESSAGE_TYPE,
  REMINDER_CHANNEL_ID,
  REMINDER_INTERVAL_MS,
  REMINDER_COVERAGE_MS,
  HYDRATION_REMINDER_TYPE,
  SIMULATED_SCHEDULE_SLOTS,
  SIMULATED_ID_PREFIX,
  calculateDailySimulatedSchedule,
} from '../src/services/NotificationService';

const SLOTS = Math.floor(REMINDER_COVERAGE_MS / REMINDER_INTERVAL_MS);

beforeEach(async () => {
  mockStore.clear();
  mockQueued.length = 0;
  mockOsQueue.clear();
  mockCancelledIds.length = 0;
  mockCancelledDisplayed.length = 0;
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
      expect(notification.title).toBe('💧 Hydration Reminder');
      // Excel copy is queued as-is and never rewritten at delivery.
      expect(notification.body).toContain('No water for 2 hours?');
      expect(notification.android.channelId).toBe(REMINDER_CHANNEL_ID);
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

  test('the messages are placed an hour inside each end of the sleep window', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    // The default window is 23:00–07:00, so the greeting lands an hour after
    // waking (08:00) and the wind-down an hour before bed (22:00). Neither is
    // a fixed time any more: both follow whatever window the user chose.
    await NotificationService.scheduleDailyNotifications(now);
    const queued = dailyQueue();

    // Today's 08:00 has already passed, so the first slot is tonight's 22:00.
    expect(queued.length).toBeGreaterThan(0);
    expect(new Date(queued[0].trigger.timestamp).getHours()).toBe(22);

    for (const { notification, trigger } of queued) {
      const at = new Date(trigger.timestamp);
      expect(at.getMinutes()).toBe(0);
      expect([8, 22]).toContain(at.getHours());
      expect(at.getTime()).toBeGreaterThan(now);
      expect(notification.data.type).toBe(DAILY_MESSAGE_TYPE);
      expect(notification.android.channelId).toBe(REMINDER_CHANNEL_ID);
    }

    // A week of both messages, minus the morning that has already gone by.
    expect(queued).toHaveLength(DAILY_HORIZON_DAYS * 2 - 1);
  });

  test('a shifted window moves both messages with it', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    // A night-shift nurse: asleep 09:00–17:00. Under the old fixed times the
    // greeting arrived at 7 AM as they got into bed.
    await NotificationService.setSleepSchedule({ sleepStart: '09:00', wakeUp: '17:00' });
    mockQueued.length = 0;
    await NotificationService.scheduleDailyNotifications(now);

    const hours = dailyQueue().map(q => new Date(q.trigger.timestamp).getHours());
    expect(hours.length).toBeGreaterThan(0);
    // 17:00 + 1h = 18:00, and 09:00 − 1h = 08:00.
    for (const hour of hours) expect([18, 8]).toContain(hour);
  });

  test('uses exact one-hour offsets for a configured same-day window', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 8, 0, 0).getTime();
    jest.setSystemTime(now);

    await NotificationService.setSleepSchedule({ sleepStart: '23:00', wakeUp: '09:00' });
    mockQueued.length = 0;
    await NotificationService.scheduleDailyNotifications(now);

    const times = dailyQueue().map(q => {
      const at = new Date(q.trigger.timestamp);
      return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    });

    expect(times).toContain('10:00');
    expect(times).toContain('22:00');
  });

  test('uses exact one-hour offsets when bedtime crosses midnight', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 8, 0, 0).getTime();
    jest.setSystemTime(now);

    await NotificationService.setSleepSchedule({ sleepStart: '00:30', wakeUp: '08:00' });
    mockQueued.length = 0;
    await NotificationService.scheduleDailyNotifications(now);

    const times = dailyQueue().map(q => {
      const at = new Date(q.trigger.timestamp);
      return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    });

    expect(times).toContain('09:00');
    expect(times).toContain('23:30');
  });

  test('a message that would land inside the sleep window is dropped, not shifted', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    // Derived times sit outside the window by construction, so the only way
    // to fold one back inside is an awake stretch shorter than the offsets:
    // up 08:00–08:30 puts the greeting at 09:00 and the wind-down at 07:30,
    // both of them inside the sleep window.
    await NotificationService.setSleepSchedule({ sleepStart: '08:30', wakeUp: '08:00' });
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

  test('changing the sleep schedule cancels old daily times before queuing new ones', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    await NotificationService.setSleepSchedule({ sleepStart: '23:00', wakeUp: '07:00' });
    const firstBatch = dailyQueue().map(q => q.notification.id);
    mockQueued.length = 0;
    mockCancelledIds.length = 0;

    await NotificationService.setSleepSchedule({ sleepStart: '00:30', wakeUp: '08:00' });

    expect(mockCancelledIds).toEqual(expect.arrayContaining(firstBatch));
    const replacementIds = dailyQueue().map(q => q.notification.id);
    expect(new Set(replacementIds).size).toBe(replacementIds.length);
    const replacementTimes = dailyQueue().map(q => {
      const at = new Date(q.trigger.timestamp);
      return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    });
    expect(replacementTimes).toContain('09:00');
    expect(replacementTimes).toContain('23:30');
  });

  test('nothing is queued when notification permission is denied', async () => {
    mockAuthStatus = 0; // DENIED
    await NotificationService.scheduleDailyNotifications(Date.now());
    expect(dailyQueue()).toHaveLength(0);
  });
});

describe('Simulated Excel Notifications schedule & Dynamic Window', () => {
  const simulatedQueue = () => mockQueued.filter(q => q.notification.id.startsWith(SIMULATED_ID_PREFIX));

  test('Case 1 & 3: User A (Wake 7:00 AM, Sleep 11:00 PM) -> GM 8:00 AM, GN 10:00 PM; Slot 11 is >= 30m before GN', () => {
    const date = new Date(2026, 8, 1, 0, 0, 0);
    const schedule = { wakeUp: '07:00', sleepStart: '23:00' };
    const slots = calculateDailySimulatedSchedule(schedule, date);

    expect(slots).toHaveLength(11);
    const gmTime = new Date(2026, 8, 1, 8, 0, 0).getTime();
    const gnTime = new Date(2026, 8, 1, 22, 0, 0).getTime();

    // GM to Slot 1 >= 30m
    expect((slots[0].timestamp - gmTime) / 60000).toBeGreaterThanOrEqual(30);

    // Consecutive gaps >= 30m
    for (let i = 1; i < slots.length; i++) {
      const gapMins = (slots[i].timestamp - slots[i - 1].timestamp) / 60000;
      expect(gapMins).toBeGreaterThanOrEqual(30);
    }

    // Slot 11 to GN >= 30m
    const slot11ToGn = (gnTime - slots[10].timestamp) / 60000;
    expect(slot11ToGn).toBeGreaterThanOrEqual(30);
  });

  test('Case 2 & 4: User B (Wake 10:00 AM, Sleep 12:00 AM) -> GM 11:00 AM, GN 11:00 PM; Slot 11 is >= 30m before GN', () => {
    const date = new Date(2026, 8, 1, 0, 0, 0);
    const schedule = { wakeUp: '10:00', sleepStart: '00:00' };
    const slots = calculateDailySimulatedSchedule(schedule, date);

    expect(slots).toHaveLength(11);
    const gmTime = new Date(2026, 8, 1, 11, 0, 0).getTime();
    const gnTime = new Date(2026, 8, 1, 23, 0, 0).getTime();

    expect((slots[0].timestamp - gmTime) / 60000).toBeGreaterThanOrEqual(30);

    for (let i = 1; i < slots.length; i++) {
      const gapMins = (slots[i].timestamp - slots[i - 1].timestamp) / 60000;
      expect(gapMins).toBeGreaterThanOrEqual(30);
    }

    const slot11ToGn = (gnTime - slots[10].timestamp) / 60000;
    expect(slot11ToGn).toBeGreaterThanOrEqual(30);
  });

  test('Case 5 & 6: Impossible short window (< 360m) is detected rather than violating spacing rules', () => {
    const date = new Date(2026, 8, 1, 0, 0, 0);
    // 5-hour window (GM 09:00 AM -> GN 02:00 PM = 300 mins < 360 mins required)
    const schedule = { wakeUp: '08:00', sleepStart: '15:00' };
    const slots = calculateDailySimulatedSchedule(schedule, date);

    // Detected as impossible window -> returns empty array rather than violating spacing
    expect(slots).toHaveLength(0);
  });

  test('Case 8: GM is exactly wake + 1h and GN is exactly sleep - 1h', () => {
    const date = new Date(2026, 8, 1, 0, 0, 0);
    const schedule = { wakeUp: '06:30', sleepStart: '22:30' };
    const slots = calculateDailySimulatedSchedule(schedule, date);

    const gmTime = new Date(2026, 8, 1, 7, 30, 0).getTime();
    const gnTime = new Date(2026, 8, 1, 21, 30, 0).getTime();

    expect((slots[0].timestamp - gmTime) / 60000).toBeGreaterThanOrEqual(30);
    expect((gnTime - slots[10].timestamp) / 60000).toBeGreaterThanOrEqual(30);
  });

  test('Case 9: Changing user sleep/wake schedule cancels/rebuilds simulated schedule correctly without duplicates', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 8, 0, 0).getTime();
    jest.setSystemTime(now);

    await NotificationService.scheduleDailyNotifications(now);
    await NotificationService.scheduleSimulatedNotifications(now);
    const simBatch = Array.from(mockOsQueue).filter(id => id.startsWith(SIMULATED_ID_PREFIX));

    mockQueued.length = 0;
    mockCancelledIds.length = 0;

    await NotificationService.setSleepSchedule({ wakeUp: '09:00', sleepStart: '01:00' });

    expect(mockCancelledIds).toEqual(expect.arrayContaining(simBatch));
    expect(mockCancelledIds.some(id => id.startsWith('getvari-daily-'))).toBe(true); // Daily also rebuilt
  });

  test('Issue 1: Blocked scheduled notification is rescheduled to next valid time rather than dropped', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    // Record a notification delivered 5 minutes ago (at 09:55 AM)
    await NotificationService.noteNotificationShown(now - 5 * 60 * 1000);

    const testNotif: any = {
      id: 'test-slot-1',
      title: 'Hydration Reminder',
      body: 'Time to drink water',
      data: { notificationKey: 'regular_reminder', type: HYDRATION_REMINDER_TYPE, eventId: 'test-slot-1@10000' },
    };

    const accepted = await NotificationService.acceptScheduledDelivery(testNotif);
    // Blocked because 5m < 30m gap
    expect(accepted).toBe(false);

    // Check that a rescheduled trigger notification was queued
    const rescheduled = mockQueued.find(q => q.notification.id?.includes('test-slot-1-shift-'));
    expect(rescheduled).toBeDefined();
    expect(rescheduled.trigger.timestamp).toBeGreaterThanOrEqual(now + 25 * 60 * 1000); // Shifted by ~25m to satisfy 30m gap
  });

  test('Issue 2: Tray synchronization clears old expired notifications (>30m) without creating a burst', async () => {
    jest.useFakeTimers();
    const scheduledMs = new Date(2026, 8, 1, 10, 0, 0).getTime();
    const now = new Date(2026, 8, 1, 14, 0, 0).getTime(); // 4 hours later
    jest.setSystemTime(now);

    mockCancelledDisplayed.length = 0;

    // Tray contains a notification scheduled for 10:00 AM (4 hours old)
    mockDisplayed = [
      {
        id: 'old-notif-1',
        notification: {
          id: 'old-notif-1',
          title: 'Elevated Risk',
          body: 'Risk elevated',
          data: { notificationKey: 'elevated_risk', eventId: `old-notif-1@${scheduledMs}` },
        },
        date: new Date(scheduledMs).toISOString(),
      },
    ];

    await NotificationService.syncDeliveredFromTray();

    // Expired notification marked processed and cancelled from displayed tray without triggering prompt
    expect(mockCancelledDisplayed).toContain('old-notif-1');
  });
});

describe('Notification body is readable when expanded', () => {
  /** Notifee's `AndroidStyle.BIGTEXT`, which is a numeric enum member. */
  const BIGTEXT = 1;

  /**
   * Android truncates a notification body to one line unless the notification
   * carries a style to expand into. Without BigText the expand chevron showed
   * the same clipped text again, so anything longer than about forty
   * characters — the morning greeting, an AI-written nudge — could not be read
   * from the shade at all.
   */
  test('every queued reminder can expand to its full body', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    await NotificationService.scheduleHydrationReminders(now);
    expect(mockQueued.length).toBeGreaterThan(0);

    for (const { notification } of mockQueued) {
      expect(notification.android.style).toBeDefined();
      expect(notification.android.style.type).toBe(BIGTEXT);
      // The expanded text must be the body itself, not a truncation of it.
      expect(notification.android.style.text).toBe(notification.body);
    }
  });

  test('every fixed-time message can expand to its full body', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 10, 0, 0).getTime();
    jest.setSystemTime(now);

    await NotificationService.scheduleDailyNotifications(now);
    const queued = mockQueued.filter(q => q.notification.id.startsWith('getvari-daily-'));
    expect(queued.length).toBeGreaterThan(0);

    for (const { notification } of queued) {
      expect(notification.android.style.type).toBe(BIGTEXT);
      expect(notification.android.style.text).toBe(notification.body);
      // The summary line names the message once it is open.
      expect(notification.android.style.summary).toBe(notification.title);
    }
  });

  test('the daily bodies are long enough that this actually matters', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 1, 10, 0, 0).getTime());

    await NotificationService.scheduleDailyNotifications(Date.now());
    const morning = mockQueued.find(q => q.notification.id.includes('morning'));

    // Guards the premise: if every body were short, BigText would be
    // decoration rather than a fix, and this suite would be testing nothing.
    expect(morning!.notification.body.length).toBeGreaterThan(40);
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

// ---------------------------------------------------------------------------
// The sleep window as a thing that cannot be lost or slipped past
// ---------------------------------------------------------------------------

describe('The quiet window holds', () => {
  test('a profile with no sleep window does not erase the one already stored', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 1, 10, 0, 0));

    await NotificationService.setSleepSchedule({ sleepStart: '21:00', wakeUp: '05:00' });

    // What every caller actually passes: `normaliseSleepSchedule(profile)`,
    // which is null for a profile row that simply does not carry the field —
    // an older row, or a load that came back partial. Treating that as "this
    // user has no quiet hours" wiped the window set during onboarding on the
    // very next profile load, and the app fell back to the 23:00-07:00
    // default: reminders at ten at night for someone who sleeps at nine.
    await NotificationService.setSleepSchedule(null);

    expect(await NotificationService.getSleepSchedule()).toEqual({
      sleepStart: '21:00',
      wakeUp: '05:00',
    });
    // 22:00 is inside the user's window and outside the default one.
    expect(await NotificationService.isSleeping(new Date(2026, 8, 1, 22, 0, 0).getTime())).toBe(
      true
    );
  });

  test('signing out is still able to forget it', async () => {
    await NotificationService.setSleepSchedule({ sleepStart: '21:00', wakeUp: '05:00' });
    await NotificationService.clearSleepSchedule();

    // Back to the default window rather than to no window at all.
    expect(await NotificationService.getSleepSchedule()).toEqual({
      sleepStart: '23:00',
      wakeUp: '07:00',
    });
  });

  test('a reminder that fires inside the window is withdrawn, not shown', async () => {
    jest.useFakeTimers();
    // 02:00, deep inside a 23:00-07:00 window. Reminders are handed to
    // AlarmManager up to a day ahead, so one queued before the window changed
    // can still arrive here with the app not running to re-queue it. This is
    // the last gate.
    jest.setSystemTime(new Date(2026, 8, 2, 2, 0, 0));
    await NotificationService.setSleepSchedule({ sleepStart: '23:00', wakeUp: '07:00' });
    mockCancelledDisplayed.length = 0;
    mockQueued.length = 0;

    const withdrawn = await NotificationService.suppressIfAsleep({
      id: 'getvari-hydration-reminder-3',
      data: { type: HYDRATION_REMINDER_TYPE },
    } as any);

    expect(withdrawn).toBe(true);
    expect(mockCancelledDisplayed).toContain('getvari-hydration-reminder-3');

    // …and the rest of the night is repaired on the way out, so one stray
    // delivery does not become one an hour until morning.
    const wakeUp = new Date(2026, 8, 2, 7, 0, 0).getTime();
    expect(mockQueued.length).toBeGreaterThan(0);
    expect(mockQueued.every(q => q.trigger.timestamp >= wakeUp)).toBe(true);
  });

  test('a reminder that fires while the user is up is left alone', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 1, 14, 0, 0));
    await NotificationService.setSleepSchedule({ sleepStart: '23:00', wakeUp: '07:00' });
    mockCancelledDisplayed.length = 0;

    const withdrawn = await NotificationService.suppressIfAsleep({
      id: 'getvari-hydration-reminder-1',
      data: { type: HYDRATION_REMINDER_TYPE },
    } as any);

    expect(withdrawn).toBe(false);
    expect(mockCancelledDisplayed).toHaveLength(0);
  });
});

describe('Excel Specification & Delivery Spacing Rules', () => {
  test('Hydration reminder delivered within 30 minutes of another notification is suppressed and withdrawn from shade', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 14, 0, 0).getTime();
    jest.setSystemTime(now);

    // Record a previous delivery
    await NotificationService.noteNotificationShown(now);

    mockCancelledDisplayed.length = 0;
    const reminderNotif = {
      id: 'rem-suppressed-1',
      title: '💧 Hydration',
      body: 'Time to hydrate',
      data: { type: HYDRATION_REMINDER_TYPE, notificationKey: 'regular_reminder', eventId: 'ev-rem-1' },
    } as any;

    // Fire 10 minutes after previous notification
    jest.setSystemTime(now + 10 * 60_000);
    const result = await NotificationService.handleReminderEvent(3 /* EventType.DELIVERED */, {
      notification: reminderNotif,
    } as any);

    expect(result).toBe('none');
    expect(mockCancelledDisplayed).toContain('rem-suppressed-1');
  });

  test('High risk notification respects the 30-minute global delivery gap', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 14, 0, 0).getTime();
    jest.setSystemTime(now);

    // Deliver a local notification
    await NotificationService.displayNotification('Welcome', 'Hello', undefined, 'local', {
      notificationKey: 'welcome',
    });

    // Try to deliver High Risk 15 minutes later
    jest.setSystemTime(now + 15 * 60_000);
    const suppressed = await NotificationService.displayNotification('🚨 High Risk', 'High risk body', undefined, 'local', {
      notificationKey: 'high_risk',
    });
    expect(suppressed).toBe(false);

    // Try to deliver High Risk 35 minutes later
    jest.setSystemTime(now + 35 * 60_000);
    const delivered = await NotificationService.displayNotification('🚨 High Risk', 'High risk body', undefined, 'local', {
      notificationKey: 'high_risk',
    });
    expect(delivered).toBe(true);
  });

  test('Same notification type cannot repeat within 1 hour', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 14, 0, 0).getTime();
    jest.setSystemTime(now);

    // Deliver regular_reminder
    await NotificationService.displayNotification('💧 Hydration', 'Drink water', undefined, 'local', {
      notificationKey: 'regular_reminder',
    });

    // At 40 minutes later (global gap 30m passed, but same type 60m NOT passed)
    jest.setSystemTime(now + 40 * 60_000);
    const repeatAttempt = await NotificationService.displayNotification('💧 Hydration', 'Drink water again', undefined, 'local', {
      notificationKey: 'regular_reminder',
    });
    expect(repeatAttempt).toBe(false);

    // At 65 minutes later (both gaps passed)
    jest.setSystemTime(now + 65 * 60_000);
    const validAttempt = await NotificationService.displayNotification('💧 Hydration', 'Drink water again', undefined, 'local', {
      notificationKey: 'regular_reminder',
    });
    expect(validAttempt).toBe(true);
  });

  test('allowRepeat bypasses only the same-type gate, not the global gap', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 14, 0, 0).getTime();
    jest.setSystemTime(now);

    expect(await NotificationService.displayNotification('Welcome', 'Hello', undefined, 'local', {
      notificationKey: 'welcome',
    })).toBe(true);

    jest.setSystemTime(now + 10 * 60_000);
    expect(await NotificationService.displayNotification('Welcome', 'Hello again', undefined, 'local', {
      notificationKey: 'welcome', allowRepeat: true,
    })).toBe(false);

    jest.setSystemTime(now + 40 * 60_000);
    expect(await NotificationService.displayNotification('Welcome', 'Hello again', undefined, 'local', {
      notificationKey: 'welcome', allowRepeat: true,
    })).toBe(true);
  });

  test('concurrent delivery attempts admit only one notification', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 1, 14, 0, 0).getTime());

    const results = await Promise.all([
      NotificationService.displayNotification('First', 'One', undefined, 'local', { notificationKey: 'first' }),
      NotificationService.displayNotification('Second', 'Two', undefined, 'local', { notificationKey: 'second' }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test('Deduplication: Refreshed re-posted notification does not reset global delivery timestamp', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 8, 1, 14, 0, 0).getTime();
    jest.setSystemTime(now);

    const eventId = 'ev-unique-123';
    const notif = {
      id: 'notif-123',
      data: { eventId, notificationKey: 'regular_reminder', type: HYDRATION_REMINDER_TYPE },
    } as any;

    await NotificationService.acceptScheduledDelivery(notif);
    expect(await NotificationService.msSinceLastNotification()).toBe(0);

    // 10 minutes later, a refreshed re-post arrives
    jest.setSystemTime(now + 10 * 60_000);
    const refreshedNotif = {
      ...notif,
      data: { ...notif.data, refreshed: '1' },
    };

    await NotificationService.acceptScheduledDelivery(refreshedNotif);
    // msSinceLastNotification should still report 10 minutes (600,000 ms), not 0
    expect(await NotificationService.msSinceLastNotification()).toBe(10 * 60_000);
  });
});

