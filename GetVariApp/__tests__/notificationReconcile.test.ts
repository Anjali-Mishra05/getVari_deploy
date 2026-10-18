/**
 * Scheduling across cold start, login, logout/login, profile changes,
 * foregrounding, reinstall and account switches.
 *
 * Real NotificationService / NotificationSync / NotificationHistory /
 * ActiveReminder; Notifee, AsyncStorage and the Supabase profile read mocked.
 *
 *   npx jest --config jest.config.logic.js __tests__/notificationReconcile.test.ts
 */

// Modules are loaded with `require` (see `load`) so a cold start can be
// simulated; this marks the file as a module rather than a global script.
export {};

const mockStore = new Map<string, string>();
const mockOs = new Map<string, { notification: any; trigger: any }>();
let mockTray: Array<{ id: string; notification: any }> = [];
const mockCreated: string[] = [];
const mockCancelled: string[] = [];
/** Today's locked Final Daily Target on the device, or null. */
let mockLockedTarget: number | null = null;
/** While set, queueing a notification waits on it — a slow native call. */
let mockCreateHold: Promise<void> | null = null;
let mockProfileRead: (userId: string) => Promise<{ profile: any; failed: boolean }> = async () => ({
  profile: null,
  failed: true,
});

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
  NativeModules: {},
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
      mockCancelled.push(...ids);
      ids.forEach(id => mockOs.delete(id));
      return Promise.resolve();
    },
    cancelAllNotifications: () => {
      throw new Error('cancelAllNotifications must not be called');
    },
    getDisplayedNotifications: () => Promise.resolve([...mockTray]),
    cancelDisplayedNotifications: (ids: string[]) => {
      mockTray = mockTray.filter(e => !ids.includes(e.id));
      return Promise.resolve();
    },
    createTriggerNotification: async (n: any, t: any) => {
      if (mockCreateHold) await mockCreateHold;
      mockCreated.push(n.id);
      mockOs.set(n.id, { notification: n, trigger: t });
      return n.id;
    },
    displayNotification: () => Promise.resolve(),
    onForegroundEvent: () => () => {},
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

// The Supabase profile read. Mocked whole: the real module pulls in auth.
jest.mock('../src/services/ProfileService', () => ({
  __esModule: true,
  default: { fetchProfileResult: (userId: string) => mockProfileRead(userId) },
}));

// The locked target read. Mocked whole: the real module pulls in Supabase.
jest.mock('../src/services/DailyTargetService', () => ({
  __esModule: true,
  default: { peekTodayTargetMl: () => Promise.resolve(mockLockedTarget) },
}));

const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m, 0, 0).getTime();
const hm = (t: number) => {
  const x = new Date(t);
  return `${String(x.getDate()).padStart(2, '0')} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
};
const ACCOUNT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const ACCOUNT_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const profileOf = (fullName: string, wakeUp: string, sleepStart: string) => ({
  fullName,
  age: 30,
  weightKg: 62,
  sleepSchedule: { wakeUp, sleepStart },
});

/** A fresh JS context, as after a cold start: module state gone, storage and OS kept. */
const load = () => {
  jest.resetModules();
  return {
    NotificationService: require('../src/services/NotificationService').default,
    NotificationHistory: require('../src/services/NotificationHistory').default,
    ActiveReminder: require('../src/services/ActiveReminder').default,
    reconcile: require('../src/services/NotificationSync').reconcileNotificationsWithProfile,
  };
};

/** What is queued: id -> "dd HH:MM key". */
const snapshot = () =>
  new Map([...mockOs.values()].map(q => [q.notification.id, `${hm(q.trigger.timestamp)} ${q.notification.data?.notificationKey}`]));
const timesOf = (key: string, day = 29) =>
  [...mockOs.values()]
    .filter(q => q.notification.data?.notificationKey === key && new Date(q.trigger.timestamp).getDate() === day)
    .map(q => hm(q.trigger.timestamp).slice(3))
    .sort();
const noDuplicateSlots = () => {
  const slots = [...mockOs.values()].map(q => `${q.notification.data?.notificationKey}@${q.trigger.timestamp}`);
  return new Set(slots).size === slots.length;
};
const OWN_PREFIXES = ['hydration-reminder-', 'getvari-daily-', 'getvari-simulated-', 'getvari-shifted-'];

beforeEach(() => {
  jest.useFakeTimers();
  mockStore.clear();
  mockOs.clear();
  mockTray = [];
  mockCreated.length = 0;
  mockCancelled.length = 0;
  mockProfileRead = async () => ({ profile: null, failed: true });
  mockLockedTarget = null;
  mockCreateHold = null;
  jest.setSystemTime(at(29, 6, 0));
});

afterEach(() => jest.useRealTimers());

/** Signs account A in and builds its schedule from its profile (07:00 / 23:00). */
const signInA = async (mods = load()) => {
  mockProfileRead = async () => ({ profile: profileOf('Anjali Mishra', '07:00', '23:00'), failed: false });
  await mods.NotificationService.adoptAccount(ACCOUNT_A);
  await mods.reconcile(ACCOUNT_A, { fullRebuild: true });
  return mods;
};

// ---------------------------------------------------------------------------

test('1. logout keeps the bell history, cancels no scheduled notification and keeps the window', async () => {
  const mods = await signInA();
  await mods.NotificationHistory.recordDelivery({ id: 'x', title: 'Welcome', data: { eventId: 'local:1' } });
  const before = snapshot();
  mockCancelled.length = 0;

  await mods.NotificationService.onSignedOut(ACCOUNT_A);

  expect((await mods.NotificationHistory.list()).map((e: any) => e.id)).toEqual(['local:1']);
  expect(mockCancelled).toEqual([]);
  expect(snapshot()).toEqual(before);
  expect(await mods.NotificationService.getSleepSchedule()).toEqual({ sleepStart: '23:00', wakeUp: '07:00' });
});

test('2. login waits for the latest profile before scheduling anything', async () => {
  const mods = load();
  let release!: (value: { profile: any; failed: boolean }) => void;
  mockProfileRead = () => new Promise(resolve => (release = resolve));

  await mods.NotificationService.adoptAccount(ACCOUNT_A);
  const pending = mods.reconcile(ACCOUNT_A, { fullRebuild: true });
  await Promise.resolve();
  await Promise.resolve();
  expect(mockCreated).toEqual([]); // nothing built from a stale or default window

  release({ profile: profileOf('Anjali Mishra', '07:00', '23:00'), failed: false });
  await pending;
  expect(mockCreated.length).toBeGreaterThan(0);
  expect(timesOf('morning_msg')).toEqual(['07:30']);
});

test('3. login with wakeUp 07:00 / sleepStart 23:00 schedules from those values', async () => {
  await signInA();
  expect(timesOf('morning_msg')).toEqual(['07:30']); // wake + 30 min
  expect(timesOf('night_msg')).toEqual(['22:00']); // bedtime - 1h
  expect(timesOf('regular_reminder')).toEqual(expect.arrayContaining(['09:00', '17:00']));
  // 22:30 is after Good Night (22:00): the silence window holds everything.
  expect(timesOf('regular_reminder')).not.toContain('22:30');
  expect(noDuplicateSlots()).toBe(true);
});

test('4. changing wake/sleep reschedules the affected notifications', async () => {
  const mods = await signInA();
  // A shifted copy made under the old window must not survive the change.
  mockOs.set('getvari-shifted-old', { notification: { id: 'getvari-shifted-old', data: {} }, trigger: { timestamp: at(29, 12) } });

  mockProfileRead = async () => ({ profile: profileOf('Anjali Mishra', '06:30', '22:30'), failed: false });
  await mods.reconcile(ACCOUNT_A, { fullRebuild: false });

  expect(timesOf('morning_msg')).toEqual(['07:00']);
  expect(timesOf('night_msg')).toEqual(['21:30']);
  // 22:30 is now inside the sleep window: that fixed slot is removed.
  expect(timesOf('regular_reminder')).not.toContain('22:30');
  expect(mockOs.has('getvari-shifted-old')).toBe(false);
  expect(noDuplicateSlots()).toBe(true);
});

test('5. foregrounding with an unchanged profile rebuilds and duplicates nothing', async () => {
  const mods = await signInA();
  const before = snapshot();
  mockCreated.length = 0;
  mockCancelled.length = 0;

  expect(mods.NotificationService.isScheduleStale()).toBe(false);
  jest.setSystemTime(at(29, 10));
  await mods.reconcile(ACCOUNT_A, { fullRebuild: mods.NotificationService.isScheduleStale() });

  expect(mockCreated).toEqual([]);
  expect(mockCancelled).toEqual([]);
  expect(snapshot()).toEqual(before);
  // The next day the 7-day queues are due a top-up.
  expect(mods.NotificationService.isScheduleStale(at(30, 9))).toBe(true);
});

test('P3. a cold start with an unchanged window is not treated as a change', async () => {
  await signInA();
  mockOs.set('getvari-shifted-valid', { notification: { id: 'getvari-shifted-valid', data: {} }, trigger: { timestamp: at(29, 12) } });
  mockCancelled.length = 0;

  const coldStart = load(); // in-memory window is undefined again
  const rebuilt = await coldStart.NotificationService.reconcileSchedule({ wakeUp: '07:00', sleepStart: '23:00' }, { fullRebuild: false });

  expect(rebuilt).toBe(false);
  expect(mockCancelled).toEqual([]);
  expect(mockOs.has('getvari-shifted-valid')).toBe(true);
});

test('6. reinstall + login rebuilds the complete schedule from the Supabase profile', async () => {
  // Reinstall: no storage, no alarms. The profile's window happens to equal
  // the app default, which must still count as "nothing stored yet".
  const mods = load();
  mockProfileRead = async () => ({ profile: profileOf('Anjali Mishra', '07:00', '23:00'), failed: false });
  expect(await mods.NotificationService.adoptAccount(ACCOUNT_A)).toBe(false);
  await mods.reconcile(ACCOUNT_A, { fullRebuild: true });

  expect([...mockOs.keys()].filter(id => id.startsWith('hydration-reminder-'))).toHaveLength(12);
  expect(timesOf('morning_msg')).toEqual(['07:30']);
  expect(timesOf('elevated_risk')).toEqual(['11:00', '20:00']);
  expect(timesOf('focus_alert')).toEqual(['10:30', '12:30', '16:00']);
  expect(await mods.NotificationService.getSleepSchedule()).toEqual({ sleepStart: '23:00', wakeUp: '07:00' });
});

test('6b. if the profile cannot be read, the stored window is used, not a default', async () => {
  await signInA();
  // The stored window is 06:30 / 22:30 from an earlier profile.
  mockProfileRead = async () => ({ profile: profileOf('Anjali Mishra', '06:30', '22:30'), failed: false });
  const mods = load();
  await mods.reconcile(ACCOUNT_A, { fullRebuild: false });

  const offline = load();
  mockProfileRead = async () => ({ profile: null, failed: true });
  await offline.reconcile(ACCOUNT_A, { fullRebuild: true });
  expect(timesOf('morning_msg')).toEqual(['07:00']);
});

test('7. a different account signing in replaces the previous account’s schedule and state', async () => {
  const a = await signInA();
  await a.NotificationService.noteIntakeLogged(at(29, 5, 30));
  await a.ActiveReminder.raise('hydration-reminder-a@1', at(29, 5, 45));
  await a.NotificationHistory.recordDelivery({ id: 'a1', title: 'A’s reminder', data: { eventId: 'a1@1' } });
  const aIds = [...mockOs.keys()];
  await a.NotificationService.onSignedOut(); // logout: schedule stays

  // Account B signs in (new JS context after the OTP screen, same device).
  const b = load();
  mockProfileRead = async () => ({ profile: profileOf('Ravi Kumar', '07:00', '23:00'), failed: false });
  expect(await b.NotificationService.adoptAccount(ACCOUNT_B)).toBe(true);

  expect(aIds.filter(id => mockOs.has(id))).toEqual([]); // A's queue gone
  expect(await b.ActiveReminder.current()).toBeNull();
  expect(await b.NotificationService.lastIntakeAt()).toBeNull();
  expect(await b.NotificationHistory.list()).toHaveLength(0);

  await b.reconcile(ACCOUNT_B, { fullRebuild: true });
  const texts = [...mockOs.values()].map(q => String(q.notification.body));
  expect(texts.some(t => t.includes('Ravi'))).toBe(true);
  expect(texts.some(t => t.includes('Anjali'))).toBe(false);
  expect(timesOf('morning_msg')).toEqual(['07:30']);
  expect(noDuplicateSlots()).toBe(true);

  // A signs back in: A's bell history is there again, B's is not in it.
  await b.NotificationHistory.recordDelivery({ id: 'b1', title: 'B’s reminder', data: { eventId: 'b1@1' } });
  await b.NotificationService.onSignedOut(ACCOUNT_B);
  const aAgain = load();
  await aAgain.NotificationService.adoptAccount(ACCOUNT_A);
  expect((await aAgain.NotificationHistory.list()).map((e: any) => e.id)).toEqual(['a1@1']);
});

test('7b. the same account signing back in keeps every valid future notification', async () => {
  const a = await signInA();
  const before = snapshot();
  await a.NotificationService.onSignedOut();

  const again = load();
  mockCancelled.length = 0;
  expect(await again.NotificationService.adoptAccount(ACCOUNT_A)).toBe(false);
  await again.reconcile(ACCOUNT_A, { fullRebuild: true });

  expect(mockCancelled.filter(id => before.has(id))).toEqual([]);
  expect(snapshot()).toEqual(before);
});

test('8. a 2-hour reminder reschedule leaves every other notification type untouched', async () => {
  const mods = await signInA();
  const others = new Map([...snapshot()].filter(([id]) => !id.startsWith('hydration-reminder-')));
  mockCancelled.length = 0;

  jest.setSystemTime(at(29, 10, 15));
  await mods.NotificationService.noteIntakeLogged(at(29, 10, 15));
  await mods.NotificationService.scheduleHydrationReminders();

  expect(mockCancelled.every(id => id.startsWith('hydration-reminder-') || id.startsWith('getvari-shifted-hydration-reminder-'))).toBe(true);
  expect(new Map([...snapshot()].filter(([id]) => !id.startsWith('hydration-reminder-')))).toEqual(others);
  expect(noDuplicateSlots()).toBe(true);
});

test('9. after login, delivered notifications are recorded in the bell as usual', async () => {
  const mods = await signInA();
  jest.setSystemTime(at(29, 7, 30));
  const gm = JSON.parse(JSON.stringify(mockOs.get('getvari-daily-morning-20260929')!.notification));
  mockTray.push({ id: gm.id, notification: gm });
  expect(await mods.NotificationService.handleBackgroundDelivery(gm)).toBe(true);
  expect((await mods.NotificationHistory.list()).map((r: any) => r.title)).toEqual(['🌅 Good Morning']);
});

test('10. reconciliation cancels only its own notification ids', async () => {
  const mods = await signInA();
  // Not ours, and not the reconciler's to touch: another app-level trigger and
  // an outstanding snooze nudge.
  mockOs.set('some-other-feature', { notification: { id: 'some-other-feature', data: {} }, trigger: { timestamp: at(29, 13) } });
  mockOs.set('hydration-snooze-nudge', { notification: { id: 'hydration-snooze-nudge', data: {} }, trigger: { timestamp: at(29, 13) } });
  mockCancelled.length = 0;

  mockProfileRead = async () => ({ profile: profileOf('Anjali Mishra', '06:30', '22:30'), failed: false });
  await mods.reconcile(ACCOUNT_A, { fullRebuild: false });

  expect(mockCancelled.length).toBeGreaterThan(0);
  expect(mockCancelled.every(id => OWN_PREFIXES.some(p => id.startsWith(p)))).toBe(true);
  expect(mockOs.has('some-other-feature')).toBe(true);
  expect(mockOs.has('hydration-snooze-nudge')).toBe(true);
});

// ---------------------------------------------------------------------------
// Daily Water Requirement: queued with the schedule, not after the dashboard
// ---------------------------------------------------------------------------

const WATER_TODAY = 'getvari-daily-water-20260929';
const waterIds = () => [...mockOs.keys()].filter(id => id.startsWith('getvari-daily-water-')).sort();
const waterBody = (id = WATER_TODAY) => String(mockOs.get(id)?.notification.body ?? '');
/** A profile as `fetchProfileResult` returns it: with the baseline target. */
const profileWithTarget = (targetDailyMl: number, extra: object = {}) => ({
  ...profileOf('Anjali Mishra', '07:00', '23:00'),
  targetDailyMl,
  ...extra,
});

test('11. the first reconcile queues the Daily Water Requirement at wake + 1h from the profile baseline', async () => {
  const mods = load();
  mockProfileRead = async () => ({ profile: profileWithTarget(2800), failed: false });
  await mods.NotificationService.adoptAccount(ACCOUNT_A);
  await mods.reconcile(ACCOUNT_A, { fullRebuild: true });

  // No dashboard, no PBWR calculation: the profile read alone is enough.
  expect(timesOf('morning_msg')).toEqual(['07:30']);
  expect(timesOf('daily_water_requirement')).toEqual(['08:00']);
  expect(waterBody()).toContain('2.8 L (approximately 11 glasses');
  expect(waterIds()).toHaveLength(7);
});

test('12. the final target replaces the baseline in place, in every entry still ahead', async () => {
  const mods = load();
  mockProfileRead = async () => ({ profile: profileWithTarget(2800), failed: false });
  await mods.reconcile(ACCOUNT_A, { fullRebuild: true });
  const ids = waterIds();

  expect(await mods.NotificationService.setDailyWaterTarget(3250)).toBe(true);

  expect(waterIds()).toEqual(ids);
  expect(ids.every(id => waterBody(id).includes('3.25 L (approximately 13 glasses'))).toBe(true);
  expect(timesOf('daily_water_requirement')).toEqual(['08:00']);
  expect(noDuplicateSlots()).toBe(true);
});

test('13. a final target that lands after the time has passed is not sent retroactively', async () => {
  const mods = load();
  mockProfileRead = async () => ({ profile: profileWithTarget(2800), failed: false });
  await mods.reconcile(ACCOUNT_A, { fullRebuild: true });

  // 08:00 has fired and left the queue; the calculation finishes at 08:30.
  jest.setSystemTime(at(29, 8, 30));
  mockOs.delete(WATER_TODAY);
  await mods.NotificationService.setDailyWaterTarget(3250);

  expect(mockOs.has(WATER_TODAY)).toBe(false);
  expect(waterBody('getvari-daily-water-20260930')).toContain('3.25 L (approximately 13 glasses');
});

test('14. the baseline is a fallback only: it never replaces a target already cached', async () => {
  const mods = load();
  mockProfileRead = async () => ({ profile: profileWithTarget(2800), failed: false });
  await mods.reconcile(ACCOUNT_A, { fullRebuild: true });
  await mods.NotificationService.setDailyWaterTarget(3250);
  mockCreated.length = 0;

  // Reopened: the profile read still carries the baseline.
  const reopened = load();
  await reopened.reconcile(ACCOUNT_A, { fullRebuild: false });

  expect(mockCreated).toEqual([]);
  expect(waterBody()).toContain('3.25 L (approximately 13 glasses');
});

test('15. the final target for today, locked on the device or stored on the profile, is used over the baseline', async () => {
  const mods = load();
  mockProfileRead = async () => ({
    profile: profileWithTarget(2800, { dailyTarget: { date: '2026-09-29', finalTargetMl: 3100 } }),
    failed: false,
  });
  await mods.reconcile(ACCOUNT_A, { fullRebuild: true });
  expect(waterBody()).toContain('3.1 L (approximately 12 glasses');

  // A locked figure differing from what is queued rebuilds without being asked.
  mockLockedTarget = 3400;
  await mods.reconcile(ACCOUNT_A, { fullRebuild: false });
  expect(waterBody()).toContain('3.4 L (approximately 14 glasses');
  expect(noDuplicateSlots()).toBe(true);
});

test('16. an offline reopen keeps the Daily Water Requirement queued from the cached target', async () => {
  const mods = load();
  mockProfileRead = async () => ({ profile: profileWithTarget(2800), failed: false });
  await mods.reconcile(ACCOUNT_A, { fullRebuild: true });

  const offline = load();
  mockProfileRead = async () => ({ profile: null, failed: true });
  await offline.reconcile(ACCOUNT_A, { fullRebuild: true });

  expect(timesOf('daily_water_requirement')).toEqual(['08:00']);
  expect(waterBody()).toContain('2.8 L (approximately 11 glasses');
});

test('17. a different account gets its own figure, never the previous one', async () => {
  const a = load();
  mockProfileRead = async () => ({ profile: profileWithTarget(2800), failed: false });
  await a.NotificationService.adoptAccount(ACCOUNT_A);
  await a.reconcile(ACCOUNT_A, { fullRebuild: true });
  await a.NotificationService.setDailyWaterTarget(3250);

  const b = load();
  mockProfileRead = async () => ({
    profile: { ...profileOf('Ravi Kumar', '07:00', '23:00'), targetDailyMl: 2400 },
    failed: false,
  });
  expect(await b.NotificationService.adoptAccount(ACCOUNT_B)).toBe(true);
  await b.reconcile(ACCOUNT_B, { fullRebuild: true });

  expect(timesOf('daily_water_requirement')).toEqual(['08:00']);
  expect(waterBody()).toContain('2.4 L (approximately 10 glasses');
});

test('18. a rebuild that outlived its timeout cannot cancel what a newer rebuild queued', async () => {
  const mods = load();
  await mods.NotificationService.setSleepSchedule({ wakeUp: '07:00', sleepStart: '23:00' });
  mockOs.clear();

  // The first daily rebuild starts with no target and stalls in native code.
  let release!: () => void;
  mockCreateHold = new Promise<void>(resolve => (release = resolve));
  const slow = mods.NotificationService.scheduleDailyNotifications();
  await jest.advanceTimersByTimeAsync(21_000); // past RESCHEDULE_TIMEOUT_MS
  await slow;

  // The target arrives; its rebuild runs to completion with the water message.
  mockCreateHold = null;
  await mods.NotificationService.setDailyWaterTarget(3250);
  expect(mockOs.has(WATER_TODAY)).toBe(true);

  // Only now does the stalled rebuild get to continue.
  mockCancelled.length = 0;
  release();
  await jest.advanceTimersByTimeAsync(0);

  expect(mockCancelled).toEqual([]);
  expect(waterBody()).toContain('3.25 L (approximately 13 glasses');
});
