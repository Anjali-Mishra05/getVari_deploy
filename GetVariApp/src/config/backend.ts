import { NativeModules, Platform } from 'react-native';

import appConfig from '../../app.json';

/** Port the FastAPI backend listens on (see Chatbot/backend/main.py). */
export const BACKEND_PORT = 8000;

/**
 * Where the backend lives, for builds that cannot discover it.
 *
 * Auto-discovery below reads the host from the URL Metro served the bundle
 * from, which is exactly right in development and useless in a release build:
 * there the bundle is a file on the device, so there is no host to read and
 * the chat can only report that it could not reach the server. A shipped app
 * therefore has to be *told* where the backend is.
 *
 * It is read from `app.json` rather than hardcoded here so that pointing a
 * build at a deployed server — or at a machine on the tester's network — is a
 * one-line config change and not a code change:
 *
 *     "aquaSageBackendUrl": "https://getvari-api.example.com"
 *
 * Empty means "not configured": development still discovers the host on its
 * own, and a release build fails fast with the message the chat already shows.
 */
const CONFIGURED_URL: string = (appConfig as { aquaSageBackendUrl?: string }).aquaSageBackendUrl ?? '';

/**
 * Shared secret for the deployed backend, sent as `X-API-Key`.
 *
 * The server holds a Supabase service-role key, so a public deployment must
 * not answer just anybody. Empty is correct for a local server, which runs
 * without the check.
 */
export const BACKEND_API_KEY: string =
  (appConfig as { aquaSageApiKey?: string }).aquaSageApiKey ?? '';

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

  if (CONFIGURED_URL) {
    candidates.push(CONFIGURED_URL.replace(/\/+$/, ''));
  }

  // The dev machine, as reported by Metro. Works for physical devices on any
  // network without per-machine edits.
  const metroHost = hostFromMetro();
  if (metroHost) {
    candidates.push(`http://${metroHost}:${BACKEND_PORT}`);
  }

  // Covers the iOS simulator, and any device running
  // `adb reverse tcp:8000 tcp:8000`. Fails fast elsewhere.
  candidates.push(`http://localhost:${BACKEND_PORT}`);

  // The Android emulator's alias for the host machine's loopback. Only
  // resolves inside that emulator.
  if (Platform.OS === 'android') {
    candidates.push(`http://10.0.2.2:${BACKEND_PORT}`);
  }

  const unique = [...new Set(candidates)];
  console.log('[AquaSage] Backend candidates generated:', unique);
  return unique;
}
