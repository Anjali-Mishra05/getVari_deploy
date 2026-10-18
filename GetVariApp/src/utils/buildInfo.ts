import { NativeModules, Platform } from 'react-native';

/**
 * True in development builds, false in production/release builds — decided by
 * the build itself, so nothing has to be switched by hand before a release.
 *
 * `__DEV__` covers JS served by Metro. The debug APK also packages its own
 * bundle with dev off (`debuggableVariants = []`), so Gradle's
 * `BuildConfig.DEBUG`, exposed by FullScreenReminderModule, covers that case.
 * A release build has both false.
 */
export const isDevBuild = (): boolean =>
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  NativeModules.FullScreenReminderModule?.isDebugBuild === true;

/**
 * "Version 0.1.07.10" — the internal version, `0.1.DD.MM`, fixed when the APK
 * was built (Gradle writes it into `BuildConfig`; it is not read from today's
 * date). Null when the build does not carry one, so nothing is shown rather
 * than a guess.
 */
export const internalVersionLabel = (): string | null => {
  const version = NativeModules.FullScreenReminderModule?.internalVersion;
  return typeof version === 'string' && /^0\.1\.\d{2}\.\d{2}$/.test(version) ? `Version ${version}` : null;
};

/** "Android 14 (API 34)", or null off Android. */
export const androidVersionLabel = (): string | null => {
  if (Platform.OS !== 'android') return null;
  const release = (Platform as any).constants?.Release;
  const api = Platform.Version;
  return release ? `Android ${release} (API ${api})` : `Android API ${api}`;
};
