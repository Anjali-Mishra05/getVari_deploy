import type { HydrationLog, UserProfile } from '../types';
import AppConfigStore from '../config/appConfigStore';
import { climateBandFor } from './hydrationTarget';
import { HydrationRiskEngine } from './hydrationRiskEngine';
import { SleepSchedule, awakeHoursBetween, normaliseSleepSchedule } from './sleepWindow';

/**
 * The deterministic half of the dashboard's risk model, shared by the app and
 * the admin panel.
 *
 * The app's score is a solve over *simulated* readings (see
 * `useHydrationTelemetry`): each channel is pulled toward a baseline derived
 * from the profile — the activity level sets heart rate and movement, the
 * city's climate band sets temperature and humidity — with a little noise on
 * top, and the hydration gap comes from the newest logged entry. None of that
 * is stored anywhere, so the admin panel cannot read the app's number; what it
 * can do is run the same model on the same inputs. Keeping the baseline and
 * the gap here, imported by both, is what stops the two drifting apart.
 *
 * Pure: no React Native, no Supabase, so the admin's web build can import it.
 */

/**
 * Hours to assume since the last drink when the user has logged nothing today.
 * Two hours puts them at the top of the engine's 1-2h band rather than in its
 * worst one, so an empty day reads as "you should drink" and not "critical".
 */
export const NO_LOG_ASSUMED_GAP_HOURS = 2;

/** Ceiling on the hydration gap the engine is asked to score. */
export const MAX_GAP_HOURS = 8;

export interface BaselineReadings {
  heartRate: number;
  activityLoad: number;
  temperature: number;
  humidity: number;
  sweatGSR: number;
  batteryLevel: number;
  rssi: number;
}

/**
 * The readings the simulated stream settles around, for this user.
 *
 * They come from the profile rather than from a fixed set of numbers: the
 * activity band sets the resting heart rate and movement index, and the
 * climate band of the user's resolved city sets the ambient temperature and
 * humidity. That is what makes the dashboard reflect *where the user is* — a
 * profile in Chennai is modelled against Chennai's heat — and it is what makes
 * the documented use cases reproducible instead of landing on a different
 * score every time the screen is opened.
 */
export const baselineReadingsFor = (profile?: UserProfile): BaselineReadings => {
  const config = AppConfigStore.current();
  const activity = config.activityLevels.find(level => level.id === profile?.activityLevel);
  const band = climateBandFor(profile?.location ?? profile?.selectedCity);

  return {
    heartRate: activity?.baselineHeartRate ?? 72,
    activityLoad: activity?.baselineActivityIndex ?? 15,
    temperature: band?.ambientTempC ?? 24,
    humidity: band?.ambientHumidity ?? 50,
    sweatGSR: 2.0,
    batteryLevel: 84,
    rssi: -58,
  };
};

/**
 * Hours between now and the newest entry, or the no-log assumption.
 *
 * Only *waking* hours count. A user who drinks at 22:30, sleeps eight hours
 * and opens the app at 07:15 has not neglected their hydration for nine hours
 * — they were asleep for eight of them, and scoring it that way put every
 * morning at the top of the risk band before the day had started.
 *
 * @param clockShiftMs Moves both instants onto another time zone's wall clock
 *   before the sleep window is applied. The app passes nothing — it is in the
 *   user's zone. The admin panel passes the difference between the user's
 *   zone and its own, so "asleep from 23:00" means the user's 23:00.
 */
export const gapFromLogs = (
  logs: Pick<HydrationLog, 'timestamp'>[],
  schedule: SleepSchedule | null,
  nowMs: number = Date.now(),
  clockShiftMs: number = 0
): number => {
  if (logs.length === 0) return NO_LOG_ASSUMED_GAP_HOURS;
  const newest = logs.reduce((latest, log) =>
    new Date(log.timestamp) > new Date(latest.timestamp) ? log : latest
  );
  const since = new Date(newest.timestamp).getTime();
  const hours = schedule
    ? awakeHoursBetween(schedule, since + clockShiftMs, nowMs + clockShiftMs)
    : (nowMs - since) / 3_600_000;
  return Math.max(0, Math.min(MAX_GAP_HOURS, hours));
};

export interface SteadyStateRisk {
  output: ReturnType<typeof HydrationRiskEngine.solveRisk>;
  readings: BaselineReadings;
  hoursSinceDrink: number;
}

/**
 * The score the dashboard settles on for this profile and these entries.
 *
 * Exactly the app's solve with the noise taken out: the readings at their
 * baseline, the gap from the newest of today's entries, the same profile
 * weights and thresholds. What it cannot include is state that only lives in
 * a running app — the few-percent noise on each reading, the absorption credit
 * the recovery model gives a drink while the dashboard is open, the test
 * panel's pinned values, and the device-damage flag kept on the phone.
 */
export const steadyStateRisk = (
  profile: UserProfile | undefined,
  todayLogs: Pick<HydrationLog, 'timestamp'>[],
  nowMs: number = Date.now(),
  clockShiftMs: number = 0
): SteadyStateRisk => {
  const readings = baselineReadingsFor(profile);
  const hoursSinceDrink = gapFromLogs(
    todayLogs,
    normaliseSleepSchedule(profile),
    nowMs,
    clockShiftMs
  );
  const output = HydrationRiskEngine.solveRisk(
    {
      heartRate: readings.heartRate,
      activityLoad: readings.activityLoad,
      temperature: readings.temperature,
      humidity: readings.humidity,
      timeSinceWaterIntake: hoursSinceDrink,
    },
    profile
  );
  return { output, readings, hoursSinceDrink };
};
