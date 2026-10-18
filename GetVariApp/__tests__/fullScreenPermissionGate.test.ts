/**
 * The full-screen step of the permission gate follows Android's live answer
 * from `canUseFullScreenIntent`, and nothing else.
 *
 * Runs the real hook against the real `NotificationService`; only the native
 * bridge is faked, so "enabled", "disabled" and "cannot be verified" are the
 * three things the native module can actually report.
 *
 *   npx jest --config jest.config.logic.js __tests__/fullScreenPermissionGate.test.ts
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/** What `canUseFullScreenIntent` resolves with; a function that throws is rethrown. */
let mockFullScreen: () => boolean | null = () => true;
let mockFullScreenReads = 0;
let mockAppStateListener: ((state: string) => void) | null = null;
let mockNativeModules: any;

const NATIVE = {
  FullScreenReminderModule: {
    canUseFullScreenIntent: () => {
      mockFullScreenReads++;
      try {
        return Promise.resolve(mockFullScreen());
      } catch (error) {
        return Promise.reject(error);
      }
    },
    canLaunchOverOtherApps: () => Promise.resolve(true),
  },
};

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
  get NativeModules() {
    return mockNativeModules;
  },
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      mockAppStateListener = listener;
      return { remove: () => (mockAppStateListener = null) };
    },
  },
}));
// nativewind's babel preset routes createElement through css-interop, which
// needs the real React Native. Nothing here is styled, so plain React will do.
jest.mock('react-native-css-interop', () => {
  const { createElement } = jest.requireActual('react');
  return { __esModule: true, createInteropElement: createElement };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  // A stale "granted" flag, to prove it is never consulted.
  default: {
    getItem: async () => 'true',
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    getNotificationSettings: async () => ({ authorizationStatus: 1 }),
    getChannel: async () => ({ id: 'hydration-reminders-v3', importance: 4 }),
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
jest.mock('../src/services/AuthService', () => ({
  AuthService: { hasCompletedOnboarding: async () => true },
}));

import usePermissionGate from '../src/hooks/usePermissionGate';
import { firstMissing, shouldShowPermissionGate } from '../src/utils/permissionRequirements';

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

type Gate = ReturnType<typeof usePermissionGate>;

const mountGate = async (): Promise<{ current: () => Gate; unmount: () => void }> => {
  let latest: Gate;
  const Probe = () => {
    latest = usePermissionGate();
    return null;
  };
  let renderer: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });
  return { current: () => latest, unmount: () => renderer.unmount() };
};

const gateShows = (gate: Gate) => shouldShowPermissionGate(gate);
const fullScreenStepShown = (gate: Gate) => firstMissing(gate.snapshot)?.key === 'fullScreenIntent';

let silenceWarn: jest.SpyInstance;

beforeEach(() => {
  mockFullScreen = () => true;
  mockFullScreenReads = 0;
  mockAppStateListener = null;
  mockNativeModules = NATIVE;
  silenceWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => silenceWarn.mockRestore());

describe('full-screen permission step', () => {
  it('is skipped when Android reports it enabled', async () => {
    const gate = await mountGate();
    expect(gate.current().snapshot?.fullScreenIntent).toBe(true);
    expect(fullScreenStepShown(gate.current())).toBe(false);
    expect(gateShows(gate.current())).toBe(false);
    gate.unmount();
  });

  it('is shown when Android reports it disabled', async () => {
    mockFullScreen = () => false;
    const gate = await mountGate();
    expect(gate.current().snapshot?.fullScreenIntent).toBe(false);
    expect(fullScreenStepShown(gate.current())).toBe(true);
    expect(gateShows(gate.current())).toBe(true);
    gate.unmount();
  });

  it('is shown, not treated as granted, when the state cannot be verified', async () => {
    // Native could not read it.
    mockFullScreen = () => null;
    let gate = await mountGate();
    expect(fullScreenStepShown(gate.current())).toBe(true);
    gate.unmount();

    // The bridge threw.
    mockFullScreen = () => {
      throw new Error('binder died');
    };
    gate = await mountGate();
    expect(fullScreenStepShown(gate.current())).toBe(true);
    gate.unmount();

    // No native module in this build.
    mockNativeModules = {};
    gate = await mountGate();
    expect(fullScreenStepShown(gate.current())).toBe(true);
    gate.unmount();
  });

  it('re-checks Android when the user returns from Settings', async () => {
    mockFullScreen = () => false;
    const gate = await mountGate();
    expect(fullScreenStepShown(gate.current())).toBe(true);
    const readsBefore = mockFullScreenReads;

    // The user enables it in Settings; the app comes back to the foreground.
    mockFullScreen = () => true;
    await act(async () => {
      mockAppStateListener!('active');
    });

    expect(mockFullScreenReads).toBe(readsBefore + 1);
    expect(fullScreenStepShown(gate.current())).toBe(false);
    expect(gateShows(gate.current())).toBe(false);

    // And turning it back off is noticed on the next return too.
    mockFullScreen = () => false;
    await act(async () => {
      mockAppStateListener!('active');
    });
    expect(fullScreenStepShown(gate.current())).toBe(true);
    gate.unmount();
  });
});
