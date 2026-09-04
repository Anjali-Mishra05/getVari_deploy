import AsyncStorage from '@react-native-async-storage/async-storage';

import { BACKEND_API_KEY, resolveBackendUrl } from '../config/backend';
import { AppConfig } from '../config/appConfigSchema';
import AppConfigStore, { adopt, current, validate } from '../config/appConfigStore';

/**
 * Keeps the app's runtime configuration up to date from the admin API.
 *
 * Three rules shape this file:
 *
 *  1. **The app never blocks on it.** Reads go through `AppConfigStore`, which
 *     is synchronous and always has something usable — the last fetch, the
 *     last cached fetch, or the compiled-in defaults, in that order. A screen
 *     reads the config like a constant.
 *  2. **A cached config outlives the process.** The first paint after a cold
 *     start must not be built on defaults the admin has already overridden, so
 *     the last good document is written to AsyncStorage and read back before
 *     the network is consulted.
 *  3. **A bad document is ignored, not adopted.** A truncated response or a
 *     renamed field would otherwise take the medical-condition list out of the
 *     onboarding screen, so anything that fails validation leaves the previous
 *     config in place and is logged.
 *
 * The lookups (`conditionsFor`, `requiresPhysicianLimit`, …) are re-exported
 * from the store so a screen has one import; pure logic should import the
 * store directly, which pulls in no native modules.
 */

const CACHE_KEY = '@getvari/app_config_v1';
/** How long a fetched config is trusted before the next foreground refetch. */
const REFRESH_AFTER_MS = 15 * 60 * 1000;
/** A config fetch that has not answered by now is not worth waiting for. */
const FETCH_TIMEOUT_MS = 20_000;

let hydrated = false;
let lastFetchedAt = 0;
let inFlight: Promise<AppConfig> | null = null;

/** Reads the cached document. Safe to call repeatedly; only the first hydrates. */
const hydrateFromCache = async (): Promise<void> => {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = validate(JSON.parse(raw));
    // A fetch that landed while this read was in flight is newer than the
    // cache, so it wins.
    if (parsed && parsed.version >= current().version) adopt(parsed);
  } catch (error) {
    console.error('[Config] Failed to read cache:', error);
  }
};

const fetchFromServer = async (): Promise<AppConfig> => {
  const base = await resolveBackendUrl();
  if (!base) throw new Error('No backend address available for config.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/config`, {
      headers: BACKEND_API_KEY ? { 'X-API-Key': BACKEND_API_KEY } : undefined,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Config endpoint returned ${response.status}`);
    const parsed = validate(await response.json());
    if (!parsed) throw new Error('Config document failed validation.');
    return parsed;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Bring the config up to date.
 *
 * Concurrent callers share one request — the login screen, the dashboard and
 * the chat all ask on launch, and three round trips to a sleeping free-tier
 * host is three cold starts.
 */
export const refresh = async (options: { force?: boolean } = {}): Promise<AppConfig> => {
  await hydrateFromCache();

  const fresh = lastFetchedAt > 0 && Date.now() - lastFetchedAt < REFRESH_AFTER_MS;
  if (!options.force && fresh) return current();
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const config = await fetchFromServer();
      lastFetchedAt = Date.now();
      adopt(config);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(config)).catch(error =>
        console.error('[Config] Failed to write cache:', error)
      );
      return config;
    } catch (error: any) {
      // Staying on the previous document is always better than emptying a
      // screen, so a failure here is a log line and nothing more.
      console.warn('[Config] Refresh failed, keeping current config:', error?.message ?? error);
      return current();
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

export const {
  current: currentConfig,
  subscribe,
  enabledConditions,
  conditionById,
  conditionsFor,
  requiresPhysicianLimit,
  isFeatureDisabled,
} = AppConfigStore;

export const ConfigService = {
  refresh,
  current: AppConfigStore.current,
  subscribe: AppConfigStore.subscribe,
  enabledConditions: AppConfigStore.enabledConditions,
  conditionById: AppConfigStore.conditionById,
  conditionsFor: AppConfigStore.conditionsFor,
  requiresPhysicianLimit: AppConfigStore.requiresPhysicianLimit,
  isFeatureDisabled: AppConfigStore.isFeatureDisabled,
};

export default ConfigService;
