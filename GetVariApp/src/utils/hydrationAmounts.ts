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
 * The amount to offer pre-selected.
 *
 * A reminder exists to get one number written down, so every surface that logs
 * water starts with an amount already chosen rather than with nothing — the
 * user confirms instead of choosing *and* confirming. The admin config's
 * `primary` flag decides which one; if a published list marks none (or marks
 * several), the first amount wins, so there is always exactly one answer.
 */
export const primaryQuickAmount = (): QuickAmount => {
  const amounts = quickLogAmounts();
  return (
    amounts.find(amount => amount.primary) ??
    amounts[0] ??
    // The config store guarantees a non-empty list, but this is read on the
    // reminder screen — the one surface that appears over a locked phone with
    // no way for the user to retreat from a crash — so it does not rely on
    // that guarantee holding.
    { ml: 500, label: '500 ml', caption: captionFor(500), primary: true }
  );
};

/**
 * The offered amount closest to `ml`, for opening the sheet on a suggestion.
 *
 * The dashboard's water-requirement pill suggests a multiple of 250 ml, which
 * is not guaranteed to be one of the amounts the admin config offers — a
 * three-glass day asks for 750 ml against a 250/500/1000 list. Snapping keeps
 * the sheet's grid as the single source of what can be logged: the suggestion
 * decides which row opens selected, it does not add a row of its own. Ties go
 * to the smaller amount, so a suggestion never opens on more water than it
 * asked for.
 */
export const nearestQuickAmount = (ml: number): QuickAmount => {
  const amounts = quickLogAmounts();
  if (!Number.isFinite(ml) || ml <= 0 || amounts.length === 0) return primaryQuickAmount();

  return amounts.reduce((closest, amount) => {
    const delta = Math.abs(amount.ml - ml);
    const bestDelta = Math.abs(closest.ml - ml);
    if (delta < bestDelta) return amount;
    return delta === bestDelta && amount.ml < closest.ml ? amount : closest;
  });
};

/**
 * The shipped amounts, for the handful of call sites that need a value rather
 * than a call. Prefer `quickLogAmounts()`, which follows the admin config.
 */
export const QUICK_LOG_AMOUNTS: QuickAmount[] = quickLogAmounts();

export default quickLogAmounts;
