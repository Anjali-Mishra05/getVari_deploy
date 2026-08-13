import { NativeModules, Platform } from 'react-native';

/** Port the FastAPI backend listens on (see Chatbot/backend/main.py). */
export const BACKEND_PORT = 8000;

/**
 * Manual override for when auto-discovery can't find the backend — most often
 * a physical device on a network where the Metro host and the backend host
 * differ. Set it to your dev machine's LAN address, e.g.
 * 'http://192.168.1.42:8000', and leave it null otherwise.
 */
const MANUAL_OVERRIDE: string | null = null;

/**
 * The host running Metro is, in practice, the host running the backend: both
 * are the developer's machine. Metro hands the bundle URL to the app at launch,
 * so we can read that machine's address off it instead of hardcoding anyone's
 * LAN IP. Returns null in release builds, where scriptURL points at a local
 * bundle file rather than a dev server.
 */
function hostFromMetro(): string | null {
  const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;
  if (!scriptURL) return null;

  // scriptURL looks like 'http://192.168.1.42:8081/index.bundle?platform=android'
  const match = /^https?:\/\/([^/:]+)(?::\d+)?\//.exec(scriptURL);
  const host = match?.[1];
  if (!host) return null;

  // A bundle served over a file:// URL, or from the emulator's own loopback,
  // tells us nothing about where the backend is.
  if (host === 'localhost' || host === '127.0.0.1') return null;

  return host;
}

/**
 * Addresses to probe for the backend, best guess first. Ordering matters: each
 * miss costs a timeout, so the entries most likely to answer come first.
 */
export function backendCandidates(): string[] {
  const candidates: string[] = [];

  if (MANUAL_OVERRIDE) candidates.push(MANUAL_OVERRIDE);

  // The dev machine, as reported by Metro. Works for physical devices on any
  // network without per-machine edits.
  const metroHost = hostFromMetro();
  if (metroHost) candidates.push(`http://${metroHost}:${BACKEND_PORT}`);

  // Covers the iOS simulator, and any device running
  // `adb reverse tcp:8000 tcp:8000`. Fails fast elsewhere.
  candidates.push(`http://localhost:${BACKEND_PORT}`);

  // The Android emulator's alias for the host machine's loopback. Only
  // resolves inside that emulator.
  if (Platform.OS === 'android') {
    candidates.push(`http://10.0.2.2:${BACKEND_PORT}`);
  }

  return [...new Set(candidates)];
}
