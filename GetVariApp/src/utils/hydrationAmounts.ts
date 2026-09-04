/**
 * The amounts offered as one-tap shortcuts.
 *
 * One list, used by both the home screen's quick-log sheet and the chat's
 * quick replies, so the two can never drift into offering different amounts.
 * `label` doubles as the text the chat feeds back through the intake parser,
 * which is why it is phrased the way a person would type it.
 */

import AppConfigStore from '../config/appConfigStore';

export interface QuickAmount {
  ml: number;
  /** "250 ml" — also parseable by `parseIntakeMl`. */
  label: string;
  /** The everyday object the amount corresponds to. */
  caption: string;
  /** Marks the amount most people reach for, highlighted in the UI. */
  primary?: boolean;
}

/** Everyday objects the amounts correspond to, by size. */
const CAPTION_BANDS: { maxMl: number; caption: string }[] = [
  { maxMl: 300, caption: 'A glass' },
  { maxMl: 600, caption: 'A bottle' },
  { maxMl: 1100, caption: 'A large bottle' },
  { maxMl: Infinity, caption: 'A jug' },
];

const captionFor = (ml: number): string =>
  CAPTION_BANDS.find(band => ml <= band.maxMl)?.caption ?? 'A serving';

/**
 * The amounts on offer right now, from the admin config.
 *
 * A function rather than a constant: the config arrives from the network after
 * the module is first imported, and a captured array would pin the app to the
 * amounts it booted with. Callers read it during render, which is cheap — the
 * list is four items long.
 */
export const quickLogAmounts = (): QuickAmount[] =>
  AppConfigStore.current().quickLogAmounts.map(amount => ({
    ml: amount.ml,
    label: amount.label,
    caption: captionFor(amount.ml),
    primary: amount.primary,
  }));

/**
 * The shipped amounts, for the handful of call sites that need a value rather
 * than a call. Prefer `quickLogAmounts()`, which follows the admin config.
 */
export const QUICK_LOG_AMOUNTS: QuickAmount[] = quickLogAmounts();

export default quickLogAmounts;
