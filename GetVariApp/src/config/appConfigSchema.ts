/**
 * The shape of everything the app is allowed to be told at runtime.
 *
 * Disease definitions, activity bands, climate modifiers and the constants
 * behind the daily goal used to be typed out in five different files — the
 * onboarding screen, the profile editor, the target calculator, the risk
 * engine and the PBWR service. They drifted, and not subtly: onboarding wrote
 * the id `ckd`, the target calculator looked for `kidney` and the risk engine
 * looked for `Kidney Disease`, so a user who ticked "Kidney Disease / CKD"
 * had *none* of the three adjustments applied to them.
 *
 * There is now one definition per condition, it carries every downstream
 * number with it, and it is served by the admin API rather than compiled in.
 * The values below are only the fallback used before the first fetch returns
 * (and on a device that has never been online) — the admin panel is the
 * source of truth.
 */

import defaultAppConfig from '../../Chatbot/backend/default_app_config.json';

/** Weight deltas and load multipliers the risk engine applies per condition. */
export interface RiskTweak {
  heart?: number;
  activity?: number;
  temp?: number;
  humidity?: number;
  time?: number;
}

export interface MedicalConditionConfig {
  /** Stable key stored on the profile. Never change one in place — retire it. */
  id: string;
  title: string;
  description: string;
  /** Shown in onboarding and the profile editor while true. */
  enabled: boolean;
  /** Added to the daily goal, in ml. Negative lowers the ceiling. */
  targetAdjustmentMl: number;
  /** Multiplies the modelled recovery window — higher means slower recovery. */
  recoveryMultiplier: number;
  /**
   * Fraction of a drink that counts towards lowering the risk score. Below 1
   * for conditions that impair uptake.
   */
  absorptionEfficiency: number;
  /** Added to the risk engine's baseline weights before normalisation. */
  riskWeightDeltas: RiskTweak;
  /** Multiplies the corresponding load score before weighting. */
  riskLoadMultipliers: RiskTweak;
  /** Added to the PBWR baseline, in ml. */
  pbwrAdjustmentMl: number;
  /** Hard ceiling on a day's intake, in ml. `null` means no ceiling. */
  pbwrUpperLimitMl: number | null;
  /**
   * The app will not pace intake for this condition without a doctor's daily
   * limit, and says so rather than guessing.
   */
  requiresPhysicianLimit: boolean;
}

export interface ActivityLevelConfig {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  /** Added to the daily goal, in ml. */
  targetBonusMl: number;
}

export interface WorkEnvironmentConfig {
  id: string;
  label: string;
  enabled: boolean;
  /** Added to the PBWR baseline, in ml. */
  pbwrAdjustmentMl: number;
}

/**
 * A climate band and the places that fall in it.
 *
 * The band is resolved from the device's coordinates: GPS gives a fix, the
 * fix resolves to its nearest known city, and that city's band supplies the
 * modifier. The user is never asked — the city name is shown so they can see
 * what the app decided, and corrected only if the fix was wrong.
 *
 * Bands are evaluated in order and the first match wins, so the last entry
 * should be the catch-all (an empty `cities` list).
 */
export interface ClimateBandConfig {
  id: string;
  label: string;
  /** Cities in this band. Matched as a substring, so "Navi Mumbai" hits "Mumbai". */
  cities: string[];
  /** Added to the daily goal, in ml. */
  targetAdjustmentMl: number;
  /**
   * Multiplies the risk engine's temperature and humidity loads for users in
   * this band, which is what "hot city" used to mean in the risk engine.
   */
  riskLoadMultiplier: number;
  /** Added to the risk engine's baseline weights before normalisation. */
  riskWeightDeltas: RiskTweak;
}

export interface TargetFormulaConfig {
  /** Millilitres per kilogram of body weight, before any adjustment. */
  mlPerKg: number;
  minTargetMl: number;
  maxTargetMl: number;
  /** The goal is rounded to a multiple of this, in ml. */
  roundToMl: number;
}

export interface RiskThresholdConfig {
  elevated: number;
  high: number;
  recovery: number;
}

export interface QuickLogAmountConfig {
  label: string;
  ml: number;
  /** Drawn filled — the suggested amount. */
  primary: boolean;
}

/** Everything the admin panel controls, in one document. */
export interface AppConfig {
  /** Bumped by the admin panel on every save; used to spot a stale cache. */
  version: number;
  updatedAt: string;
  medicalConditions: MedicalConditionConfig[];
  activityLevels: ActivityLevelConfig[];
  workEnvironments: WorkEnvironmentConfig[];
  climateBands: ClimateBandConfig[];
  targetFormula: TargetFormulaConfig;
  riskThresholds: RiskThresholdConfig;
  quickLogAmounts: QuickLogAmountConfig[];
  /**
   * Features that exist in the binary but are not finished. Anything listed
   * here is hidden, or labelled "in development" where hiding it would leave
   * a hole — the app must never show a control that does nothing.
   */
  disabledFeatures: string[];
}

/**
 * Fallback used before the first successful fetch.
 *
 * Imported from the same JSON document the backend serves as its own default,
 * so "what a device does before it has talked to the server" and "what the
 * server answers when nobody has opened the admin console" are the same bytes
 * rather than two lists someone has to keep in step. The admin panel is the
 * source of truth for a running install; this is only the cold start.
 */
export const DEFAULT_APP_CONFIG: AppConfig =
  defaultAppConfig as unknown as AppConfig;

export default DEFAULT_APP_CONFIG;
