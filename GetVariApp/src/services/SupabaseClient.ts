import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ntuboicvzsoamwedtprg.supabase.co';
const supabaseAnonKey = 'sb_publishable_24w1KsSoKG0A9MiXDVDa_A_sUewgfxM';

// Handle storage for both Web and React Native
let authStorage;
if (typeof window !== 'undefined' && window.localStorage) {
  authStorage = window.localStorage;
} else {
  // We use require here to avoid top-level import that might break web builds
  // if the packager/bundler doesn't support the module.
  authStorage = require('@react-native-async-storage/async-storage').default;
}

/**
 * How long any one request is allowed to stay unanswered.
 *
 * A phone with no route out — airplane mode, a dead cell, a Wi-Fi portal that
 * accepts the association and nothing else — does not *fail* a fetch, it
 * leaves it pending. Nothing above cancels it, so the read that a screen is
 * holding a spinner for never settles, and the spinner stays up for the rest
 * of the session: turning the network back on cannot help a request that is
 * already parked on a socket opened while it was off.
 *
 * Aborting turns that silence into an error, which every caller here already
 * knows how to degrade from — and which the dashboard can retry.
 */
export const REQUEST_TIMEOUT_MS = 12_000;

const fetchWithTimeout: typeof fetch = async (input: any, init: any = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // A signal the caller passed in still has to work, so it is chained onto
  // ours rather than replaced by it.
  const callerSignal: AbortSignal | undefined = init?.signal;
  const abort = () => controller.abort();
  callerSignal?.addEventListener?.('abort', abort);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener?.('abort', abort);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: { fetch: fetchWithTimeout },
});
