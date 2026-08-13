/**
 * Recognises "please log this water" messages typed straight into the chat.
 *
 * Logging must never depend on a reminder tap, so every free-typed message is
 * checked here before it is forwarded to the AI backend. The detector is
 * deliberately conservative: hydration *questions* ("should I drink 3 litres a
 * day?") must still reach the AI rather than being written to the database.
 */

import { matchIntake } from './parseIntake';

/** Explicit "put this in my log" verbs — unambiguous even in question form. */
const COMMAND_VERBS = /\b(log|logged|logging|record|recorded|save|saved|track|note|enter|add|added|update)\b/i;

/** The subset of the above that stays a logging request inside a question. */
const EXPLICIT_LOG_VERBS = /\b(log|logged|logging|record|recorded|save|saved|track)\b/i;

/** Past-tense consumption reports — only trusted outside of questions. */
const CONSUMPTION_VERBS =
  /\b(drank|drunk|had|finished|consumed|sipped|gulped|downed|polished off)\b/i;

/** Words that make an amount-only message a hydration amount. */
const WATER_NOUNS = /\b(water|intake|hydration|fluids?|drinks?)\b/i;

const INTERROGATIVE_START =
  /^\s*(how|what|what's|whats|why|when|where|which|who|should|shall|can|could|would|will|is|are|am|do|does|did|tell me|explain)\b/i;

/** "500 ml", "1.5 litres", "2L of water" and nothing else. */
const AMOUNT_ONLY =
  /^\s*(?:just\s+)?(\d+(?:\.\d+)?)\s*(ml|mls|l|lt|ltrs?|lit(?:er|re)s?|milli\s?lit(?:er|re)s?|glass(?:es)?|cups?|bottles?)\s*(?:of\s+water)?\s*[.!]?\s*$/i;

/** True for messages the AI should answer rather than treat as an amount. */
export const looksLikeQuestion = (text: string): boolean =>
  text.includes('?') || INTERROGATIVE_START.test(text);

export interface HydrationLogIntent {
  /** True when the message is asking for an intake entry to be written. */
  isLogRequest: boolean;
  /** The amount to log, or null when the user still has to be asked. */
  amountMl: number | null;
}

const NO_INTENT: HydrationLogIntent = { isLogRequest: false, amountMl: null };

export const detectHydrationLogIntent = (text: string): HydrationLogIntent => {
  const trimmed = text.trim();
  if (!trimmed) return NO_INTENT;

  const isQuestion = trimmed.includes('?') || INTERROGATIVE_START.test(trimmed);
  const hasCommandVerb = COMMAND_VERBS.test(trimmed);
  const hasExplicitLogVerb = EXPLICIT_LOG_VERBS.test(trimmed);
  const hasConsumptionVerb = CONSUMPTION_VERBS.test(trimmed);

  // A question only counts as a logging request when it explicitly asks for a
  // log ("can you log 500 ml for me?"), never on a bare "add"/"had".
  const verbAllows = isQuestion
    ? hasExplicitLogVerb
    : hasCommandVerb || hasConsumptionVerb;

  const match = matchIntake(trimmed);
  const isAmountOnly = AMOUNT_ONLY.test(trimmed);

  if (match?.hasUnit && (verbAllows || isAmountOnly)) {
    return { isLogRequest: true, amountMl: match.amountMl };
  }

  // "log my water" — intent is clear, the amount still has to be asked for.
  if (!match && hasExplicitLogVerb && WATER_NOUNS.test(trimmed) && !isQuestion) {
    return { isLogRequest: true, amountMl: null };
  }

  return NO_INTENT;
};

export default detectHydrationLogIntent;
