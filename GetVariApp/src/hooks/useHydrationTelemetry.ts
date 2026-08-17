import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { HydrationLog, HydrationRiskDetails, SensorData, UserProfile } from '../types';
import { runHydrationRiskSolver } from '../utils/hydrationModel';

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
  const activityFactor = Math.min(0.4, (sensors.activityLoad / 100) * 0.4);
  const heatFactor = Math.min(0.3, (heatStress(sensors.temperature, sensors.humidity) / 100) * 0.3);
  const multiplier = Math.max(0.3, 1 - activityFactor - heatFactor);
  return BASELINE_ABSORPTION_ML_PER_MIN * multiplier;
};

/** Perspiration scales with both exertion and the ambient thermal load. */
export const sweatLossRateFor = (sensors: SensorData): number =>
  BASELINE_SWEAT_ML_PER_MIN +
  (sensors.activityLoad / 100) * 8.6 +
  (heatStress(sensors.temperature, sensors.humidity) / 100) * 5.0;

/** Real hours between now and the newest entry, or the no-log assumption. */
const gapFromLogs = (logs: HydrationLog[]): number => {
  if (logs.length === 0) return NO_LOG_ASSUMED_GAP_HOURS;
  const newest = logs.reduce((latest, log) =>
    new Date(log.timestamp) > new Date(latest.timestamp) ? log : latest
  );
  const hours = (Date.now() - new Date(newest.timestamp).getTime()) / 3_600_000;
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
  const [sensorData, setSensorData] = useState<SensorData>(INITIAL_SENSORS);
  const [stomachVolume, setStomachVolume] = useState(0);
  const [absorbedHydration, setAbsorbedHydration] = useState(180);
  const [effectiveHoursSinceDrink, setEffectiveHoursSinceDrink] = useState(() => gapFromLogs(logs));

  // The tick reads current values without re-subscribing every render, which
  // would otherwise restart the interval ~30 times a minute and stall it.
  // The gut volume is a ref as well as state: the step needs to know how much
  // was *actually* drained this tick to credit the gap, and a state updater
  // cannot report that back.
  const sensorRef = useRef(sensorData);
  sensorRef.current = sensorData;
  const stomachRef = useRef(stomachVolume);
  stomachRef.current = stomachVolume;

  // A new entry restarts the gap from its real timestamp. Keyed on the newest
  // timestamp so re-fetching the same list does not reset a gap mid-tick.
  const newestLogAt = logs.reduce<string | null>(
    (latest, log) => (latest === null || log.timestamp > latest ? log.timestamp : latest),
    null
  );
  useEffect(() => {
    setEffectiveHoursSinceDrink(gapFromLogs(logs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestLogAt]);

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
      setEffectiveHoursSinceDrink(prev => {
        const credit = (absorbed / 250) * 1.5;
        const next = prev + SIM_MINUTES_PER_TICK / 60 - credit;
        return Number(Math.max(0, Math.min(MAX_GAP_HOURS, next)).toFixed(2));
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, []);

  const solvedRisk = useMemo(
    () => runHydrationRiskSolver(sensorData, effectiveHoursSinceDrink, absorbedHydration, profile),
    [sensorData, effectiveHoursSinceDrink, absorbedHydration, profile]
  );

  const ingestFluid = useCallback((amountMl: number) => {
    stomachRef.current = Number(Math.min(STOMACH_CAPACITY_ML, stomachRef.current + amountMl).toFixed(1));
    setStomachVolume(stomachRef.current);
  }, []);

  const applySensorPatch = useCallback((patch: Partial<SensorData>) => {
    setSensorData(prev => ({ ...prev, ...patch, lastUpdated: new Date().toISOString() }));
  }, []);

  return {
    sensorData,
    solvedRisk,
    effectiveHoursSinceDrink,
    stomachVolume,
    absorbedHydration,
    absorptionRate: absorptionRateFor(sensorData),
    sweatLossRate: sweatLossRateFor(sensorData),
    ingestFluid,
    applySensorPatch,
  };
};

export default useHydrationTelemetry;
