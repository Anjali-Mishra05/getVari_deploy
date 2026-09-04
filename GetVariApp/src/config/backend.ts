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
const CONFIGURED_URL: string = (
  (appConfig as { aquaSageBackendUrl?: string }).aquaSageBackendUrl ?? ''
).replace(/\/+$/, '');

/** The configured backend, or '' when this build has to discover one. */
export const CONFIGURED_BACKEND_URL = CONFIGURED_URL;

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
    candidates.push(CONFIGURED_URL);
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
  console.log('[Backend] Candidates generated:', unique);
  return unique;
}

/**
 * The backend address, resolved once and shared by everything that calls it.
 *
 * The chat used to own discovery, which meant the config service and the chat
 * each probed on their own — two cold starts on a free-tier host that takes
 * the better part of a minute to wake. Discovery now happens here, at most
 * once, and every caller awaits the same promise.
 */
let resolvedUrl: string | null = null;
let resolving: Promise<string | null> | null = null;

/** Milliseconds to wait for a candidate to answer `/ping`. */
const PROBE_TIMEOUT_MS = 6000;

export async function resolveBackendUrl(): Promise<string | null> {
  if (resolvedUrl) return resolvedUrl;

  // A configured backend needs no discovery, and must not be probed.
  //
  // Discovery exists to find a developer's machine on an unknown address.
  // When the build has been told where the server is, probing only adds a way
  // to fail: a free-tier host sleeps when idle and takes half a minute to
  // wake, so a 6-second /ping aborts, the probe moves on to addresses that
  // cannot possibly answer on a real phone, and the user is told the AI is
  // unreachable — for a server that was merely asleep.
  if (CONFIGURED_BACKEND_URL) {
    resolvedUrl = CONFIGURED_BACKEND_URL;
    return resolvedUrl;
  }

  if (resolving) return resolving;

  resolving = (async () => {
    const candidates = backendCandidates();
    const startedAt = Date.now();

    for (const base of candidates) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
        try {
          const res = await fetch(`${base}/ping`, { signal: controller.signal });
          if (res.ok) {
            console.log(`[Backend] Discovered at ${base} in ${Date.now() - startedAt}ms`);
            resolvedUrl = base;
            return base;
          }
        } finally {
          clearTimeout(timer);
        }
      } catch (error: any) {
        console.log(`[Backend] Probing ${base} failed: ${error?.message ?? error}`);
      }
    }

    console.warn('[Backend] Not found on any candidate address:', candidates);
    return null;
  })();

  try {
    return await resolving;
  } finally {
    resolving = null;
  }
}

/**
 * Wake the backend without waiting for it.
 *
 * Render's free tier stops the instance after 15 minutes of no traffic and
 * takes roughly 30-50 seconds to start it again. Nothing in the app can stop
 * that, but the app decides *when* the wait happens: called on launch and on
 * every foreground, the instance is usually already up by the time the user
 * opens the chat, so the cold start is spent on a screen the user is reading
 * rather than on a message they are waiting for.
 *
 * Deliberately unawaited and never throws.
 */
export function warmBackend(): void {
  resolveBackendUrl()
    .then(base => {
      if (!base) return;
      return fetch(`${base}/ping`).catch(() => undefined);
    })
    .catch(() => undefined);
}

/** Test seam: forget the resolved address so the next call probes again. */
export function resetBackendResolution(): void {
  resolvedUrl = null;
  resolving = null;
}
