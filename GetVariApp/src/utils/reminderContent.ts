/**
 * What a hydration reminder actually says.
 *
 * The reminder had one fixed line — "Time to hydrate! Please drink some water
 * to stay hydrated." — on every delivery, twelve times a day. It said nothing
 * the user did not already know, which is most of why a reminder becomes
 * something to swipe away rather than answer. This turns each delivery into a
 * statement about *this* user right now: how long since they last drank, where
 * today's total stands against their goal, and what the risk engine makes of
 * it.
 *
 * ## Why this is a pure function
 *
 * Every number it prints has to be true at the moment the notification is
 * posted, and the gathering of those numbers is I/O that can partly fail — a
 * Supabase read times out, a profile has no goal because the physician limit
 * is missing, the wearable has never reported. Keeping the wording separate
 * from the fetching is what lets every one of those partial states be asserted
 * directly, rather than inferred from a notification nobody can observe.
 *
 * ## Nothing is stated that is not known
 *
 * A wrong number on a health notification is worse than no number: the user
 * cannot check it, and the shade gives no room to qualify it. So every field
 * is optional, each line appears only when its input is real, and the generic
 * line is what remains when nothing is. In particular a `null` risk score —
 * what the engine returns as "Insufficient Data" — prints nothing at all
 * rather than a zero or a dash.
 */

/** Everything known about the user at the moment a reminder is posted. */
export interface ReminderFacts {
  /** Hours since the last logged drink, or null when nothing is logged yet. */
  hoursSinceDrink?: number | null;
  /** Millilitres logged so far today. */
  totalMl?: number | null;
  /**
   * The daily goal, or null when there is not one to state — a fluid-restricted
   * profile with no physician limit on file. Progress is left out entirely
   * there rather than measured against a number the app refuses to invent.
   */
  targetMl?: number | null;
  /** The risk engine's 0-100 score, or null for "Insufficient Data". */
  riskScore?: number | null;
  /** The engine's band for that score, e.g. "High Risk". */
  riskStatus?: string | null;
}

export interface ReminderContent {
  title: string;
  body: string;
}

/** The line used when nothing specific is known — the old fixed reminder. */
export const GENERIC_REMINDER_BODY =
  'Time to hydrate! Please drink some water to stay hydrated.';

export const REMINDER_TITLE = '💧 Hydration';

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * "3h since your last drink" — the single most relevant fact for a reminder,
 * and the one channel the risk engine has no historical fallback for.
 *
 * Rounded down to whole hours above one, because "2.7 hours" reads as a
 * measurement and "2h" reads as a fact; below an hour it is stated in minutes,
 * where the precision is genuinely useful.
 */
const describeGap = (hours: number): string => {
  const minutes = Math.round(hours * 60);
  if (minutes < 1) return 'Just logged a drink';
  if (minutes < 60) return `${minutes} min since your last drink`;
  const wholeHours = Math.floor(hours);
  return `${wholeHours}h since your last drink`;
};

/** "750 / 3000 ml — 2250 ml to go", or just the total when there is no goal. */
const describeProgress = (totalMl: number, targetMl: number | null): string => {
  if (!isNumber(targetMl) || targetMl <= 0) return `${Math.round(totalMl)} ml logged today`;

  const remaining = Math.round(targetMl - totalMl);
  const progress = `${Math.round(totalMl)} / ${Math.round(targetMl)} ml`;
  // Meeting the goal is worth saying outright — a reminder that keeps counting
  // down past zero is the app failing to notice the user succeeded.
  return remaining <= 0 ? `${progress} — goal reached` : `${progress} — ${remaining} ml to go`;
};

/**
 * The reminder's title and body from what is currently known.
 *
 * Facts are ordered by how much they should change what the user does next:
 * the gap since the last drink first, then today's standing, then the risk
 * band as context for both. Joined with a middle dot so the whole thing reads
 * on the single line Android gives a collapsed notification, with the same
 * text expanding into the BigText style.
 */
export const buildReminderContent = (facts: ReminderFacts = {}): ReminderContent => {
  const parts: string[] = [];

  if (isNumber(facts.hoursSinceDrink) && facts.hoursSinceDrink >= 0) {
    parts.push(describeGap(facts.hoursSinceDrink));
  }

  if (isNumber(facts.totalMl) && facts.totalMl >= 0) {
    parts.push(describeProgress(facts.totalMl, facts.targetMl ?? null));
  }

  // The score is context, not an instruction, so it is last and it is only
  // ever shown with its band — "68" alone means nothing to a user who has not
  // memorised the scale.
  if (isNumber(facts.riskScore) && facts.riskStatus) {
    parts.push(`Risk ${Math.round(facts.riskScore)} · ${facts.riskStatus}`);
  }

  return {
    title: REMINDER_TITLE,
    body: parts.length > 0 ? parts.join(' · ') : GENERIC_REMINDER_BODY,
  };
};

export default buildReminderContent;
