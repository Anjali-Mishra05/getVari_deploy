import AsyncStorage from '@react-native-async-storage/async-storage';

import PBWRService, { type PBWRBreakdown } from './PBWRService';
import type { UserProfile } from '../types';

/**
 * The daily hydration goal, decided once per calendar day.
 *
 * ## The goal used to move while the user was looking at it
 *
 * PBWR is a live calculation: Stage 3 feeds it rolling 7-day averages of
 * steps, temperature and humidity, and each of those bands is a step
 * function. Recomputed on every telemetry tick, the goal jumped whenever an
 * average crossed a band edge — the reported "my water requirement is
 * increasing daily", which was really increasing *hourly*. Someone who had
 * drunk 2,000 of 4,000 ml at lunch found themselves at 2,000 of 4,500 by the
 * afternoon, having drunk nothing in between and lost ground for it.
 *
 * A goal is a thing you plan a day around. It has to hold still for the day
 * it describes, so it is computed on the first read of each local day and
 * every later read that day returns the same number.
 *
 * ## And it was two different numbers at once
 *
 * The dashboard called `PBWRService` and showed the live figure; reminders,
 * the chatbot and the admin console read the `targetDailyMl` stored on the
 * profile, which is the same pipeline run with *no* telemetry at all. The two
 * disagreed by hundreds of millilitres on the same day — a notification
 * saying "250 / 4552 ml" beneath a dashboard reading 5,000. Every surface
 * now reads through here, so there is one goal per day and it is the same one
 * everywhere.
 *
 * ## Local days, not UTC
 *
 * The key is the device's own calendar date. A UTC key rolls the goal over
 * mid-evening for users west of Greenwich and mid-morning for users east of
 * it, which is a goal that resets in the middle of the day it belongs to.
 */

const STORAGE_KEY = 'getvari_daily_target';

/** What is remembered for the day. */
interface LockedTarget {
  /** The local calendar date this was computed for, YYYY-MM-DD. */
  date: string;
  targetMl: number;
  /** The breakdown behind it, so the PBWR card can explain the locked number. */
  breakdown?: PBWRBreakdown;
}

/**
 * The device's local calendar date.
 *
 * Built from the local getters rather than `toISOString().split('T')[0]`,
 * which is UTC and is the bug this exists to avoid.
 */
export const localDateKey = (at: Date = new Date()): string => {
  const month = `${at.getMonth() + 1}`.padStart(2, '0');
  const day = `${at.getDate()}`.padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
};

const readLocked = async (): Promise<LockedTarget | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LockedTarget;
    const target = Number(parsed?.targetMl);
    if (!parsed?.date || !Number.isFinite(target) || target <= 0) return null;
    return { ...parsed, targetMl: target };
  } catch (error) {
    console.warn('[DailyTarget] Could not read the locked target:', error);
    return null;
  }
};

const writeLocked = async (locked: LockedTarget): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(locked));
  } catch (error) {
    console.warn('[DailyTarget] Could not store the locked target:', error);
  }
};

/**
 * Today's goal and the breakdown behind it, computing it if today has none.
 *
 * `waterConsumedMl` only affects the `remaining` field of the breakdown, so
 * it is taken fresh on every call while the target itself stays locked.
 */
export const getTodayBreakdown = async (
  profile: UserProfile,
  waterConsumedMl: number,
  userId?: string
): Promise<PBWRBreakdown> => {
  const today = localDateKey();
  const locked = await readLocked();

  const breakdown = await PBWRService.calculatePBWR(profile, waterConsumedMl, userId);

  // Today already has a number: keep it, whatever the live pipeline now says.
  // The rest of the breakdown is still the current one — it is what the PBWR
  // card explains, and explaining yesterday's inputs would be worse than
  // explaining a total that no longer sums exactly to the locked figure.
  if (locked && locked.date === today) {
    return {
      ...breakdown,
      finalTarget: locked.targetMl,
      remaining: Math.max(0, locked.targetMl - (Number(waterConsumedMl) || 0)),
    };
  }

  await writeLocked({ date: today, targetMl: breakdown.finalTarget, breakdown });
  return breakdown;
};

/** Today's goal in ml, computing it if today has none. */
export const getTodayTargetMl = async (
  profile: UserProfile,
  userId?: string
): Promise<number> => (await getTodayBreakdown(profile, 0, userId)).finalTarget;

/**
 * Today's goal if one has already been locked, without computing one.
 *
 * For the callers that have no profile to hand and must not fetch one: the
 * background reminder path and `HydrationService`'s totals. They fall back to
 * the profile's stored figure when the app has not run yet today, which is
 * the old behaviour and still the best available answer at that point.
 */
export const peekTodayTargetMl = async (): Promise<number | null> => {
  const locked = await readLocked();
  return locked && locked.date === localDateKey() ? locked.targetMl : null;
};

/**
 * Drops the lock so the next read recomputes.
 *
 * Called when the profile changes — a corrected weight or a new diagnosis is
 * the one case where the user *expects* the goal to move today, and holding
 * yesterday's number after they edited the inputs would read as the edit not
 * having taken.
 */
export const clearLockedTarget = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[DailyTarget] Could not clear the locked target:', error);
  }
};

export const DailyTargetService = {
  getTodayBreakdown,
  getTodayTargetMl,
  peekTodayTargetMl,
  clearLockedTarget,
  localDateKey,
};

export default DailyTargetService;
