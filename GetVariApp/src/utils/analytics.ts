import type { HydrationLog } from '../types';

/**
 * The numbers behind the Analytics tab: daily totals, the streak, the week at
 * a glance and the time-of-day rhythm. Pure functions over the log rows, so
 * they are tested without a device or a backend.
 *
 * Days are *local* calendar days. Grouping by the ISO string's date part — as
 * the rolling average does — files an evening drink in India under the next
 * UTC day, which would break a streak the user actually kept.
 */

export interface DayTotal {
  /** Local midnight of the day, in ms. */
  start: number;
  /** "Mon", "Tue", ... */
  label: string;
  /** Day of the month, for the calendar. */
  dayOfMonth: number;
  totalMl: number;
  entries: number;
  /** Whether the day's total reached the goal. */
  goalMet: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** When the drink was actually had: the backdated time if there is one. */
const intakeTime = (log: HydrationLog): number =>
  new Date(log.reportedAt ?? log.timestamp).getTime();

/**
 * One entry per day for the last `days` days, oldest first, today last.
 * Days with nothing logged are present with a zero total, so charts keep a
 * fixed number of slots.
 */
export const dailyTotals = (
  logs: HydrationLog[],
  days: number,
  targetMl: number | null,
  now: number = Date.now()
): DayTotal[] => {
  const today = startOfDay(now);
  const result: DayTotal[] = [];
  for (let i = days - 1; i >= 0; i--) {
    // Stepped with setDate, not by DAY_MS, so a DST change cannot skip a day.
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    result.push({
      start: d.getTime(),
      label: WEEKDAYS[d.getDay()],
      dayOfMonth: d.getDate(),
      totalMl: 0,
      entries: 0,
      goalMet: false,
    });
  }

  const index = new Map(result.map((day, i) => [day.start, i]));
  for (const log of logs) {
    const at = intakeTime(log);
    if (!Number.isFinite(at)) continue;
    const slot = index.get(startOfDay(at));
    if (slot === undefined) continue;
    result[slot].totalMl += Number(log.amountMl) || 0;
    result[slot].entries += 1;
  }

  for (const day of result) {
    day.goalMet = targetMl !== null && targetMl > 0 && day.totalMl >= targetMl;
  }
  return result;
};

export interface StreakInfo {
  /** Consecutive logged days ending today (or yesterday, if today is empty). */
  current: number;
  /** The longest run inside the days given. */
  best: number;
  /** Whether anything has been logged today. */
  todayLogged: boolean;
  /**
   * Local midnight of the best run's first and last day, or null when there
   * is no run at all.
   *
   * "Best: 5 days" on its own is a number the user cannot check or place —
   * they have no way to tell *which* five, or whether it was last week or in
   * March. The window is carried so the card can name the dates.
   *
   * The *earliest* longest run wins a tie, so the answer does not change as
   * later days are added: a second equally long run should not silently
   * relabel the record.
   */
  bestStart: number | null;
  bestEnd: number | null;
}

/**
 * The logging streak over `days` (oldest first, today last).
 *
 * ## Why this counts days logged, not days the goal was met
 *
 * It used to count `goalMet`, and `goalMet` is decided by comparing every
 * historical day against *today's* target — the only one the app has. Once
 * the daily goal settled around 4.5 L that retroactively marked almost every
 * past day a failure, and a user with weeks of diligent logging was shown a
 * streak of 0. The comparison was never sound: a day on which someone met a
 * 3,000 ml goal did not stop being a success because the goal later rose.
 *
 * Counting days with at least one entry is a smaller claim and an honest one.
 * It measures the habit the app can actually observe and actually wants —
 * that the user keeps logging — and it does not silently re-judge the past
 * every time the goal moves. The goal-versus-actual comparison still exists,
 * on the weekly stats and the chart's goal line, where it is shown against
 * the day it belongs to rather than rolled into a single number.
 *
 * Today only extends the streak once something is logged; until then the
 * count runs back from yesterday, so a user opening the app at 9 AM does not
 * see their streak reset for a day that is not over.
 */
export const computeStreak = (days: DayTotal[]): StreakInfo => {
  const logged = (day: DayTotal): boolean => day.entries > 0;

  let best = 0;
  let run = 0;
  let bestStart: number | null = null;
  let bestEnd: number | null = null;

  for (let i = 0; i < days.length; i++) {
    run = logged(days[i]) ? run + 1 : 0;
    // Strictly greater, so the *earliest* longest run is kept. With `>=` a
    // later run of equal length would take the title and the dates shown
    // under "Best" would move for no reason the user did anything to cause.
    if (run > best) {
      best = run;
      bestEnd = days[i].start;
      bestStart = days[i - run + 1].start;
    }
  }

  const todayLogged = days.length > 0 && logged(days[days.length - 1]);
  let current = 0;
  for (let i = days.length - (todayLogged ? 1 : 2); i >= 0; i--) {
    if (!logged(days[i])) break;
    current += 1;
  }
  return { current, best, todayLogged, bestStart, bestEnd };
};

export interface WeekSummary {
  totalMl: number;
  /** Average over the days of the week, zeros included. */
  averageMl: number;
  daysMet: number;
  bestDay: DayTotal | null;
  /** Percentage change of the total against the week before, or null. */
  changeVsLastWeek: number | null;
}

/**
 * The last 7 days, compared with the 7 before them. Needs at least 7 days;
 * with 14 or more the comparison is filled in.
 */
export const weekSummary = (days: DayTotal[]): WeekSummary => {
  const week = days.slice(-7);
  const previous = days.length >= 14 ? days.slice(-14, -7) : null;
  const totalMl = week.reduce((sum, day) => sum + day.totalMl, 0);
  const bestDay = week.reduce<DayTotal | null>(
    (best, day) => (day.totalMl > (best?.totalMl ?? 0) ? day : best),
    null
  );

  let changeVsLastWeek: number | null = null;
  if (previous) {
    const prevTotal = previous.reduce((sum, day) => sum + day.totalMl, 0);
    if (prevTotal > 0) changeVsLastWeek = Math.round(((totalMl - prevTotal) / prevTotal) * 100);
  }

  return {
    totalMl,
    averageMl: week.length ? Math.round(totalMl / week.length) : 0,
    daysMet: week.filter(day => day.goalMet).length,
    bestDay,
    changeVsLastWeek,
  };
};

/**
 * Millilitres by hour of day (24 buckets) over the logs given, for the
 * "drinking rhythm" clock.
 */
export const hourlyRhythm = (logs: HydrationLog[], sinceMs: number = 0): number[] => {
  const buckets = new Array(24).fill(0);
  for (const log of logs) {
    const at = intakeTime(log);
    if (!Number.isFinite(at) || at < sinceMs) continue;
    buckets[new Date(at).getHours()] += Number(log.amountMl) || 0;
  }
  return buckets;
};

/** "2.4 L" at a litre or more, "850 ml" below. */
export const formatVolume = (ml: number): string =>
  ml >= 1000 ? `${(ml / 1000).toFixed(1)} L` : `${Math.round(ml)} ml`;

export { DAY_MS };
