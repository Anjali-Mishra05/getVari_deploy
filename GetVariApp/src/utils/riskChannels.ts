/**
 * The five inputs the hydration risk engine actually weighs, described once.
 *
 * ## Why this is shared rather than declared per screen
 *
 * Two surfaces let a tester drive the engine by hand — the sensor test sheet
 * and the load breakdown on the dashboard — and both need the same four facts
 * about each channel: what unit it is in, what values are accepted, where the
 * load thresholds sit, and how many decimals are worth showing. Declared twice
 * they drift, and a bound that disagrees with the engine is worse than no
 * bound at all: the field would accept a value the solve then rejects as a
 * device error.
 *
 * Every number here is read from, or matched to, `RISK_CONFIG` in
 * `hydrationRiskEngine.ts` — this module describes the engine's inputs, it
 * does not define them.
 */

import type { SensorOverride } from '../hooks/useHydrationTelemetry';
import { RISK_CONFIG } from './hydrationRiskEngine';

export interface RiskChannelSpec {
  key: keyof SensorOverride;
  /** Full name, for the test sheet. */
  label: string;
  /** Abbreviated name, for the five narrow cards on the dashboard. */
  shortLabel: string;
  unit: string;
  min: number;
  max: number;
  /** Nudge size on the surfaces that offer one. */
  step: number;
  /** Band edges from `RISK_CONFIG.LOAD_MAPPING`, drawn as a hint. */
  bands: string;
  decimals: number;
  /**
   * The band that scores lowest, in the channel's own unit.
   *
   * This is the honest answer to "what should I type?" on a panel whose job is
   * to exercise the algorithm: it is where the engine assigns the least risk,
   * derived from the load mapping rather than invented. For heart rate it also
   * happens to be the clinical resting range.
   */
  lowestRisk: string;
}

/**
 * Heart rate's accepted range is not a display choice — `solveRisk` returns
 * `Device Error` outside it, so a field that accepted 25 bpm would blank the
 * score rather than move it.
 */
export const HEART_RATE_MIN = 30;
export const HEART_RATE_MAX = 220;

export const RISK_CHANNELS: RiskChannelSpec[] = [
  {
    key: 'heartRate',
    label: 'Heart rate',
    shortLabel: 'Heart',
    unit: 'bpm',
    min: HEART_RATE_MIN,
    max: HEART_RATE_MAX,
    step: 5,
    bands: '<80 · 80-100 · 100-120 · 120+',
    decimals: 0,
    lowestRisk: '<80 bpm',
  },
  {
    key: 'activityLoad',
    label: 'Activity index',
    shortLabel: 'Activity',
    // Not a percentage: `SensorData.activityLoad` is a 0-100 movement index.
    unit: 'index',
    min: 0,
    max: 100,
    step: 5,
    bands: '<20 · 20-50 · 50-80 · 80+',
    decimals: 0,
    lowestRisk: '<20',
  },
  {
    key: 'temperature',
    label: 'Temperature',
    shortLabel: 'Temp',
    unit: '°C',
    // The engine's own band starts at -99, which is a catch-all rather than a
    // claim about ambient air. 5-50 °C is the range the test sheet has always
    // offered and covers every band edge the mapping defines.
    min: 5,
    max: 50,
    step: 1,
    bands: '<22 · 22-28 · 28-32 · 32+',
    decimals: 1,
    lowestRisk: '<22 °C',
  },
  {
    key: 'humidity',
    label: 'Humidity',
    shortLabel: 'Humidity',
    unit: '%',
    min: 0,
    max: 100,
    step: 5,
    bands: '<40 · 40-60 · 60-75 · 75+',
    decimals: 0,
    lowestRisk: '<40 %',
  },
  {
    key: 'gapHours',
    label: 'Since last drink',
    shortLabel: 'Time',
    unit: 'h',
    min: 0,
    // The top band is "2 hours or more", so everything past 8 scores
    // identically — a wider field would only offer values that cannot change
    // the answer.
    max: 8,
    step: 0.5,
    bands: '<0.5 · 0.5-1 · 1-2 · 2+',
    decimals: 2,
    lowestRisk: '<0.5 h',
  },
];

/** Look one up by key, for a caller that has the key and wants the bounds. */
export const riskChannel = (key: keyof SensorOverride): RiskChannelSpec =>
  RISK_CHANNELS.find(channel => channel.key === key) ?? RISK_CHANNELS[0];

/** `2.50` reads as noise on a field someone is about to retype; `2.5` does not. */
export const trimToDecimals = (value: number, decimals: number): string =>
  String(Number(value.toFixed(decimals)));

/** A reading as field text — blank when there is no reading, never "null". */
export const channelText = (value: number | null | undefined, decimals: number): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? ''
    : trimToDecimals(value, decimals);

/**
 * What is wrong with `raw` for this channel, or null when it is usable.
 *
 * Blank is not an error: it means "leave this one alone", which is how a
 * single channel is pinned while the rest keep drifting.
 */
export const validateChannel = (spec: RiskChannelSpec, raw: string): string | null => {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const value = Number(trimmed);
  if (!Number.isFinite(value)) return 'Enter a number.';
  if (value < spec.min || value > spec.max) {
    return `Value must be between ${spec.min} and ${spec.max}.`;
  }
  return null;
};

/**
 * The typed fields as an override, dropping anything blank or unusable.
 *
 * Out-of-range values are dropped rather than clamped. Clamping was the
 * earlier behaviour and it lies to the tester: typing 400 bpm silently solved
 * for 220 and showed a score, so the field appeared to accept a number the
 * engine never saw. A rejected value leaves the channel on its previous
 * reading and the message says why.
 */
export const overrideFromDraft = (draft: Record<string, string>): SensorOverride => {
  const out: SensorOverride = {};
  for (const spec of RISK_CHANNELS) {
    const raw = draft[spec.key];
    if (raw === undefined || raw.trim() === '') continue;
    if (validateChannel(spec, raw) !== null) continue;
    out[spec.key] = Number(raw);
  }
  return out;
};

/** Re-exported so a caller reading bands does not import the engine twice. */
export const LOAD_MAPPING = RISK_CONFIG.LOAD_MAPPING;
