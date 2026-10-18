/**
 * The day's Final Daily Target as stored on a profile row, and the local-day
 * key it is stored under. Pure, so the app and the admin panel read it the
 * same way.
 */

/**
 * The device's local calendar date.
 *
 * Built from the local getters rather than `toISOString().split('T')[0]`,
 * which is UTC and would roll the day over mid-evening or mid-morning.
 */
export const localDateKey = (at: Date = new Date()): string => {
  const month = `${at.getMonth() + 1}`.padStart(2, '0');
  const day = `${at.getDate()}`.padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
};

/**
 * The capped Final Daily Target stored on the profile (`profile.dailyTarget`)
 * by the app — never the Adjusted Total.
 */
export interface StoredDailyTarget {
  /** The local calendar date it was computed for, YYYY-MM-DD. */
  date: string;
  finalTargetMl: number;
  adjustedTotalMl: number;
  upperLimitMl: number;
  /**
   * The device's offset from UTC when it wrote this, in minutes east (IST is
   * 330). `date` is a *local* date, so this is what says which day it means —
   * and it is how the admin panel, running in another zone, finds the
   * user's midnight and wall clock. Absent on rows written before it existed.
   */
  utcOffsetMinutes?: number;
}

/** The device's current offset from UTC, in minutes east. */
export const localUtcOffsetMinutes = (at: Date = new Date()): number => -at.getTimezoneOffset();

/** Today's stored Final Daily Target on a profile blob, or null. */
export const storedTargetForToday = (profile: any, today: string = localDateKey()): number | null => {
  const stored = profile?.dailyTarget;
  const target = Number(stored?.finalTargetMl);
  return stored?.date === today && Number.isFinite(target) && target > 0 ? target : null;
};
