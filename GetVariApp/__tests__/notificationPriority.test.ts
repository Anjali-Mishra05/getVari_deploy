/**
 * Priority between notifications, through the real `NotificationService`
 * with Notifee mocked.
 *
 * - Sleep / silence window beats everything: from Good Night until the next
 *   Good Morning nothing of any type is delivered; Good Morning is the first
 *   notification after it.
 * - Dynamic (Good Morning, Good Night, live alerts) is delivered at its own
 *   time, however recently anything else went out.
 * - Fixed (the simulation slots) is delivered at its exact time; a Dynamic
 *   notification before or after it never suppresses, moves or delays it.
 * - 2-hour Hydration yields to both: moved to the next allowed time. The
 *   30-minute gap applies only to it — there is no global gap.
 * - Nothing already delivered is ever withdrawn.
 *
 *   npx jest --config jest.config.logic.js __tests__/notificationPriority.test.ts
 */

const mockStore = new Map<string, string>();
const mockOsQueue = new Map<string, any>();
const mockShown: any[] = [];

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
      ids.forEach(id => mockOsQueue.delete(id));
      return Promise.resolve();
    },
    getDisplayedNotifications: () => Promise.resolve([]),
    cancelDisplayedNotifications: () => Promise.resolve(),
    createTriggerNotification: (notification: any, trigger: any) => {
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

import { NOTIFICATION_SIMULATION } from '../src/config/edgeCaseConfig';
import NotificationService, {
  HYDRATION_REMINDER_TYPE,
  SHIFTED_ID_PREFIX,
  calculateDailySimulatedSchedule,
  categoryOf,
  isInSilenceWindow,
  nextActiveAt,
} from '../src/services/NotificationService';

const MIN = 60_000;
const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m, 0, 0).getTime();
const clock = (t: number) => {
  const x = new Date(t);
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
};

/** Good Night 22:30, Good Morning 08:00. */
const SLEEP_2330 = { wakeUp: '07:00', sleepStart: '23:30' };

// Each call is a distinct notification: processed event ids live for the
// whole process, so reuse across tests would leak state.
let seq = 0;
const make = (key: string, ts: number, data: Record<string, string> = {}) => {
  const id = `prio-${key}-${++seq}`;
  return { id, title: key, body: key, data: { notificationKey: key, eventId: `${id}@${ts}`, ...data } } as any;
};
const fixed = (key: string, ts: number) => make(key, ts, { source: 'simulation' });
const hydration = (ts: number) =>
  make('regular_reminder', ts, { type: HYDRATION_REMINDER_TYPE, source: 'actual' });
const dynamic = (key: string, ts: number) => make(key, ts, { source: 'actual' });

/** A dynamic notification queued with the OS (e.g. one shifted earlier). */
const queueDynamic = (key: string, ts: number) => {
  const n = dynamic(key, ts);
  mockOsQueue.set(n.id, { notification: n, trigger: { type: 0, timestamp: ts } });
  return n;
};
const accept = (n: any) => NotificationService.acceptScheduledDelivery(n);
const shiftedTimes = () =>
  [...mockOsQueue.values()]
    .filter(q => q.notification.id.startsWith(SHIFTED_ID_PREFIX))
    .map(q => q.trigger.timestamp as number);

beforeEach(async () => {
  jest.useFakeTimers();
  mockStore.clear();
  mockOsQueue.clear();
  mockShown.length = 0;
  NOTIFICATION_SIMULATION.ENABLED = true;
  NOTIFICATION_SIMULATION.CHECK_FIXED_SLOT_CONDITIONS = false;
  NotificationService.markAppOpened(0);
  await NotificationService.clearSleepSchedule();
});

afterEach(() => jest.useRealTimers());

// ---------------------------------------------------------------------------

describe('categories', () => {
  test('fixed slots, 2-hour reminders and everything else', () => {
    expect(categoryOf('regular_reminder', 'simulation')).toBe('fixed');
    expect(categoryOf('elevated_risk', 'simulation')).toBe('fixed');
    expect(categoryOf('regular_reminder', 'actual')).toBe('hydration');
    expect(categoryOf('morning_msg', 'actual')).toBe('dynamic');
    expect(categoryOf('night_msg', 'actual')).toBe('dynamic');
    expect(categoryOf('high_humidity', 'event')).toBe('dynamic');
  });

  test('the silence window runs from Good Night to the next Good Morning', () => {
    expect(isInSilenceWindow(SLEEP_2330, at(1, 22, 29))).toBe(false);
    expect(isInSilenceWindow(SLEEP_2330, at(1, 22, 30))).toBe(true);
    expect(isInSilenceWindow(SLEEP_2330, at(2, 7, 29))).toBe(true); // awake, before GM
    expect(isInSilenceWindow(SLEEP_2330, at(2, 7, 30))).toBe(false);
    expect(nextActiveAt(SLEEP_2330, at(1, 23, 0))).toBe(at(2, 7, 30));
    expect(nextActiveAt(SLEEP_2330, at(1, 14, 0))).toBe(at(1, 14, 0));
  });
});

describe('A. Good Night 22:30 and fixed Hydration Reminder 22:30 (bedtime 23:30)', () => {
  test('only Good Night is delivered — Good Night first', async () => {
    await NotificationService.setSleepSchedule(SLEEP_2330);
    jest.setSystemTime(at(1, 22, 30));
    expect(await accept(dynamic('night_msg', at(1, 22, 30)))).toBe(true);
    expect(await accept(fixed('regular_reminder', at(1, 22, 30)))).toBe(false);
    expect(shiftedTimes()).toEqual([]);
  });

  test('only Good Night is delivered — fixed reminder first', async () => {
    await NotificationService.setSleepSchedule(SLEEP_2330);
    jest.setSystemTime(at(1, 22, 30));
    expect(await accept(fixed('regular_reminder', at(1, 22, 30)))).toBe(false);
    expect(await accept(dynamic('night_msg', at(1, 22, 30)))).toBe(true);
    expect(shiftedTimes()).toEqual([]);
  });

  test('the fixed 22:30 slot is not even queued; Good Night is', async () => {
    await NotificationService.setSleepSchedule(SLEEP_2330);
    expect(calculateDailySimulatedSchedule(SLEEP_2330, new Date(2026, 8, 1)).map(s => clock(s.timestamp))).not.toContain('22:30');
    jest.setSystemTime(at(1, 6));
    await NotificationService.scheduleSimulatedNotifications(at(1, 6));
    await NotificationService.scheduleDailyNotifications(at(1, 6));
    const at2230 = [...mockOsQueue.values()]
      .filter(q => q.trigger.timestamp === at(1, 22, 30))
      .map(q => q.notification.data.notificationKey);
    expect(at2230).toEqual(['night_msg']);
  });
});

describe('B. Good Night 22:30 and a fixed notification at 22:45', () => {
  test('Good Night is kept; the fixed one after it is in the silence window: suppressed, not moved', async () => {
    await NotificationService.setSleepSchedule(SLEEP_2330);
    jest.setSystemTime(at(1, 22, 30));
    expect(await accept(dynamic('night_msg', at(1, 22, 30)))).toBe(true);
    jest.setSystemTime(at(1, 22, 45));
    expect(await accept(fixed('focus_alert', at(1, 22, 45)))).toBe(false);
    expect(shiftedTimes()).toEqual([]);
  });

  test('a fixed slot 29 minutes BEFORE Good Night: both delivered at their times', async () => {
    // Bedtime 23:59: Good Night 22:59, fixed Hydration Reminder 22:30.
    await NotificationService.setSleepSchedule({ wakeUp: '07:00', sleepStart: '23:59' });
    jest.setSystemTime(at(1, 22, 30));
    expect(await accept(fixed('regular_reminder', at(1, 22, 30)))).toBe(true);
    jest.setSystemTime(at(1, 22, 59));
    expect(await accept(dynamic('night_msg', at(1, 22, 59)))).toBe(true);
  });
});

describe('C. exactly 30 minutes apart is allowed', () => {
  test('dynamic then fixed 30 minutes later: both', async () => {
    jest.setSystemTime(at(1, 16, 30));
    expect(await accept(dynamic('high_humidity', at(1, 16, 30)))).toBe(true);
    jest.setSystemTime(at(1, 17, 0));
    expect(await accept(fixed('regular_reminder', at(1, 17, 0)))).toBe(true);
  });

  test('a fixed slot exactly 30 minutes before Good Night: both', async () => {
    // Default bedtime 23:00: Good Night 22:00.
    jest.setSystemTime(at(1, 21, 30));
    expect(await accept(fixed('focus_alert', at(1, 21, 30)))).toBe(true);
    jest.setSystemTime(at(1, 22, 0));
    expect(await accept(dynamic('night_msg', at(1, 22, 0)))).toBe(true);
  });

  test('dynamic then 2-hour Hydration 30 minutes later: both', async () => {
    jest.setSystemTime(at(1, 13, 0));
    expect(await accept(dynamic('high_humidity', at(1, 13, 0)))).toBe(true);
    jest.setSystemTime(at(1, 13, 30));
    expect(await accept(hydration(at(1, 13, 30)))).toBe(true);
  });

  test('29 minutes: a fixed one is still delivered (the gap is not global)', async () => {
    jest.setSystemTime(at(1, 16, 31));
    expect(await accept(dynamic('high_humidity', at(1, 16, 31)))).toBe(true);
    jest.setSystemTime(at(1, 17, 0));
    expect(await accept(fixed('regular_reminder', at(1, 17, 0)))).toBe(true);
  });

  test('29 minutes: a 2-hour reminder is moved', async () => {
    jest.setSystemTime(at(1, 13, 1));
    expect(await accept(dynamic('high_humidity', at(1, 13, 1)))).toBe(true);
    jest.setSystemTime(at(1, 13, 30));
    expect(await accept(hydration(at(1, 13, 30)))).toBe(false);
    expect(shiftedTimes()).toEqual([at(1, 13, 31)]);
  });
});

describe('D. Dynamic vs 2-hour Hydration at the same time', () => {
  test('dynamic processed first: dynamic delivered, Hydration moved at least 30 minutes on', async () => {
    jest.setSystemTime(at(1, 14, 0));
    expect(await accept(dynamic('high_humidity', at(1, 14, 0)))).toBe(true);
    expect(await accept(hydration(at(1, 14, 0)))).toBe(false);
    const [moved] = shiftedTimes();
    expect(moved).toBeGreaterThanOrEqual(at(1, 14, 30));
    // Clear of the fixed 14:30 slot too.
    expect(clock(moved)).toBe('15:00');
  });

  test('Hydration processed first: it yields to the queued dynamic one, which is delivered at its time', async () => {
    jest.setSystemTime(at(1, 14, 0));
    const dyn = queueDynamic('high_humidity', at(1, 14, 0));
    expect(await accept(hydration(at(1, 14, 0)))).toBe(false);
    mockOsQueue.delete(dyn.id); // the OS fires it
    expect(await accept(dyn)).toBe(true);
    const [moved] = shiftedTimes();
    expect(moved).toBeGreaterThanOrEqual(at(1, 14, 30));
  });

  test('a live dynamic alert is not held back by a Hydration Reminder just delivered', async () => {
    jest.setSystemTime(at(1, 14, 0));
    expect(await accept(hydration(at(1, 14, 0)))).toBe(true);
    expect(
      await NotificationService.displayNotification('Humidity', 'b', undefined, 'local', {
        notificationKey: 'high_humidity',
        source: 'event',
      })
    ).toBe(true);
    expect(await NotificationService.msSinceLastDynamicNotification()).toBe(0);
  });
});

describe('E. Fixed vs 2-hour Hydration at the same time', () => {
  test.each([
    ['fixed first', true],
    ['Hydration first', false],
  ])('%s: fixed delivered at its time, Hydration moved', async (_label, fixedFirst) => {
    jest.setSystemTime(at(1, 12, 30));
    const f = fixed('focus_alert', at(1, 12, 30));
    const h = hydration(at(1, 12, 30));
    if (fixedFirst) {
      expect(await accept(f)).toBe(true);
      expect(await accept(h)).toBe(false);
    } else {
      expect(await accept(h)).toBe(false);
      expect(await accept(f)).toBe(true);
    }
    const [moved] = shiftedTimes();
    expect(moved).toBeGreaterThanOrEqual(at(1, 13, 0));
  });
});

describe('F / H. Dynamic, Fixed and Hydration at the same time, in every processing order', () => {
  const orders: Array<Array<'dynamic' | 'fixed' | 'hydration'>> = [
    ['dynamic', 'fixed', 'hydration'],
    ['dynamic', 'hydration', 'fixed'],
    ['fixed', 'dynamic', 'hydration'],
    ['fixed', 'hydration', 'dynamic'],
    ['hydration', 'dynamic', 'fixed'],
    ['hydration', 'fixed', 'dynamic'],
  ];

  test.each(orders.map(o => [o.join(' → '), o]))('%s: dynamic and fixed are delivered, hydration moves', async (_label, order) => {
    jest.setSystemTime(at(1, 14, 30));
    const dyn = queueDynamic('high_humidity', at(1, 14, 30));
    const items = {
      dynamic: () => {
        mockOsQueue.delete(dyn.id); // the OS fires it
        return dyn;
      },
      fixed: () => fixed('priority_alert', at(1, 14, 30)),
      hydration: () => hydration(at(1, 14, 30)),
    };
    const delivered: string[] = [];
    for (const kind of order as Array<keyof typeof items>) {
      if (await accept(items[kind]())) delivered.push(kind);
    }
    expect(delivered.sort()).toEqual(['dynamic', 'fixed']);
    // Hydration is moved (not lost), clear of both by 30 minutes; the fixed
    // one keeps its exact time.
    const shifted = [...mockOsQueue.values()].filter(q => q.notification.id.startsWith(SHIFTED_ID_PREFIX));
    expect(shifted.map(q => q.notification.data.notificationKey)).toEqual(['regular_reminder']);
    expect(shifted[0].trigger.timestamp).toBeGreaterThanOrEqual(at(1, 15, 0));
  });

  test('without a dynamic one, fixed wins over Hydration in either order', async () => {
    jest.setSystemTime(at(1, 18, 30));
    expect(await accept(hydration(at(1, 18, 30)))).toBe(false);
    expect(await accept(fixed('priority_alert', at(1, 18, 30)))).toBe(true);
  });
});

describe('Corrected rule: no global 30-minute gap; Dynamic and Fixed both at their own times', () => {
  const live = (key: string) =>
    NotificationService.displayNotification(key, 'b', undefined, 'local', { notificationKey: key, source: 'event' });

  test('9:40 Dynamic → delivered; 10:00 Fixed → also delivered exactly at 10:00', async () => {
    jest.setSystemTime(at(1, 9, 40));
    expect(await live('high_humidity')).toBe(true);
    jest.setSystemTime(at(1, 10, 0));
    expect(await accept(fixed('focus_alert', at(1, 10, 0)))).toBe(true);
    expect(shiftedTimes()).toEqual([]);
  });

  test('a Dynamic after a Fixed that already went out: both stay delivered, nothing withdrawn', async () => {
    const cancelled: string[] = [];
    const notifee = require('@notifee/react-native').default;
    const spy = jest.spyOn(notifee, 'cancelDisplayedNotifications').mockImplementation((ids: any) => {
      cancelled.push(...ids);
      return Promise.resolve();
    });
    jest.setSystemTime(at(1, 12, 30));
    expect(await accept(fixed('focus_alert', at(1, 12, 30)))).toBe(true);
    jest.setSystemTime(at(1, 12, 40));
    expect(await live('high_temp')).toBe(true);
    expect(cancelled).toEqual([]);
    spy.mockRestore();
  });

  test('9:40 Dynamic → delivered; 10:00 2-hour Hydration → moved forward', async () => {
    jest.setSystemTime(at(1, 9, 40));
    expect(await live('high_humidity')).toBe(true);
    jest.setSystemTime(at(1, 10, 0));
    expect(await accept(hydration(at(1, 10, 0)))).toBe(false);
    const [moved] = shiftedTimes();
    expect(moved).toBeGreaterThanOrEqual(at(1, 10, 10));
  });

  test('a Dynamic after a 2-hour Hydration that already went out: Dynamic delivers, Hydration not withdrawn', async () => {
    const cancelled: string[] = [];
    const notifee = require('@notifee/react-native').default;
    const spy = jest.spyOn(notifee, 'cancelDisplayedNotifications').mockImplementation((ids: any) => {
      cancelled.push(...ids);
      return Promise.resolve();
    });
    jest.setSystemTime(at(1, 13, 30));
    expect(await accept(hydration(at(1, 13, 30)))).toBe(true);
    jest.setSystemTime(at(1, 13, 35));
    expect(await live('goal_achieved')).toBe(true);
    expect(cancelled).toEqual([]);
    spy.mockRestore();
  });

  test('sleep 23:00 → Good Night 22:00 is delivered on time after a Dynamic at 21:40', async () => {
    await NotificationService.setSleepSchedule({ wakeUp: '07:00', sleepStart: '23:00' });
    jest.setSystemTime(at(1, 21, 40));
    expect(await live('high_humidity')).toBe(true);
    jest.setSystemTime(at(1, 22, 0));
    expect(await accept(dynamic('night_msg', at(1, 22, 0)))).toBe(true);
    expect(shiftedTimes()).toEqual([]);
  });

  test('every Dynamic type is delivered minutes after another Dynamic', async () => {
    const keys = ['welcome', 'high_temp', 'high_humidity', 'low_intake_12pm', 'goal_achieved'];
    for (let i = 0; i < keys.length; i++) {
      jest.setSystemTime(at(1, 15, i * 5));
      expect(await live(keys[i])).toBe(true);
    }
  });

  test('the Good Night → Good Morning silence still holds every type', async () => {
    await NotificationService.setSleepSchedule({ wakeUp: '07:00', sleepStart: '23:00' });
    jest.setSystemTime(at(1, 22, 0));
    expect(await accept(dynamic('night_msg', at(1, 22, 0)))).toBe(true);
    jest.setSystemTime(at(1, 22, 10));
    expect(await live('high_humidity')).toBe(false);
    jest.setSystemTime(at(1, 22, 30));
    expect(await accept(fixed('regular_reminder', at(1, 22, 30)))).toBe(false);
    jest.setSystemTime(at(1, 22, 40));
    expect(await accept(hydration(at(1, 22, 40)))).toBe(false);
    for (const t of shiftedTimes()) expect(t).toBeGreaterThanOrEqual(at(2, 8, 30));
  });
});

describe('Welcome is the only notification that bypasses the sleep window', () => {
  const SLEEP_2300 = { wakeUp: '07:00', sleepStart: '23:00' };
  const welcomesShown = () => mockShown.filter(n => n.data?.notificationKey === 'welcome');

  test('login at 06:30 inside a 23:00–07:00 sleep window: Welcome is delivered immediately', async () => {
    await NotificationService.setSleepSchedule(SLEEP_2300);
    jest.setSystemTime(at(2, 6, 30));
    NotificationService.markAppOpened(at(2, 6, 30)); // the 5-minute quiet period is running
    await NotificationService.queueWelcomeNotification();
    await NotificationService.showPendingWelcome();
    expect(welcomesShown()).toHaveLength(1);
  });

  test('delivered once per login: opening the dashboard again shows nothing more', async () => {
    await NotificationService.setSleepSchedule(SLEEP_2300);
    jest.setSystemTime(at(2, 6, 30));
    await NotificationService.queueWelcomeNotification();
    await NotificationService.showPendingWelcome();
    jest.setSystemTime(at(2, 6, 32));
    await NotificationService.showPendingWelcome();
    expect(welcomesShown()).toHaveLength(1);
    // A new login owes a new one.
    await NotificationService.queueWelcomeNotification();
    await NotificationService.showPendingWelcome();
    expect(welcomesShown()).toHaveLength(2);
  });

  test('also at 01:00 and in the evening silence window (after Good Night)', async () => {
    await NotificationService.setSleepSchedule(SLEEP_2300);
    for (const t of [at(2, 1, 0), at(1, 22, 30)]) {
      jest.setSystemTime(t);
      await NotificationService.queueWelcomeNotification();
      await NotificationService.showPendingWelcome();
    }
    expect(welcomesShown()).toHaveLength(2);
  });

  test('not held by the 30-minute gap after another notification', async () => {
    jest.setSystemTime(at(1, 14, 0));
    await NotificationService.displayNotification('Humidity', 'b', undefined, 'local', {
      notificationKey: 'high_humidity',
      source: 'event',
    });
    jest.setSystemTime(at(1, 14, 1));
    await NotificationService.queueWelcomeNotification();
    await NotificationService.showPendingWelcome();
    expect(welcomesShown()).toHaveLength(1);
  });

  test('a deferred Welcome that fires in the sleep window is accepted by the delivery gate', async () => {
    await NotificationService.setSleepSchedule(SLEEP_2300);
    jest.setSystemTime(at(2, 2, 0));
    expect(await accept(make('welcome', at(2, 2, 0), { source: 'event' }))).toBe(true);
  });

  test('at 06:30 every other notification still respects the sleep window', async () => {
    await NotificationService.setSleepSchedule(SLEEP_2300);
    jest.setSystemTime(at(2, 6, 30));
    for (const key of ['high_temp', 'high_humidity', 'low_intake_12pm', 'goal_achieved', 'elevated_risk', 'focus_alert', 'priority_alert']) {
      expect(
        await NotificationService.displayNotification(key, 'b', undefined, 'local', { notificationKey: key, source: 'event' })
      ).toBe(false);
    }
    expect(await accept(dynamic('morning_msg', at(2, 6, 30)))).toBe(false);
    expect(await accept(dynamic('night_msg', at(2, 6, 30)))).toBe(false);
    expect(await accept(fixed('regular_reminder', at(2, 6, 30)))).toBe(false);
    expect(await accept(fixed('elevated_risk', at(2, 6, 30)))).toBe(false);
    expect(await accept(hydration(at(2, 6, 30)))).toBe(false);
    expect(await accept(dynamic('high_humidity', at(2, 6, 30)))).toBe(false);
    expect(mockShown).toHaveLength(0);
  });
});

describe('G. bedtime 23:30: nothing between Good Night (22:30) and Good Morning (07:30)', () => {
  const quiet = [at(1, 22, 30), at(1, 23, 0), at(1, 23, 30), at(1, 23, 45), at(2, 0, 30), at(2, 7, 15)];

  test.each(quiet.map(t => [clock(t), t]))('%s: no Hydration, fixed or dynamic notification', async (_c, t) => {
    await NotificationService.setSleepSchedule(SLEEP_2330);
    jest.setSystemTime(t);
    expect(await accept(hydration(t))).toBe(false);
    expect(await accept(fixed('regular_reminder', t))).toBe(false);
    expect(await accept(dynamic('high_humidity', t))).toBe(false);
    expect(
      await NotificationService.displayNotification('Humidity', 'b', undefined, 'local', {
        notificationKey: 'high_humidity',
        source: 'event',
      })
    ).toBe(false);
    expect(mockShown).toHaveLength(0);
    // The 2-hour reminder is moved to after Good Morning, not lost.
    for (const moved of shiftedTimes()) {
      expect(moved).toBeGreaterThanOrEqual(at(2, 8, 30));
      expect(isInSilenceWindow(SLEEP_2330, moved)).toBe(false);
    }
  });

  test('Good Morning at 07:30 is the first notification after the silence', async () => {
    await NotificationService.setSleepSchedule(SLEEP_2330);
    jest.setSystemTime(at(2, 7, 30));
    expect(await accept(dynamic('morning_msg', at(2, 7, 30)))).toBe(true);
  });

  test('Daily Water Requirement at 08:00 follows it, half an hour later', async () => {
    await NotificationService.setSleepSchedule(SLEEP_2330);
    jest.setSystemTime(at(2, 7, 30));
    expect(await accept(dynamic('morning_msg', at(2, 7, 30)))).toBe(true);
    jest.setSystemTime(at(2, 8, 0));
    expect(await accept(dynamic('daily_water_requirement', at(2, 8, 0)))).toBe(true);
  });

  test('the queued day has nothing after Good Night until Good Morning', async () => {
    await NotificationService.setSleepSchedule(SLEEP_2330);
    jest.setSystemTime(at(1, 6));
    await NotificationService.scheduleSimulatedNotifications(at(1, 6));
    await NotificationService.scheduleDailyNotifications(at(1, 6));
    await NotificationService.scheduleHydrationReminders(at(1, 6));

    const overnight = [...mockOsQueue.values()]
      .filter(q => q.trigger.timestamp >= at(1, 22, 30) && q.trigger.timestamp <= at(2, 8, 0))
      .sort((a, b) => a.trigger.timestamp - b.trigger.timestamp)
      .map(q => `${clock(q.trigger.timestamp)} ${q.notification.data.notificationKey}`);
    expect(overnight).toEqual(['22:30 night_msg', '07:30 morning_msg']);

    // The next 2-hour reminder is after Good Morning.
    const nextReminder = [...mockOsQueue.values()]
      .filter(q => q.notification.data.notificationKey === 'regular_reminder' && q.trigger.timestamp > at(1, 22, 30))
      .map(q => q.trigger.timestamp as number)
      .sort((a, b) => a - b)[0];
    expect(nextReminder).toBeGreaterThanOrEqual(at(2, 8, 30));
  });
});
