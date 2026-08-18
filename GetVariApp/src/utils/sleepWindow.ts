/**
 * The user's nightly sleep window, and everything that has to respect it.
 *
 * Onboarding asks for an approximate bedtime and wake-up time, and two very
 * different parts of the app depend on the answer:
 *
 *  1. **Notifications.** A hydration nudge at 03:00 is worse than no nudge at
 *     all, so while the window is open the app goes quiet — nothing is
 *     scheduled inside it and nothing is displayed during it. The queue picks
 *     back up at the wake-up time.
 *  2. **Averages.** Hours spent asleep are not hours the user failed to drink
 *     in. Pacing, the "hours since your last drink" gap and the per-hour
 *     average all measure *awake* time, so a full night's sleep doesn't read
 *     as eight hours of neglect the moment the user opens their eyes.
 *
 * Times are stored as local wall-clock "HH:MM" strings rather than instants,
 * because a bedtime is a habit, not a moment: it means 23:00 wherever the user
 * happens to be, and it survives a timezone change without editing.
 */

export interface SleepSchedule {
  /** Local "HH:MM" (24h) the user usually falls asleep. */
  sleepStart: string;
  /** Local "HH:MM" (24h) the user usually wakes up. */
  wakeUp: string;
}

/** Used when the user has not answered yet, or the stored answer is unusable. */
export const DEFAULT_SLEEP_SCHEDULE: SleepSchedule = { sleepStart: '23:00', wakeUp: '07:00' };

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = MINUTES_PER_DAY * MS_PER_MINUTE;
/** Safety stop for the day walk in `asleepMinutesBetween`. */
const MAX_DAYS_SCANNED = 400;

/** Minutes past local midnight for an "HH:MM" string, or null if unparseable. */
export const parseClock = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

/** Minutes past midnight back to "HH:MM", wrapping across day boundaries. */
export const formatClock = (minutes: number): string => {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

/** "23:30" → "11:30 PM". Everything the user reads goes through this. */
export const formatClockLabel = (value: string | number): string => {
  const minutes = typeof value === 'number' ? value : parseClock(value);
  if (minutes === null) return '--:--';
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour24 = Math.floor(wrapped / 60);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(wrapped % 60).padStart(2, '0')} ${hour24 < 12 ? 'AM' : 'PM'}`;
};

/**
 * Coerce whatever was stored into a usable schedule, or null.
 *
 * Accepts the nested `{ sleepSchedule: {...} }` shape written by onboarding as
 * well as the two fields sitting flat on a profile blob, so an older row and a
 * newer one both resolve.
 */
export const normaliseSleepSchedule = (raw: any): SleepSchedule | null => {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw.sleepSchedule && typeof raw.sleepSchedule === 'object' ? raw.sleepSchedule : raw;
  const sleepStart = parseClock(source.sleepStart);
  const wakeUp = parseClock(source.wakeUp);
  if (sleepStart === null || wakeUp === null) return null;
  return { sleepStart: formatClock(sleepStart), wakeUp: formatClock(wakeUp) };
};

/**
 * Length of the nightly window, in minutes.
 *
 * A bedtime later than the wake-up time is the normal case and wraps past
 * midnight. Identical times mean a zero-length window: the user is never
 * treated as asleep, which is the safe reading — it silences nothing.
 */
export const sleepDurationMinutes = (schedule: SleepSchedule): number => {
  const start = parseClock(schedule.sleepStart);
  const end = parseClock(schedule.wakeUp);
  if (start === null || end === null) return 0;
  return (end - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
};

/** Hours the user is up on an ordinary day — the denominator for averages. */
export const awakeHoursPerDay = (schedule: SleepSchedule): number =>
  (MINUTES_PER_DAY - sleepDurationMinutes(schedule)) / 60;

const minutesOfDay = (date: Date): number => date.getHours() * 60 + date.getMinutes();

/** Whether `at` falls inside the sleep window. */
export const isAsleepAt = (schedule: SleepSchedule, at: Date | number = Date.now()): boolean => {
  const start = parseClock(schedule.sleepStart);
  const end = parseClock(schedule.wakeUp);
  if (start === null || end === null || start === end) return false;

  const minute = minutesOfDay(at instanceof Date ? at : new Date(at));
  return start < end
    ? minute >= start && minute < end
    : minute >= start || minute < end; // wraps past midnight
};

/** Timestamp of the wake-up time at or after `fromMs`. */
const wakeUpOnOrAfter = (schedule: SleepSchedule, fromMs: number): number => {
  const wakeMinutes = parseClock(schedule.wakeUp) ?? 0;
  const wake = new Date(fromMs);
  wake.setHours(Math.floor(wakeMinutes / 60), wakeMinutes % 60, 0, 0);
  if (wake.getTime() <= fromMs) wake.setDate(wake.getDate() + 1);
  return wake.getTime();
};

/**
 * `fromMs` itself when the user is awake then, otherwise the moment they wake.
 *
 * This is what moves a reminder out of the night rather than dropping it: a
 * slot that lands at 02:00 comes back as 07:00.
 */
export const nextAwakeAt = (schedule: SleepSchedule, fromMs: number): number =>
  isAsleepAt(schedule, fromMs) ? wakeUpOnOrAfter(schedule, fromMs) : fromMs;

/** Timestamp of the most recent wake-up at or before `nowMs`. */
export const lastWakeUpAt = (schedule: SleepSchedule, nowMs: number = Date.now()): number => {
  const wakeMinutes = parseClock(schedule.wakeUp) ?? 0;
  const wake = new Date(nowMs);
  wake.setHours(Math.floor(wakeMinutes / 60), wakeMinutes % 60, 0, 0);
  if (wake.getTime() > nowMs) wake.setDate(wake.getDate() - 1);
  return wake.getTime();
};

/** Minutes of `[fromMs, toMs]` that fall inside the nightly window. */
export const asleepMinutesBetween = (
  schedule: SleepSchedule,
  fromMs: number,
  toMs: number
): number => {
  const start = Math.min(fromMs, toMs);
  const end = Math.max(fromMs, toMs);
  const durationMinutes = sleepDurationMinutes(schedule);
  if (end <= start || durationMinutes === 0) return 0;

  const sleepMinutes = parseClock(schedule.sleepStart) ?? 0;
  // Start a day early: the night that began yesterday can still overlap a
  // range that starts just after midnight.
  const firstDay = new Date(start);
  firstDay.setHours(0, 0, 0, 0);
  firstDay.setDate(firstDay.getDate() - 1);

  const days = Math.min(MAX_DAYS_SCANNED, Math.ceil((end - start) / MS_PER_DAY) + 2);
  let overlapMs = 0;

  for (let day = 0; day <= days; day++) {
    const midnight = new Date(firstDay);
    midnight.setDate(firstDay.getDate() + day);
    const nightStart = midnight.getTime() + sleepMinutes * MS_PER_MINUTE;
    const nightEnd = nightStart + durationMinutes * MS_PER_MINUTE;
    overlapMs += Math.max(0, Math.min(end, nightEnd) - Math.max(start, nightStart));
  }

  return overlapMs / MS_PER_MINUTE;
};

/** Minutes of `[fromMs, toMs]` the user was up for. */
export const awakeMinutesBetween = (
  schedule: SleepSchedule,
  fromMs: number,
  toMs: number
): number => {
  const span = Math.abs(toMs - fromMs) / MS_PER_MINUTE;
  return Math.max(0, span - asleepMinutesBetween(schedule, fromMs, toMs));
};

/** `awakeMinutesBetween` in hours — the unit the risk engine speaks. */
export const awakeHoursBetween = (
  schedule: SleepSchedule,
  fromMs: number,
  toMs: number
): number => awakeMinutesBetween(schedule, fromMs, toMs) / 60;

/** Daily goal spread over waking hours only. */
export const mlPerAwakeHour = (targetMl: number, schedule: SleepSchedule): number => {
  const hours = awakeHoursPerDay(schedule);
  return hours > 0 ? targetMl / hours : targetMl / 24;
};

/**
 * How much of the daily goal an evenly paced day would have covered by now,
 * counting only the waking hours since this morning's wake-up. During the
 * night it reads as the full goal — the day is over, not behind.
 */
export const expectedMlByNow = (
  targetMl: number,
  schedule: SleepSchedule,
  nowMs: number = Date.now()
): number => {
  const awakeSoFar = awakeMinutesBetween(schedule, lastWakeUpAt(schedule, nowMs), nowMs);
  const awakeTotal = awakeHoursPerDay(schedule) * 60;
  if (awakeTotal <= 0) return targetMl;
  return Math.round(Math.min(1, awakeSoFar / awakeTotal) * targetMl);
};

/** "11:00 PM – 7:00 AM · 8h" for the profile and onboarding summaries. */
export const describeSleepWindow = (schedule: SleepSchedule): string => {
  const hours = sleepDurationMinutes(schedule) / 60;
  const rounded = Math.round(hours * 10) / 10;
  return `${formatClockLabel(schedule.sleepStart)} – ${formatClockLabel(schedule.wakeUp)} · ${rounded}h`;
};

export default {
  DEFAULT_SLEEP_SCHEDULE,
  parseClock,
  formatClock,
  formatClockLabel,
  normaliseSleepSchedule,
  sleepDurationMinutes,
  awakeHoursPerDay,
  isAsleepAt,
  nextAwakeAt,
  lastWakeUpAt,
  asleepMinutesBetween,
  awakeMinutesBetween,
  awakeHoursBetween,
  mlPerAwakeHour,
  expectedMlByNow,
  describeSleepWindow,
};
