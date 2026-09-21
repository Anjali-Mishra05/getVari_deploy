/**
 * What a notification is allowed to say, and how it says it.
 *
 * ## Hedged language is a correctness rule here, not a style preference
 *
 * The focus and cognitive notifications are *forecasts*. FDI and CDI are
 * indices built from dehydration load, time since significant motion, heat,
 * humidity and the circadian curve — none of which measures the user's
 * attention. They say a drop is plausible, never that one is coming. So every
 * sentence this module produces is hedged with "may" or "could", and
 * `assertHedged` fails the build's tests if "will" or "would" ever appears in
 * a body the user can read. A health notification that overstates what the app
 * knows is the one kind of wrong the user cannot check for themselves.
 *
 * ## Why the risk score travels with every message
 *
 * A nudge without a number is a nag: "drink some water" is advice the user has
 * already heard, and they have no way to tell a routine reminder from one the
 * engine raised because their risk is climbing. The 0-100 hydration risk score
 * is the one figure that separates those, so it is appended to every
 * notification that has one — and left off entirely when the engine reports
 * "Insufficient Data", because a zero there is a lie rather than a low score.
 */

/** The risk engine's verdict at the moment a notification is built. */
export interface RiskContext {
  /** 0-100, or null for "Insufficient Data". */
  riskScore?: number | null;
  /** The band for that score, e.g. "High Risk". */
  riskStatus?: string | null;
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * "Hydration risk 62 · High Risk", or null when there is no score to state.
 *
 * The band is printed with the number because "62" alone means nothing to
 * someone who has not memorised the scale, and the two together are what the
 * dashboard shows — a notification that disagrees with the screen behind it
 * teaches the user to distrust both.
 */
export const describeRisk = (context: RiskContext = {}): string | null => {
  if (!isNumber(context.riskScore)) return null;
  const score = `Hydration risk ${Math.round(context.riskScore)}`;
  return context.riskStatus ? `${score} · ${context.riskStatus}` : score;
};

/** Appends the risk line to a body, or returns the body unchanged. */
export const withRisk = (body: string, context: RiskContext = {}): string => {
  const risk = describeRisk(context);
  return risk ? `${body} ${risk}.` : body;
};

/* ------------------------------------------------------------------ *
 * Focus and cognitive forecasts
 * ------------------------------------------------------------------ */

/** The FDI/CDI band a notification is being raised for. */
export type DropSeverity = 'early' | 'severe';

/** Which index is talking. */
export type DropKind = 'focus' | 'cognitive';

/**
 * The lead times the forecast is rounded to, in minutes.
 *
 * Round numbers on purpose. The index is a proxy and the projection below is a
 * proxy on top of it, so "in the next 27 minutes" would dress a rough estimate
 * up as a measurement; a user reading "30 minutes" understands the size of the
 * claim being made.
 */
export const LEAD_TIMES_MIN = [15, 30, 45, 60] as const;

/** Where each band ends, so the projection knows what it is counting down to. */
const EARLY_EDGE = 25;
const SEVERE_EDGE = 60;

/**
 * How long until the next stage could be reached, in minutes.
 *
 * There is no rate of change to integrate — the engine sees one sample per
 * tick and the indices are not stored as a series — so distance to the next
 * band edge stands in for it: the closer the index already is, the less has to
 * accumulate before it crosses, and the sooner the drop could show up. A score
 * already in the top band has no higher edge to cross, so it reports the
 * shortest lead time rather than an invented one.
 *
 * This is exactly why the copy says "may" and never "will".
 */
export const projectDropMinutes = (score: number, severity: DropSeverity): number => {
  if (!isNumber(score)) return LEAD_TIMES_MIN[LEAD_TIMES_MIN.length - 1];
  // In the top band the drop is not a forecast any more, it is the reading.
  if (severity === 'severe') return LEAD_TIMES_MIN[0];

  const margin = SEVERE_EDGE - Math.max(EARLY_EDGE, score);
  if (margin <= 5) return 15;
  if (margin <= 15) return 30;
  if (margin <= 25) return 45;
  return 60;
};

export interface DropNotice {
  title: string;
  body: string;
  /** The lead time stated in the body, exposed so tests can pin it. */
  leadMinutes: number;
}

/** Titles are the engine's trigger identity, so they are fixed strings. */
const TITLES: Record<DropKind, Record<DropSeverity, string>> = {
  focus: { early: '🧭 Focus Slipping', severe: '🚨 Focus Alert' },
  cognitive: {
    early: '💧 Cognitive Decline Risk',
    severe: '⚠️ Priority Alert',
  },
};

/**
 * The longest a focus or cognitive notification body may be, in words.
 * Short enough to read in full on a lock screen, risk score included.
 */
export const MAX_DROP_NOTICE_WORDS = 15;

/** The forecast clause — the part the user reads first. */
const FORECASTS: Record<DropKind, Record<DropSeverity, (minutes: number) => string>> = {
  focus: {
    early: minutes => `Focus may slip within ${minutes} min.`,
    severe: minutes => `Focus could drop sharply within ${minutes} min.`,
  },
  cognitive: {
    early: minutes => `Sharpness may dip within ${minutes} min.`,
    severe: minutes => `Thinking could be affected within ${minutes} min.`,
  },
};

/** What to do about it. Suggestions, in the same hedged register. */
const ACTIONS: Record<DropKind, Record<DropSeverity, string>> = {
  focus: {
    early: 'Sip water and fix your posture.',
    severe: 'Drink 250–500 ml now.',
  },
  cognitive: {
    early: 'Drink fluids and find somewhere cooler.',
    severe: 'Hydrate and cool down now.',
  },
};

/** Words in a notification body, counted on whitespace. */
export const countWords = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length;

/** Trims a body to `max` words, as a backstop if the copy above grows. */
const capWords = (text: string, max: number): string => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(' ');
  return `${words.slice(0, max).join(' ').replace(/[.,;:·]+$/, '')}.`;
};

/**
 * The full notification for an FDI or CDI band, at most
 * `MAX_DROP_NOTICE_WORDS` words.
 *
 * Ordered forecast → risk score → suggestion: what may happen, the number the
 * app is saying it from, and the one thing that could change it. The score
 * is the bare number ("Risk 62.") to fit the word limit.
 */
export const buildDropNotice = (
  kind: DropKind,
  severity: DropSeverity,
  indexScore: number,
  context: RiskContext = {}
): DropNotice => {
  const leadMinutes = projectDropMinutes(indexScore, severity);
  const forecast = FORECASTS[kind][severity](leadMinutes);
  const risk = isNumber(context.riskScore) ? ` Risk ${Math.round(context.riskScore)}.` : '';
  const body = capWords(
    `${forecast}${risk} ${ACTIONS[kind][severity]}`,
    MAX_DROP_NOTICE_WORDS
  );

  return { title: TITLES[kind][severity], body, leadMinutes };
};

/* ------------------------------------------------------------------ *
 * The hedging rule, as something that can fail
 * ------------------------------------------------------------------ */

/**
 * Words that claim certainty the engine does not have.
 *
 * Matched on word boundaries so "willing" or "wound" are left alone, and
 * case-insensitively so a sentence-initial "Will" is caught too.
 */
const FORBIDDEN = /\b(will|won't|would|wouldn't|guarantee[sd]?|definitely|certainly)\b/i;

/**
 * Whether a body is safe to send, by the rule above.
 *
 * Exported so the message table can be swept in a test rather than reviewed by
 * eye: the table is edited far more often than this module is, and "we only
 * use may and could" is the kind of rule that survives exactly as long as
 * nobody is in a hurry.
 */
export const isHedged = (text: string): boolean => !FORBIDDEN.test(text);

/** The offending word, for a test failure that names what it found. */
export const unhedgedWord = (text: string): string | null => FORBIDDEN.exec(text)?.[0] ?? null;
