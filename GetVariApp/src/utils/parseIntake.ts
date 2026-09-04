/**
 * Parses a free-text water intake description into millilitres.
 *
 * Used by every logging path in the AquaSage chat — the guided reminder flow,
 * the quick-reply buttons and free-typed messages ("I drank 750 ml",
 * "log 1 litre", "add 2L to my intake").
 */

const GLASS_ML = 250;
const BOTTLE_ML = 500;
const MAX_ML = 5000;

const WORD_QUANTITIES: Record<string, number> = {
  a: 1,
  an: 1,
  half: 0.5,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

// Longest words first so "an" is not shadowed by "a" during alternation.
const QUANTITY_WORDS = Object.keys(WORD_QUANTITIES).sort((a, b) => b.length - a.length);
const QUANTITY = `\\b(\\d+(?:\\.\\d+)?|${QUANTITY_WORDS.join('|')})`;

// `g` so every occurrence can be inspected and the earliest one wins.
const UNIT_PATTERNS: { re: RegExp; mlPerUnit: number; specificity: number }[] = [
  { re: new RegExp(`${QUANTITY}\\s*(?:ml|mls|milli\\s?lit(?:er|re)s?)\\b`, 'gi'), mlPerUnit: 1, specificity: 3 },
  { re: new RegExp(`${QUANTITY}\\s*(?:l|lt|ltrs?|lit(?:er|re)s?)\\b`, 'gi'), mlPerUnit: 1000, specificity: 2 },
  { re: new RegExp(`${QUANTITY}\\s*(?:glass(?:es)?|cups?)\\b`, 'gi'), mlPerUnit: GLASS_ML, specificity: 1 },
  { re: new RegExp(`${QUANTITY}\\s*(?:bottles?)\\b`, 'gi'), mlPerUnit: BOTTLE_ML, specificity: 1 },
];

const toQuantity = (raw: string): number | null => {
  const word = WORD_QUANTITIES[raw.toLowerCase()];
  if (word !== undefined) return word;
  const numeric = parseFloat(raw);
  return Number.isFinite(numeric) ? numeric : null;
};

const clamp = (ml: number): number | null => {
  const rounded = Math.round(ml);
  if (rounded <= 0 || rounded > MAX_ML) return null;
  return rounded;
};

export interface IntakeMatch {
  amountMl: number;
  /** True when the text named a unit ("500 ml", "2 glasses") rather than a bare number. */
  hasUnit: boolean;
  /**
   * Whether the user is adding to the day's intake or taking some back.
   *
   * "reduce 4 litres" used to parse as an intake of 4,000ml — the opposite of
   * what was asked — which then tripped the unrealistic-amount check and left
   * the dashboard unchanged. A mis-log has to be correctable.
   */
  direction: 'add' | 'remove';
}

/**
 * Phrases that mean "take this back off today's total".
 *
 * Anchored on the verb rather than matched loosely, so "I drank less than a
 * litre" is still an intake and only an explicit instruction is a correction.
 */
const REMOVE_INTENT =
  /\b(reduce|remove|subtract|deduct|minus|undo|revert|take\s+(?:off|back|out)|cancel|delete|correct|logged?\s+too\s+much|by\s+mistake|wrongly|accidentally)\b/i;

/** True when the message asks for intake to be taken back rather than added. */
export const isRemovalRequest = (text: string): boolean => REMOVE_INTENT.test(text);

/**
 * Finds the intake amount in `text`.
 *
 * When several amounts appear, the earliest one in the sentence wins — that is
 * the one the user led with ("I drank 500 ml, not a litre"). Ties on position
 * are broken by unit specificity so "500 ml" is never read as "500 litres".
 */
export const matchIntake = (text: string): IntakeMatch | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let best: { index: number; specificity: number; amountMl: number } | null = null;

  for (const { re, mlPerUnit, specificity } of UNIT_PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(trimmed)) !== null) {
      const quantity = toQuantity(match[1]);
      if (quantity === null) continue;
      const amountMl = clamp(quantity * mlPerUnit);
      if (amountMl === null) continue;

      const candidate = { index: match.index, specificity, amountMl };
      if (
        !best ||
        candidate.index < best.index ||
        (candidate.index === best.index && candidate.specificity > best.specificity)
      ) {
        best = candidate;
      }
    }
  }

  const direction: 'add' | 'remove' = isRemovalRequest(trimmed) ? 'remove' : 'add';

  if (best) return { amountMl: best.amountMl, hasUnit: true, direction };

  // Bare number with no unit: small counts read as glasses, larger ones as ml.
  // Anything in between is too ambiguous to guess — let the caller re-ask.
  //
  // Normally the *whole* message has to be the number, so "I drank at 500" is
  // not read as 500ml. A correction is the exception: "reduce 500" carries a
  // verb that has already settled what the number is for, so the number is
  // safe to pick out of the sentence.
  const bare =
    direction === 'remove'
      ? trimmed.match(/\b(\d+(?:\.\d+)?)\b/)
      : trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) {
    const quantity = toQuantity(bare[1]);
    if (quantity !== null) {
      if (quantity <= 10) {
        const amountMl = clamp(quantity * GLASS_ML);
        if (amountMl !== null) return { amountMl, hasUnit: false, direction };
      }
      if (quantity >= 50) {
        const amountMl = clamp(quantity);
        if (amountMl !== null) return { amountMl, hasUnit: false, direction };
      }
    }
  }

  return null;
};

export const parseIntakeMl = (text: string): number | null => matchIntake(text)?.amountMl ?? null;

export default parseIntakeMl;
