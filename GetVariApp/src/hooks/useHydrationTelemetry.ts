import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { HydrationLog, HydrationRiskDetails, SensorData, UserProfile } from '../types';
import { calculateRecoveryEstimation, calculatePredictedRiskAfterDrink } from '../utils/hydrationModel';
import {
  SleepSchedule,
  awakeHoursBetween,
  awakeHoursPerDay,
  isAsleepAt,
  mlPerAwakeHour,
  normaliseSleepSchedule,
} from '../utils/sleepWindow';
import TelemetryHistoryService from '../services/TelemetryHistoryService';
import { AuthService } from '../services/AuthService';
import { HydrationRiskEngine } from '../utils/hydrationRiskEngine';

/**
 * The physiological loop behind the home dashboard.
 *
 * The screen needs more than a stored total: the risk ring, the recovery
 * telemetry and the "predicted risk" shown before a log all read from a live
 * body model. This hook owns that model — a sensor stream, a gut/bloodstream
 * fluid split, and the risk solve over both — so the screen stays a view.
 *
 * Everything here is a *simulation* of the ESP32 stream until real hardware is
 * paired; `applySensorPatch` is the seam a BLE subscription plugs into.
 */

/** Wall-clock gap between simulation steps. */
const TICK_MS = 2000;
/** Simulated minutes advanced per step, matching the web dashboard's pacing. */
const SIM_MINUTES_PER_TICK = 1.2;

/** Stomach capacity used for the absorption gauge. */
export const STOMACH_CAPACITY_ML = 1200;
/** Upper bound of the circulating fluid pool used for the recovery gauge. */
export const ABSORBED_POOL_CAP_ML = 1000;

/** Baseline gastric emptying speed before strain and heat slow it down. */
const BASELINE_ABSORPTION_ML_PER_MIN = 12;
/** Fluid lost to perspiration and respiration at rest. */
const BASELINE_SWEAT_ML_PER_MIN = 1.4;

/** Where the sensor stream starts before the first tick lands. */
const INITIAL_SENSORS: SensorData = {
  heartRate: 55,
  activityLoad: 14,
  temperature: 25.2,
  humidity: 45,
  sweatGSR: 2.0,
  hydrationScore: 0,
  batteryLevel: 84,
  rssi: -58,
  lastUpdated: new Date().toISOString(),
};

/**
 * Hours to assume since the last drink when the user has logged nothing today.
 * Two hours puts them at the top of the engine's 1-2h band rather than in its
 * worst one, so an empty day reads as "you should drink" and not "critical".
 */
const NO_LOG_ASSUMED_GAP_HOURS = 2;

/** Ceiling on the hydration gap the engine is asked to score. */
const MAX_GAP_HOURS = 8;

export interface HydrationTelemetry {
  sensorData: SensorData;
  /** Full risk solve over the current sensors and hydration gap. */
  solvedRisk: HydrationRiskDetails;
  /** Hydration gap the engine actually scored, after absorption credit. */
  effectiveHoursSinceDrink: number;
  /** Swallowed water not yet in the bloodstream, in ml. */
  stomachVolume: number;
  /** Circulating fluid pool, in ml. */
  absorbedHydration: number;
  /** Current gastric emptying speed, ml/min. */
  absorptionRate: number;
  /** Current perspiration + respiration loss, ml/min. */
  sweatLossRate: number;
  /** True while the user's sleep window is open — the app's quiet state. */
  isSleeping: boolean;
  /** Hours the user is awake on an ordinary day, from their sleep window. */
  awakeHoursPerDay: number;
  /** Daily goal spread across waking hours only, ml/h. */
  targetMlPerAwakeHour: number;
  /** Pushes a logged amount into the gut so the recovery model can absorb it. */
  ingestFluid: (amountMl: number) => void;
  /** Seam for a real BLE stream to overwrite simulated readings. */
  applySensorPatch: (patch: Partial<SensorData>) => void;
}

/** Ambient heat stress, 0-100, from temperature and humidity together. */
const heatStress = (temperature: number, humidity: number): number => {
  const tempExcess = Math.max(0, temperature - 22);
  const humidExcess = Math.max(0, humidity - 44);
  return Math.min(100, Math.max(0, tempExcess * 4.5 + humidExcess * 0.4));
};

/** Gastric emptying slows under sympathetic load: strain and heat both cost. */
export const absorptionRateFor = (sensors: SensorData): number => {
  const activity = sensors.activityLoad ?? 14; // Default if missing
  const temperature = sensors.temperature ?? 22;
  const humidity = sensors.humidity ?? 44;

  const activityFactor = Math.min(0.4, (activity / 100) * 0.4);
  const heatFactor = Math.min(0.3, (heatStress(temperature, humidity) / 100) * 0.3);
  const multiplier = Math.max(0.3, 1 - activityFactor - heatFactor);
  return BASELINE_ABSORPTION_ML_PER_MIN * multiplier;
};

/** Perspiration scales with both exertion and the ambient thermal load. */
export const sweatLossRateFor = (sensors: SensorData): number => {
  const activity = sensors.activityLoad ?? 14;
  const temperature = sensors.temperature ?? 22;
  const humidity = sensors.humidity ?? 44;

  return BASELINE_SWEAT_ML_PER_MIN +
    (activity / 100) * 8.6 +
    (heatStress(temperature, humidity) / 100) * 5.0;
};

/**
 * Hours between now and the newest entry, or the no-log assumption.
 *
 * Only *waking* hours count. A user who drinks at 22:30, sleeps eight hours
 * and opens the app at 07:15 has not neglected their hydration for nine hours
 * — they were asleep for eight of them, and scoring it that way put every
 * morning at the top of the risk band before the day had started.
 */
const gapFromLogs = (logs: HydrationLog[], schedule: SleepSchedule | null): number => {
  if (logs.length === 0) return NO_LOG_ASSUMED_GAP_HOURS;
  const newest = logs.reduce((latest, log) =>
    new Date(log.timestamp) > new Date(latest.timestamp) ? log : latest
  );
  const since = new Date(newest.timestamp).getTime();
  const hours = schedule
    ? awakeHoursBetween(schedule, since, Date.now())
    : (Date.now() - since) / 3_600_000;
  return Math.max(0, Math.min(MAX_GAP_HOURS, hours));
};

/**
 * @param profile Onboarding answers. Absent until the profile row loads, which
 *   is fine — the engine falls back to its unweighted defaults.
 * @param logs Today's entries. Their newest timestamp seeds the hydration gap,
 *   so the score is right on the first frame rather than only after a tick.
 */
export const useHydrationTelemetry = (
  profile: UserProfile | undefined,
  logs: HydrationLog[]
): HydrationTelemetry => {
  // The window is read straight off the profile blob, so a user still on an
  // older profile (or one who has not reached that onboarding step) simply
  // gets the previous, sleep-blind behaviour rather than a broken screen.
  const sleepSchedule = useMemo(() => normaliseSleepSchedule(profile), [profile]);

  const [sensorData, setSensorData] = useState<SensorData>(INITIAL_SENSORS);
  const [historicalAverages, setHistoricalAverages] = useState<{ avgHR: number | null; avgSteps: number | null; avgTemp: number | null; avgHumidity: number | null } | null>(null);
  const [isDamaged, setIsDamaged] = useState(false);
  const [stomachVolume, setStomachVolume] = useState(0);
  const [absorbedHydration, setAbsorbedHydration] = useState(180);
  const [effectiveHoursSinceDrink, setEffectiveHoursSinceDrink] = useState(() =>
    gapFromLogs(logs, sleepSchedule)
  );
  const [isSleeping, setIsSleeping] = useState(() =>
    sleepSchedule ? isAsleepAt(sleepSchedule) : false
  );

  // The tick reads current values without re-subscribing every render, which
  // would otherwise restart the interval ~30 times a minute and stall it.
  // The gut volume is a ref as well as state: the step needs to know how much
  // was *actually* drained this tick to credit the gap, and a state updater
  // cannot report that back.
  const sensorRef = useRef(sensorData);
  sensorRef.current = sensorData;
  const stomachRef = useRef(stomachVolume);
  stomachRef.current = stomachVolume;
  const sleepScheduleRef = useRef(sleepSchedule);
  sleepScheduleRef.current = sleepSchedule;

  // A new entry restarts the gap from its real timestamp. Keyed on the newest
  // timestamp so re-fetching the same list does not reset a gap mid-tick.
  const newestLogAt = logs.reduce<string | null>(
    (latest, log) => (latest === null || log.timestamp > latest ? log.timestamp : latest),
    null
  );
  useEffect(() => {
    setEffectiveHoursSinceDrink(gapFromLogs(logs, sleepSchedule));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestLogAt, sleepSchedule]);

  // Sensor stream + physiological step.
  useEffect(() => {
    const interval = setInterval(() => {
      // 1. Sensor drift. A random walk around the current reading, bounded to
      //    survivable ranges so a long session cannot wander into nonsense.
      setSensorData(prev => {
        const heartRate = Math.min(170, Math.max(45, prev.heartRate + Math.round(Math.random() * 4 - 2)));
        const activityLoad = Math.min(100, Math.max(5, prev.activityLoad + Math.round(Math.random() * 6 - 3)));
        const temperature = Number(
          Math.min(41, Math.max(18, prev.temperature + (Math.random() * 0.2 - 0.1))).toFixed(1)
        );
        const humidity = Math.min(95, Math.max(20, prev.humidity + Math.round(Math.random() * 2 - 1)));
        const sweatGSR = Number(
          Math.min(15, Math.max(0.1, prev.sweatGSR + (Math.random() * 0.4 - 0.2))).toFixed(2)
        );

        return {
          ...prev,
          heartRate,
          activityLoad,
          temperature,
          humidity,
          sweatGSR,
          lastUpdated: new Date().toISOString(),
        };
      });

      // 2. Fluid step. Water leaves the gut at the current absorption speed and
      //    enters the circulating pool, which is simultaneously drained by
      //    perspiration.
      const sensors = sensorRef.current;
      const sweatThisTick = sweatLossRateFor(sensors) * SIM_MINUTES_PER_TICK;
      // Only what the gut actually holds can be absorbed, so the credit given
      // to the hydration gap below never exceeds the water really drunk.
      const absorbed = Math.min(
        stomachRef.current,
        absorptionRateFor(sensors) * SIM_MINUTES_PER_TICK
      );

      stomachRef.current = Number(Math.max(0, stomachRef.current - absorbed).toFixed(1));
      setStomachVolume(stomachRef.current);

      setAbsorbedHydration(prev =>
        Number(
          Math.min(ABSORBED_POOL_CAP_ML, Math.max(0, prev + absorbed - sweatThisTick)).toFixed(1)
        )
      );

      // 3. The hydration gap grows with the clock but is bought back by fluid
      //    that has actually been absorbed — 250ml is worth 1.5 hours.
      //
      //    Inside the sleep window the clock term is dropped: the user is not
      //    ignoring a nudge they were never sent, so the night must not push
      //    them into the red. Absorption credit still applies, so a glass
      //    drunk at 3am counts.
      const schedule = sleepScheduleRef.current;
      const asleep = !!schedule && isAsleepAt(schedule);
      setIsSleeping(asleep);

      setEffectiveHoursSinceDrink(prev => {
        const credit = (absorbed / 250) * 1.5;
        const elapsed = asleep ? 0 : SIM_MINUTES_PER_TICK / 60;
        const next = prev + elapsed - credit;
        return Number(Math.max(0, Math.min(MAX_GAP_HOURS, next)).toFixed(2));
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (profile) {
      AuthService.getCurrentUserId().then(uid => {
        if (uid) {
          Promise.all([
            TelemetryHistoryService.getAverages(7, uid, profile),
            TelemetryHistoryService.checkDeviceDamage()
          ]).then(([avgs, damaged]) => {
            setHistoricalAverages({
              avgHR: avgs.avgHR ?? null,
              avgSteps: avgs.avgSteps ?? null,
              avgTemp: avgs.avgTemp ?? null,
              avgHumidity: avgs.avgHumidity ?? null,
            });
            setIsDamaged(damaged);
          });
        }
      });
    }
  }, [profile]);

  const solvedRisk = useMemo(() => {
    const fresh = TelemetryHistoryService.isFresh(sensorData.lastUpdated);

    // 1. Enforce staleness: if data is old, treat it as null for the solve
    const inputs = {
      heartRate: fresh ? sensorData.heartRate : null,
      activityLoad: fresh ? sensorData.activityLoad : null,
      temperature: fresh ? sensorData.temperature : null,
      humidity: fresh ? sensorData.humidity : null,
      timeSinceWaterIntake: effectiveHoursSinceDrink
    };

    const result = HydrationRiskEngine.solveRisk(
      inputs,
      profile,
      historicalAverages ?? undefined
    );

    // 2. Hardware failure override
    if (isDamaged) {
      return {
        ...result,
        status: 'Device Error',
        meaning: 'Persistent sensor failure detected. Your wearable may be damaged.',
        suggestedAction: 'Inspect your device for water or physical damage.'
      };
    }
    return result;
  }, [sensorData, effectiveHoursSinceDrink, profile, historicalAverages, isDamaged]);

  const ingestFluid = useCallback((amountMl: number) => {
    stomachRef.current = Number(Math.min(STOMACH_CAPACITY_ML, stomachRef.current + amountMl).toFixed(1));
    setStomachVolume(stomachRef.current);
  }, []);

  const applySensorPatch = useCallback((patch: Partial<SensorData>) => {
    setSensorData(prev => ({ ...prev, ...patch, lastUpdated: new Date().toISOString() }));
  }, []);

  const awakeHours = sleepSchedule ? awakeHoursPerDay(sleepSchedule) : 24;
  const targetMl = profile?.targetDailyMl ?? 0;

  return {
    sensorData,
    solvedRisk,
    effectiveHoursSinceDrink,
    stomachVolume,
    absorbedHydration,
    absorptionRate: absorptionRateFor(sensorData),
    sweatLossRate: sweatLossRateFor(sensorData),
    isSleeping,
    awakeHoursPerDay: awakeHours,
    // Averages are per waking hour: spreading the goal over 24 would quietly
    // set a pace the user could only hit by drinking in their sleep.
    targetMlPerAwakeHour: sleepSchedule
      ? Math.round(mlPerAwakeHour(targetMl, sleepSchedule))
      : Math.round(targetMl / 24),
    ingestFluid,
    applySensorPatch,
  };
};

export default useHydrationTelemetry;
