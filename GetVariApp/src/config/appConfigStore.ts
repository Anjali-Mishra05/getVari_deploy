import {
  AppConfig,
  DEFAULT_APP_CONFIG,
  MedicalConditionConfig,
} from './appConfigSchema';

/**
 * The current runtime configuration, and the lookups over it.
 *
 * ## Why this is separate from `ConfigService`
 *
 * The risk engine, the goal calculator, the recovery model and the PBWR
 * pipeline all need to *read* the config, and they are pure functions that run
 * in a plain node process under test. `ConfigService` cannot be their import,
 * because it reaches AsyncStorage and the backend URL resolver, which reach
 * React Native — pulling a native module graph into a suite that only wants to
 * multiply a weight by 35.
 *
 * So the split is by dependency, not by feature: this module holds the state
 * and the lookups and imports nothing, `ConfigService` owns fetching and
 * caching and calls `adopt` when a document arrives.
 */

type Listener = (config: AppConfig) => void;

let active: AppConfig = DEFAULT_APP_CONFIG;
const listeners = new Set<Listener>();

/** The config as it stands right now. Never null, never throws. */
export const current = (): AppConfig => active;

/**
 * Accept a document only if the parts the app indexes into are usable.
 *
 * Anything absent falls back to the shipped default rather than emptying a
 * screen: a config that names only `medicalConditions` must not take the
 * activity levels out of onboarding.
 */
export const validate = (raw: any): AppConfig | null => {
  if (!raw || typeof raw !== 'object') return null;

  const conditions = Array.isArray(raw.medicalConditions) ? raw.medicalConditions : null;
  if (conditions && conditions.some((c: any) => !c || typeof c.id !== 'string')) {
    console.warn('[Config] Rejected: a medical condition is missing its id.');
    return null;
  }

  const nonEmpty = <T,>(value: any, fallback: T[]): T[] =>
    Array.isArray(value) && value.length > 0 ? value : fallback;

  return {
    ...DEFAULT_APP_CONFIG,
    ...raw,
    medicalConditions: conditions ?? DEFAULT_APP_CONFIG.medicalConditions,
    activityLevels: nonEmpty(raw.activityLevels, DEFAULT_APP_CONFIG.activityLevels),
    workEnvironments: nonEmpty(raw.workEnvironments, DEFAULT_APP_CONFIG.workEnvironments),
    climateBands: nonEmpty(raw.climateBands, DEFAULT_APP_CONFIG.climateBands),
    quickLogAmounts: nonEmpty(raw.quickLogAmounts, DEFAULT_APP_CONFIG.quickLogAmounts),
    targetFormula: { ...DEFAULT_APP_CONFIG.targetFormula, ...(raw.targetFormula ?? {}) },
    riskThresholds: { ...DEFAULT_APP_CONFIG.riskThresholds, ...(raw.riskThresholds ?? {}) },
    disabledFeatures: Array.isArray(raw.disabledFeatures) ? raw.disabledFeatures : [],
  };
};

/** Install a new config and tell everyone watching. */
export const adopt = (config: AppConfig): void => {
  active = config;
  for (const listener of listeners) {
    try {
      listener(active);
    } catch (error) {
      console.error('[Config] Listener threw:', error);
    }
  }
};

/** Restore the shipped defaults. Used by tests between cases. */
export const reset = (): void => adopt(DEFAULT_APP_CONFIG);

/** Subscribe to config changes. Returns an unsubscribe function. */
export const subscribe = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Conditions the onboarding and profile screens should offer, in order. */
export const enabledConditions = (): MedicalConditionConfig[] =>
  active.medicalConditions.filter(condition => condition.enabled !== false);

/** Look one up by the id stored on a profile, or undefined if it was retired. */
export const conditionById = (id: string): MedicalConditionConfig | undefined =>
  active.medicalConditions.find(condition => condition.id === id);

/**
 * The configs for a profile's stored ids, skipping any that no longer exist.
 *
 * Retired ids are dropped rather than throwing: a condition removed from the
 * admin panel is still sitting on every profile that once selected it.
 */
export const conditionsFor = (ids?: string[] | null): MedicalConditionConfig[] =>
  (ids ?? [])
    .map(conditionById)
    .filter((condition): condition is MedicalConditionConfig => !!condition);

/** True when a profile carries a condition the app will not pace without a doctor's limit. */
export const requiresPhysicianLimit = (ids?: string[] | null): boolean =>
  conditionsFor(ids).some(condition => condition.requiresPhysicianLimit);

/** Whether a feature is switched off from the admin panel. */
export const isFeatureDisabled = (feature: string): boolean =>
  active.disabledFeatures.includes(feature);

export const AppConfigStore = {
  current,
  validate,
  adopt,
  reset,
  subscribe,
  enabledConditions,
  conditionById,
  conditionsFor,
  requiresPhysicianLimit,
  isFeatureDisabled,
};

export default AppConfigStore;
