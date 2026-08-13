/**
 * Display helpers for hydration amounts.
 *
 * Chat confirmations quote both the logged amount and the running daily total,
 * so both need to read naturally: small amounts stay in millilitres, anything
 * from a litre up switches to litres.
 */

import type { HydrationLogResult } from '../types';

/** "750 ml" / "1.75 L" — litres from 1000 ml up, trailing zeros trimmed. */
export const formatMl = (ml: number): string => {
  const rounded = Math.round(ml);
  if (rounded < 1000) return `${rounded} ml`;
  const litres = rounded / 1000;
  return `${litres.toFixed(2).replace(/\.?0+$/, '')} L`;
};

/** Fixed two-decimal litres, used for the "x / y" goal pair. */
export const formatLitres = (ml: number): string => `${(Math.round(ml) / 1000).toFixed(2)} L`;

/** "1.75 L / 3.00 L" — the daily progress pair shown after every log. */
export const formatDailyTotal = (totalMl: number, targetMl: number): string =>
  `${formatLitres(totalMl)} / ${formatLitres(targetMl)}`;

/**
 * The confirmation the user sees after an entry is saved — one short line:
 * what was logged, and where the day stands. The closing hydration tip is
 * added by the chat, so it is deliberately not part of this string.
 */
export const buildLogConfirmation = (result: HydrationLogResult): string => {
  const totals = formatDailyTotal(result.totalMl, result.targetMl);
  const headline =
    result.status === 'duplicate'
      ? `**Already logged — ${formatMl(result.amountMl)}.**`
      : `**✅ ${formatMl(result.amountMl)} logged!**`;
  const goal = result.totalMl >= result.targetMl ? ' 🎉 **Goal reached!**' : '';

  return `${headline} Your total today is **${totals}**.${goal}`;
};

export default formatMl;
