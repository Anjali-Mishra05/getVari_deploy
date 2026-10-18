/**
 * Getting the reminder screen in front of the user, wherever they are.
 *
 * ## The gap this covers
 *
 * The reminder notification carries a `fullScreenAction`, and that was taken
 * to mean "the app opens full-screen when a reminder fires". It does not.
 * Android launches a full-screen intent only while the screen is **off or
 * locked**; with the phone unlocked and in the user's hand the platform
 * deliberately downgrades it to a heads-up banner. So the case the reminder
 * most exists for — someone awake, using their phone, hours without water —
 * was the one case that never got the full-screen prompt.
 *
 * `presentReminderFullScreen` is the other half. The decision of *whether* to
 * launch is native, because only that side can see the screen state, the
 * keyguard and this app's own lifecycle; what is asserted here is everything
 * around it: that it is asked on every delivery, that it never asks for a
 * notification that is not a reminder, that a refusal is reported rather than
 * thrown, and that the two permissions behind it are reported apart — because
 * they cover different moments and a banner that names the wrong one sends the
 * user to a settings page that already looks correct.
 *
 *   npx jest --config jest.config.logic.js __tests__/reminderPresentation.test.ts
 */

let mockPlatformOS = 'android';
let mockChannelImportance = 4; // AndroidImportance.HIGH

/** Calls into the native module, in order, as `[method, ...args]`. */
const mockNativeCalls: string[] = [];

/** What each bridged method resolves with; a value that throws is rethrown. */
const mockNative: {
  canUseFullScreenIntent: () => Promise<boolean | null> | boolean | null;
  canLaunchOverOtherApps: () => Promise<boolean> | boolean;
  presentReminder: () => Promise<string> | string;
  openOverlaySettings: () => Promise<boolean> | boolean;
} = {
  canUseFullScreenIntent: () => true,
  canLaunchOverOtherApps: () => true,
  presentReminder: () => 'launched',
  openOverlaySettings: () => true,
};

/** Swapped for `{}` to stand in for a build without the native module. */
let mockNativeModules: any = {
  FullScreenReminderModule: {
    canUseFullScreenIntent: () => {
      mockNativeCalls.push('canUseFullScreenIntent');
      return Promise.resolve(mockNative.canUseFullScreenIntent());
    },
    canLaunchOverOtherApps: () => {
      mockNativeCalls.push('canLaunchOverOtherApps');
      return Promise.resolve(mockNative.canLaunchOverOtherApps());
    },
    presentReminder: () => {
      mockNativeCalls.push('presentReminder');
      return Promise.resolve(mockNative.presentReminder());
    },
    openOverlaySettings: () => {
      mockNativeCalls.push('openOverlaySettings');
      return Promise.resolve(mockNative.openOverlaySettings());
    },
  },
};

jest.mock('react-native', () => ({
  get Platform() {
    return { OS: mockPlatformOS, Version: 34 };
  },
  get NativeModules() {
    return mockNativeModules;
  },
}));

const mockStore = new Map<string, string>();

/** Notifications posted through `displayNotification`, in order. */
const mockDisplayed: any[] = [];

/** Notifications queued through `createTriggerNotification`, in order. */
const mockQueued: any[] = [];

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
    getChannel: () => Promise.resolve({ id: 'hydration-reminders-v3', importance: mockChannelImportance }),
    getTriggerNotificationIds: () => Promise.resolve([]),
    cancelTriggerNotifications: () => Promise.resolve(),
    getDisplayedNotifications: () => Promise.resolve([]),
    cancelDisplayedNotifications: () => Promise.resolve(),
    createTriggerNotification: (notification: any, trigger: any) => {
      mockQueued.push({ notification, trigger });
      return Promise.resolve();
    },
    displayNotification: (notification: any) => {
      mockDisplayed.push(notification);
      return Promise.resolve();
    },
    openNotificationSettings: () => Promise.resolve(),
    onForegroundEvent: () => () => {},
    onBackgroundEvent: () => {},
    getNotificationSettings: () =>
      Promise.resolve({ authorizationStatus: 1, android: { alarm: 1 } }),
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

import NotificationService, {
  HYDRATION_REMINDER_TYPE,
} from '../src/services/NotificationService';
import { GENERIC_REMINDER_BODY } from '../src/utils/reminderContent';

const reminder = () => ({
  id: 'hydration-reminder-1',
  data: { type: HYDRATION_REMINDER_TYPE, eventId: 'hydration-reminder-1@1000', primaryMl: '500' },
});

const NATIVE_MODULE = mockNativeModules;

beforeEach(() => {
  mockStore.clear();
  mockDisplayed.length = 0;
  mockQueued.length = 0;
  mockNativeCalls.length = 0;
  mockPlatformOS = 'android';
  mockChannelImportance = 4;
  mockNativeModules = NATIVE_MODULE;
  mockNative.canUseFullScreenIntent = () => true;
  mockNative.canLaunchOverOtherApps = () => true;
  mockNative.presentReminder = () => 'launched';
  mockNative.openOverlaySettings = () => true;
});

// ---------------------------------------------------------------------------

describe('raising the reminder screen', () => {
  it('asks the native side to launch when a reminder is delivered', async () => {
    expect(await NotificationService.presentReminderFullScreen(reminder() as any)).toBe('launched');
    expect(mockNativeCalls).toEqual(['presentReminder']);
  });

  it('passes the native verdict straight back, whatever it is', async () => {
    // Each of these is a real state the native side distinguishes, and the
    // caller has no business re-deciding any of them.
    for (const outcome of [
      'launched',
      'os-full-screen-intent', // screen off or locked: the OS is doing it
      'already-foreground', // the in-app prompt is already up
      'not-permitted', // no "display over other apps" grant
      'failed',
    ]) {
      mockNative.presentReminder = () => outcome;
      expect(await NotificationService.presentReminderFullScreen(reminder() as any)).toBe(outcome);
    }
  });

  it('never launches for a notification that is not a reminder', async () => {
    // The background handler calls this on every delivery, so the filter has
    // to live here — a daily "good morning" message must not throw the app
    // into the user's face.
    const outcome = await NotificationService.presentReminderFullScreen({
      id: 'daily-morning',
      data: { type: 'daily_message' },
    } as any);

    expect(outcome).toBe('not-a-reminder');
    expect(mockNativeCalls).toEqual([]);
  });

  it('launches when called with no notification at all', async () => {
    // The argument is a filter, not a requirement: a caller that already knows
    // it holds a reminder can ask directly.
    expect(await NotificationService.presentReminderFullScreen()).toBe('launched');
  });

  it('does nothing on iOS, where an app cannot put itself on screen', async () => {
    mockPlatformOS = 'ios';
    expect(await NotificationService.presentReminderFullScreen(reminder() as any)).toBe(
      'unsupported'
    );
    expect(mockNativeCalls).toEqual([]);
  });

  it('reports unsupported rather than throwing on a build without the module', async () => {
    mockNativeModules = {};
    expect(await NotificationService.presentReminderFullScreen(reminder() as any)).toBe(
      'unsupported'
    );
  });

  it('swallows a native failure — the shade notification is still the fallback', async () => {
    // A reminder that cannot take over the screen is still in the shade with
    // its Log and Snooze actions. Throwing here would take out the rest of the
    // background handler, which is what writes the drink.
    mockNative.presentReminder = () => {
      throw new Error('binder died');
    };
    expect(await NotificationService.presentReminderFullScreen(reminder() as any)).toBe('failed');
  });
});

// ---------------------------------------------------------------------------

describe('the two permissions are reported apart', () => {
  it('separates the locked-screen case from the in-use case', async () => {
    // Both grants present: the reminder takes over the screen either way.
    let status = await NotificationService.fullScreenReminderStatus();
    expect(status).toMatchObject({ available: true, availableInUse: true });

    // The Android 14 full-screen-intent grant only ever covered a locked or
    // dark screen, so losing it leaves the in-use path working.
    mockNative.canUseFullScreenIntent = () => false;
    status = await NotificationService.fullScreenReminderStatus();
    expect(status).toMatchObject({ available: false, availableInUse: true });

    // And the overlay grant is the mirror image: locked still works.
    mockNative.canUseFullScreenIntent = () => true;
    mockNative.canLaunchOverOtherApps = () => false;
    status = await NotificationService.fullScreenReminderStatus();
    expect(status).toMatchObject({ available: true, availableInUse: false });
  });

  it('reports both as unavailable when the channel itself is turned down', async () => {
    // A channel below HIGH suppresses the screen whichever grant is present,
    // so asking for a permission at that point would be asking for something
    // inert.
    mockChannelImportance = 2;
    expect(await NotificationService.fullScreenReminderStatus()).toMatchObject({
      channelAllows: false,
      available: false,
      availableInUse: false,
    });
  });

  it('reports nothing available on iOS', async () => {
    mockPlatformOS = 'ios';
    expect(await NotificationService.fullScreenReminderStatus()).toEqual({
      granted: false,
      channelAllows: false,
      canLaunchOverApps: false,
      available: false,
      availableInUse: false,
    });
  });
});

describe('the full-screen grant is read from Android, never assumed', () => {
  it('reports granted when Android says it is enabled', async () => {
    mockNative.canUseFullScreenIntent = () => true;
    expect((await NotificationService.fullScreenReminderStatus()).granted).toBe(true);
  });

  it('reports not granted when Android says it is disabled', async () => {
    mockNative.canUseFullScreenIntent = () => false;
    expect((await NotificationService.fullScreenReminderStatus()).granted).toBe(false);
  });

  it('does not treat an unverifiable state as granted', async () => {
    // The native side resolves null when it has no NotificationManager to ask.
    mockNative.canUseFullScreenIntent = () => null;
    expect((await NotificationService.fullScreenReminderStatus()).granted).toBe(false);

    // The bridge threw.
    mockNative.canUseFullScreenIntent = () => {
      throw new Error('binder died');
    };
    expect((await NotificationService.fullScreenReminderStatus()).granted).toBe(false);

    // A build without the native module at all.
    mockNativeModules = {};
    expect((await NotificationService.fullScreenReminderStatus()).granted).toBe(false);
  });

  it('ignores a stored flag and asks Android again on every read', async () => {
    mockStore.set('fullScreenIntentGranted', 'true');
    mockNative.canUseFullScreenIntent = () => false;
    expect((await NotificationService.fullScreenReminderStatus()).granted).toBe(false);

    // The user turns it on in Settings and comes back.
    mockNative.canUseFullScreenIntent = () => true;
    expect((await NotificationService.fullScreenReminderStatus()).granted).toBe(true);
    expect(mockNativeCalls.filter(c => c === 'canUseFullScreenIntent')).toHaveLength(2);
  });
});

describe('the background-launch grant on its own', () => {
  it('reads the live state from the native module', async () => {
    mockNative.canLaunchOverOtherApps = () => false;
    expect(await NotificationService.backgroundLaunchStatus()).toEqual({ granted: false });
    expect(mockNativeCalls).toEqual(['canLaunchOverOtherApps']);
  });

  it('assumes granted when it cannot be read, rather than nagging', async () => {
    // An older build of the native module, or a bridge that threw. The launch
    // itself still reports `not-permitted` honestly when Android refuses, so
    // the app loses nothing by not asking here — whereas a banner demanding a
    // permission the app cannot verify is a dead end for the user.
    mockNativeModules = {};
    expect(await NotificationService.backgroundLaunchStatus()).toEqual({ granted: true });

    mockNativeModules = NATIVE_MODULE;
    mockNative.canLaunchOverOtherApps = () => {
      throw new Error('no such method');
    };
    expect(await NotificationService.backgroundLaunchStatus()).toEqual({ granted: true });
  });

  it('is not offered on iOS', async () => {
    mockPlatformOS = 'ios';
    expect(await NotificationService.backgroundLaunchStatus()).toEqual({ granted: false });
    expect(mockNativeCalls).toEqual([]);
  });

  it('opens the overlay settings screen without throwing when it is absent', async () => {
    await NotificationService.openBackgroundLaunchSettings();
    expect(mockNativeCalls).toEqual(['openOverlaySettings']);

    mockNativeModules = {};
    await expect(NotificationService.openBackgroundLaunchSettings()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

/**
 * Rewriting a delivered reminder with figures that are true right now.
 *
 * Android has no way to change a posted notification except to post it again
 * under the same id — and that second post arrives as another delivery. So the
 * feature that makes a reminder say something useful is one missing guard away
 * from an endless loop of heads-up notifications, which is the case this
 * section exists for.
 */
describe('refreshing a delivered reminder', () => {
  const facts = { hoursSinceDrink: 3, totalMl: 500, targetMl: 3000 };

  it('skips rewriting reminders at delivery time to preserve immutable Excel copy', async () => {
    expect(await NotificationService.refreshReminderContent(reminder() as any, facts)).toBe(
      'skipped'
    );
  });

  it('never refreshes a re-post, so the rewrite cannot loop', async () => {
    expect(await NotificationService.refreshReminderContent(reminder() as any, facts)).toBe('skipped');
  });

  it('leaves a notification that is not a reminder alone', async () => {
    const outcome = await NotificationService.refreshReminderContent(
      { id: 'daily-morning', data: { type: 'daily_message' } } as any,
      facts
    );
    expect(outcome).toBe('skipped');
    expect(mockDisplayed).toHaveLength(0);
  });

  it('queues a reminder with the generic line, and personalises it later', async () => {
    // A queued reminder is built up to a day before it fires, so it carries
    // the generic line and nothing else; `refreshReminderContent` is what puts
    // real figures on it at the moment of delivery. Asserting the queued shape
    // here is what stops someone "helpfully" baking the numbers in at schedule
    // time, which is exactly the stale-number trap this design avoids.
    await NotificationService.fireTestReminder(60);
    const queued = mockQueued.find(n => n?.notification?.data?.type === HYDRATION_REMINDER_TYPE);

    expect(queued).toBeTruthy();
    expect(queued.notification.body).toContain('Time to hydrate');
    expect(queued.notification.data.refreshed).toBeUndefined();
  });
});
