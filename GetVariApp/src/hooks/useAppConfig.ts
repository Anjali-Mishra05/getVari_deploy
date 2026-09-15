import { useEffect, useState } from 'react';

import AppConfigStore from '../config/appConfigStore';
import type { AppConfig } from '../config/appConfigSchema';

/**
 * The current admin config, re-rendering the caller when a new one arrives.
 *
 * Screens that read the config during render — the onboarding condition list,
 * the profile editor, the physician-limit gate — need this rather than a bare
 * `AppConfigStore.current()`. The config is fetched over the network, so it
 * routinely lands *after* a screen has already painted; without a subscription
 * the screen keeps showing whatever was loaded when it mounted until something
 * else happens to re-render it.
 */
export const useAppConfig = (): AppConfig => {
  const [config, setConfig] = useState<AppConfig>(AppConfigStore.current);

  useEffect(() => {
    // Re-read on mount as well as subscribing: a document may have been
    // adopted between the initial `useState` call and this effect running.
    setConfig(AppConfigStore.current());
    return AppConfigStore.subscribe(setConfig);
  }, []);

  return config;
};

export default useAppConfig;
