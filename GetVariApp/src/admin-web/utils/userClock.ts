import { localUtcOffsetMinutes } from '../../utils/dailyTargetRecord';

/**
 * A user's wall clock, as seen from the admin's browser.
 *
 * The app draws every day boundary on the phone's own clock — "today" is
 * since the phone's midnight, the stored goal is keyed by the phone's date,
 * the sleep window is in the phone's hours. The admin panel runs somewhere
 * else, so it has to do the same arithmetic in the user's zone or it adds up
 * a different day. The zone comes from the offset the app stamps on its daily
 * target (`profile.dailyTarget.utcOffsetMinutes`); a row written before that
 * existed falls back to the admin's own zone and says so (`known: false`).
 */
export interface UserClock {
  /** Minutes east of UTC. */
  offsetMinutes: number;
  /** False when the app has not reported its zone and this is the admin's. */
  known: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const clockForProfile = (profile: any, nowMs: number = Date.now()): UserClock => {
  const reported = Number(profile?.dailyTarget?.utcOffsetMinutes);
  return Number.isFinite(reported) && profile?.dailyTarget?.utcOffsetMinutes !== undefined
    ? { offsetMinutes: reported, known: true }
    : { offsetMinutes: localUtcOffsetMinutes(new Date(nowMs)), known: false };
};

/**
 * How far to move an instant so the browser's local getters read the user's
 * wall clock. Passed to the shared risk model's sleep-window arithmetic.
 */
export const wallClockShiftMs = (clock: UserClock, atMs: number = Date.now()): number =>
  (clock.offsetMinutes - localUtcOffsetMinutes(new Date(atMs))) * MINUTE_MS;

/** The instant of the user's most recent midnight. */
export const startOfUserDay = (clock: UserClock, atMs: number = Date.now()): number => {
  const wall = atMs + clock.offsetMinutes * MINUTE_MS;
  return Math.floor(wall / DAY_MS) * DAY_MS - clock.offsetMinutes * MINUTE_MS;
};

/** The user's calendar date at `atMs`, YYYY-MM-DD — the app's `localDateKey`. */
export const userDateKey = (clock: UserClock, atMs: number = Date.now()): string =>
  new Date(atMs + clock.offsetMinutes * MINUTE_MS).toISOString().slice(0, 10);

/** "14:05" on the user's clock. */
export const formatUserTime = (clock: UserClock, atMs: number): string =>
  new Date(atMs + clock.offsetMinutes * MINUTE_MS).toISOString().slice(11, 16);

/** "UTC+05:30" — shown next to times so it is clear whose clock they are on. */
export const describeOffset = (clock: UserClock): string => {
  const sign = clock.offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(clock.offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}${clock.known ? '' : ' (admin zone; app has not reported one)'}`;
};
