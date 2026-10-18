/**
 * Permissions are asked for only when Android says they are missing, and only
 * when the user acts. Nothing is remembered: the system state decides.
 *
 *   npx jest --config jest.config.logic.js __tests__/permissionFlow.test.ts
 */

var mockAuthorization = 0; // 0 denied, 1 authorized
var mockDialogs = 0;
var mockDialogGrants = false;

jest.mock('react-native', () => ({ Platform: { OS: 'android', Version: 34 }, NativeModules: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    getNotificationSettings: async () => ({ authorizationStatus: mockAuthorization }),
    requestPermission: async () => {
      mockDialogs++;
      if (mockDialogGrants) mockAuthorization = 1;
      return { authorizationStatus: mockAuthorization };
    },
    openNotificationSettings: async () => {},
    onForegroundEvent: () => () => {},
    onBackgroundEvent: () => {},
  },
  AlarmType: { SET_ALARM_CLOCK: 1, SET_EXACT_AND_ALLOW_WHILE_IDLE: 0 },
  AndroidCategory: {}, AndroidImportance: { DEFAULT: 3, HIGH: 4 }, AndroidStyle: {},
  AndroidNotificationSetting: {}, AndroidVisibility: {},
  AuthorizationStatus: { DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 },
  EventType: {}, TriggerType: { TIMESTAMP: 0 },
}));
jest.mock('@react-native-firebase/messaging', () => ({ getMessaging: () => ({}), onMessage: () => () => {}, setBackgroundMessageHandler: () => {}, AuthorizationStatus: {} }));
jest.mock('../src/services/NotificationHistory', () => ({ __esModule: true, default: {} }));

import NotificationService from '../src/services/NotificationService';
import { ensureRuntimePermissions } from '../src/utils/runtimePermissions';

beforeEach(() => {
  mockAuthorization = 0;
  mockDialogs = 0;
  mockDialogGrants = false;
});

describe('notification permission', () => {
  test('background reads never show a dialog, granted or not', async () => {
    expect(await NotificationService.requestPermission()).toBe(false);
    expect(await NotificationService.requestPermission()).toBe(false);
    mockAuthorization = 1;
    expect(await NotificationService.requestPermission()).toBe(true);
    expect(mockDialogs).toBe(0);
  });

  test('already granted: the prompt skips the dialog', async () => {
    mockAuthorization = 1;
    expect(await NotificationService.promptForNotificationPermission()).toBe(true);
    expect(mockDialogs).toBe(0);
  });

  test('not granted: asks, then reads the real state — granted after the request → proceeds', async () => {
    mockDialogGrants = true;
    expect(await NotificationService.promptForNotificationPermission()).toBe(true);
    expect(mockDialogs).toBe(1);
    expect(await NotificationService.hasNotificationPermission()).toBe(true);
  });

  test('denied: resolves false (the caller then offers Settings), and asks again on the next tap', async () => {
    expect(await NotificationService.promptForNotificationPermission()).toBe(false);
    expect(await NotificationService.promptForNotificationPermission()).toBe(false);
    expect(mockDialogs).toBe(2);
  });
});

describe('runtime permissions (Bluetooth / location step)', () => {
  const RESULTS = { GRANTED: 'granted', LIMITED: 'limited', DENIED: 'denied', BLOCKED: 'blocked', UNAVAILABLE: 'unavailable' };
  type P = 'scan' | 'connect' | 'location';
  const all: P[] = ['scan', 'connect', 'location'];

  const fakeApi = (state: Record<P, string>, onRequest: (asked: P[]) => void = () => {}) => {
    const requested: P[][] = [];
    return {
      requested,
      api: {
        RESULTS,
        checkMultiple: async (perms: P[]) => Object.fromEntries(perms.map(p => [p, state[p]])) as Record<P, string>,
        requestMultiple: async (perms: P[]) => {
          requested.push(perms);
          onRequest(perms);
          return Object.fromEntries(perms.map(p => [p, state[p]])) as Record<P, string>;
        },
      },
    };
  };

  test('already granted: no dialog, proceeds', async () => {
    const { api, requested } = fakeApi({ scan: 'granted', connect: 'granted', location: 'granted' });
    expect(await ensureRuntimePermissions(all, api)).toBe('granted');
    expect(requested).toEqual([]);
  });

  test('some missing: asks only for those, then proceeds once granted', async () => {
    const state: Record<P, string> = { scan: 'granted', connect: 'denied', location: 'denied' };
    const { api, requested } = fakeApi(state, asked => asked.forEach(p => (state[p] = 'granted')));
    expect(await ensureRuntimePermissions(all, api)).toBe('granted');
    expect(requested).toEqual([['connect', 'location']]);
  });

  test('user denies: reported denied (the step stays, nothing is skipped)', async () => {
    const { api } = fakeApi({ scan: 'denied', connect: 'denied', location: 'denied' });
    expect(await ensureRuntimePermissions(all, api)).toBe('denied');
  });

  test('blocked ("don’t ask again"): no pointless dialog, reported blocked for the Settings route', async () => {
    const { api, requested } = fakeApi({ scan: 'granted', connect: 'granted', location: 'blocked' });
    expect(await ensureRuntimePermissions(all, api)).toBe('blocked');
    expect(requested).toEqual([]);
  });
});
