import { supabase } from '../../services/SupabaseClient';
import { DEFAULT_APP_CONFIG } from '../../config/appConfigSchema';
import type { AppConfig } from '../../config/appConfigSchema';

/**
 * Reads and writes the one row that configures every installed app.
 *
 * The console writes straight to Supabase (as it does for every other table);
 * the mobile app reads the same row through the backend's `GET /config`, which
 * merges it over the shipped defaults. That asymmetry is deliberate — the app
 * must never hold a Supabase key with write access to product settings.
 *
 * The document is stored whole, in one row, because it is *consistent* as a
 * unit: a client that picked up a new condition list but the old target
 * formula would compute goals nobody configured.
 */

const TABLE = 'getvari_app_config';
const ROW_ID = 'active';

export interface StoredConfig {
  config: AppConfig;
  version: number;
  updatedAt: string | null;
  /** True when the row is empty, so the app is running on shipped defaults. */
  isDefault: boolean;
}

/** The stored document merged over the defaults, exactly as the app sees it. */
export const fetchConfig = async (): Promise<StoredConfig> => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('config, version, updated_at')
    .eq('id', ROW_ID)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const stored = (data?.config ?? {}) as Partial<AppConfig>;
  const isDefault = !data || Object.keys(stored).length === 0;

  return {
    config: { ...DEFAULT_APP_CONFIG, ...stored },
    version: data?.version ?? 0,
    updatedAt: data?.updated_at ?? null,
    isDefault,
  };
};

/**
 * Save the whole document.
 *
 * The row's trigger bumps `version`, which is what lets a device tell a stale
 * cache from a current one. Every running app picks the change up on its next
 * foreground; nothing needs a release.
 */
export const saveConfig = async (config: AppConfig, updatedBy?: string): Promise<void> => {
  const { error } = await supabase.from(TABLE).upsert({
    id: ROW_ID,
    config,
    updated_by: updatedBy ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
};

/** Clear every override, putting all installs back on the shipped defaults. */
export const resetConfig = async (updatedBy?: string): Promise<void> => {
  const { error } = await supabase.from(TABLE).upsert({
    id: ROW_ID,
    config: {},
    updated_by: updatedBy ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
};

export default { fetchConfig, saveConfig, resetConfig };
