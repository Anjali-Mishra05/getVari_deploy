/**
 * The Account screen's Android version line: shown in development builds,
 * hidden in release builds, decided by the build rather than by hand.
 */

var mockNative: any = {};
var mockPlatform: any = { OS: 'android', Version: 34, constants: { Release: '14' } };

jest.mock('react-native', () => ({
  get NativeModules() {
    return mockNative;
  },
  get Platform() {
    return mockPlatform;
  },
}));

import { androidVersionLabel, internalVersionLabel, isDevBuild } from '../src/utils/buildInfo';

const setDev = (value: boolean) => ((global as any).__DEV__ = value);

afterEach(() => {
  mockNative = {};
  mockPlatform = { OS: 'android', Version: 34, constants: { Release: '14' } };
  setDev(false);
});

describe('isDevBuild', () => {
  it('release build (bundle dev off, BuildConfig.DEBUG false): hidden', () => {
    setDev(false);
    mockNative = { FullScreenReminderModule: { isDebugBuild: false } };
    expect(isDevBuild()).toBe(false);
  });

  it('debug APK running its packaged bundle (__DEV__ false, BuildConfig.DEBUG true): shown', () => {
    setDev(false);
    mockNative = { FullScreenReminderModule: { isDebugBuild: true } };
    expect(isDevBuild()).toBe(true);
  });

  it('served by Metro (__DEV__ true): shown', () => {
    setDev(true);
    expect(isDevBuild()).toBe(true);
  });

  it('native module missing: falls back to __DEV__ only', () => {
    setDev(false);
    expect(isDevBuild()).toBe(false);
  });
});

describe('internalVersionLabel', () => {
  it('shows the build-time version as "Version 0.1.DD.MM"', () => {
    mockNative = { FullScreenReminderModule: { internalVersion: '0.1.07.10' } };
    expect(internalVersionLabel()).toBe('Version 0.1.07.10');
  });

  it('comes from the build, not from today’s date', () => {
    jest.useFakeTimers().setSystemTime(new Date(2027, 2, 25));
    mockNative = { FullScreenReminderModule: { internalVersion: '0.1.07.10' } };
    expect(internalVersionLabel()).toBe('Version 0.1.07.10');
    jest.useRealTimers();
  });

  it('carries no Android OS or API version', () => {
    mockNative = { FullScreenReminderModule: { internalVersion: '0.1.07.10' } };
    expect(internalVersionLabel()).not.toMatch(/android|api/i);
  });

  it('a build with no version, or a malformed one: nothing shown', () => {
    expect(internalVersionLabel()).toBeNull();
    for (const bad of ['1.0', '0.1.7.10', '0.1.07.10-debug', '', 7]) {
      mockNative = { FullScreenReminderModule: { internalVersion: bad } };
      expect(internalVersionLabel()).toBeNull();
    }
  });
});

describe('androidVersionLabel', () => {
  it('names the OS release and API level', () => {
    expect(androidVersionLabel()).toBe('Android 14 (API 34)');
  });

  it('off Android: nothing', () => {
    mockPlatform = { OS: 'ios', Version: '17.0' };
    expect(androidVersionLabel()).toBeNull();
  });
});
