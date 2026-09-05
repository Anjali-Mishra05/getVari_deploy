import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { HydrationLog, HydrationRiskDetails, SensorData, UserProfile } from '../types';
import { toRiskDetails } from '../utils/hydrationModel';
import {
  SleepSchedule,
  awakeHoursBetween,
  awakeHoursPerDay,
  isAsleepAt,
  normaliseSleepSchedule,
} from '../utils/sleepWindow';
import TelemetryHistoryService from '../services/TelemetryHistoryService';
import AppConfigStore from '../config/appConfigStore';
import { climateBandFor } from '../utils/hydrationTarget';
import { AuthService } from '../services/AuthService';
import { HydrationRiskEngine } from '../utils/hydrationRiskEngine';
import { shouldPublishRisk } from '../utils/riskPublication';

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

/**
 * What the screen shows before the first reading arrives: nothing.
 *
 * This used to hold a full set of plausible numbers — 55 bpm, 25.2°C, 84%
 * battery — which the dashboard rendered instantly and then replaced two
 * seconds later when the stream started. Every one of those was invented, and
 * presenting an invented vital sign as a measurement is the worst version of
 * the "shows fake data, then the real data" problem: a user cannot tell which
 * frame they were looking at. Nulls render as `--`, which is true.
 */
const NO_READINGS: SensorData = {
  heartRate: null,
  steps: null,
  activityLoad: null,
  temperature: null,
  humidity: null,
  sweatGSR: null,
  hydrationScore: 0,
  batteryLevel: null,
  rssi: null,
  lastUpdated: new Date(0).toISOString(),
};

/**
 * The readings the stream settles around, for this user.
 *
 * They come from the profile rather than from a fixed set of numbers: the
 * activity band sets the resting heart rate and movement index, and the
 * climate band of the user's resolved city sets the ambient temperature and
 * humidity. That is what makes the dashboard reflect *where the user is* — a
 * profile in Chennai is modelled against Chennai's heat — and it is what makes
 * the documented use cases reproducible instead of landing on a different
 * score every time the screen is opened.
 */
const baselineFor = (profile?: UserProfile): SensorData => {
  const config = AppConfigStore.current();
  const activity = config.activityLevels.find(level => level.id === profile?.activityLevel);
  const band = climateBandFor(profile?.location ?? profile?.selectedCity);

  return {
    ...NO_READINGS,
    heartRate: activity?.baselineHeartRate ?? 72,
    activityLoad: activity?.baselineActivityIndex ?? 15,
    temperature: band?.ambientTempC ?? 24,
    humidity: band?.ambientHumidity ?? 50,
    sweatGSR: 2.0,
    batteryLevel: 84,
    rssi: -58,
    lastUpdated: new Date().toISOString(),
  };
};

/**
 * Hours to assume since the last drink when the user has logged nothing today.
 * Two hours puts them at the top of the engine's 1-2h band rather than in its
 * worst one, so an empty day reads as "you should drink" and not "critical".
 */
const NO_LOG_ASSUMED_GAP_HOURS = 2;

/** Ceiling on the hydration gap the engine is asked to score. */
const MAX_GAP_HOURS = 8;

/**
 * How the published score is allowed to move.
 *
 * The score is a weighted sum of *band-mapped* loads — heart rate under 80 BPM
 * is a load of 10, over it a load of 40 — so a reading drifting across a band
 * edge moves the score by nine points in one tick. The simulated stream used to
 * be an unanchored random walk of ±2 BPM and ±3 activity every two seconds,
 * which crossed those edges constantly: that is the reported "sometimes 25,
 * sometimes 36".
 *
 * Freezing the output on a clock was the wrong answer to that — it fixes the
 * flicker by making the score wrong for up to an hour, including right after
 * the user drinks something. The jitter is an *input* problem and is fixed at
 * the input (see `BASELINE_PULL` and `bandStableSensors`).
 *
 * What remains here is a floor, not a hold: the score follows the algorithm,
 * and these rules only stop it repainting on residual noise.
 *
 *  - A drink, a change of risk band, or the engine gaining or losing the
 *    ability to score publishes immediately. Intake and the recovery engine
 *    are the things the user acts on, so they must never wait.
 *  - Otherwise a move is published once it is worth reading: at least
 *    `MIN_SCORE_DELTA` points, and no more often than `MIN_REPUBLISH_MS`.
 *
 * The rule itself is `shouldPublishRisk` in `utils/riskPublication`, which is
 * where its thresholds live too — it is imported rather than restated so the
 * tested rule and the shipped one cannot drift apart.
 */

/**
 * How strongly each tick pulls a reading back to its baseline.
 *
 * The stream is now mean-reverting rather than a free walk: noise is added, but
 * the value is drawn back toward the anchor the profile and climate imply, so
 * it stays inside one load band instead of wandering across several. Without
 * this the sensors have no anchor at all and a long session drifts anywhere.
 */
const BASELINE_PULL = 0.25;

export interface HydrationTelemetry {
  sensorData: SensorData;
  /**
   * The risk solve the screen shows.
   *
   * Follows the algorithm — intake, the recovery engine and the hydration gap
   * all move it immediately — while residual sensor noise does not. See
   * `MIN_REPUBLISH_MS`.
   */
  solvedRisk: HydrationRiskDetails;
  /** When `solvedRisk` was last allowed to change, epoch ms. */
  riskUpdatedAt: number;
  /** Hydration gap the engine actually scored, after absorption credit. */
  effectiveHoursSinceDrink: number;
  /** Swallowed water not yet in the bloodstream, in ml. */
  stomachVolume: number;
  /** Circulating fluid pool, in ml. */
  absorbedHydration: number;
  /** False until the first reading has arrived; the screen shows `--` until then. */
  streaming: boolean;
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
  /** Readings currently pinned by the test panel, or null when the sim is free. */
  sensorOverride: SensorOverride | null;
  /** Pin readings. A field left undefined keeps drifting normally. */
  setSensorOverride: (override: SensorOverride | null) => void;
}

/**
 * Readings held still by the sensor test panel.
 *
 * Every field is optional and independent: pinning the temperature alone
 * leaves heart rate and activity drifting, which is what makes "change one
 * thing and watch the score" possible.
 *
 * This exists because the score the dashboard shows is a solve over *simulated*
 * readings that are derived from the profile — the activity level sets the
 * heart rate and movement index, the city's climate band sets temperature and
 * humidity. There was no way to ask "what does this algorithm do at 30°C and
 * 65% RH" without editing a profile and waiting for the stream to settle, so
 * checking a score against the specification meant reading the source.
 */
export interface SensorOverride {
  heartRate?: number;
  activityLoad?: number;
  temperature?: number;
  humidity?: number;
  /** Hours since the last drink, bypassing the log-derived gap. */
  gapHours?: number;
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

  const [sensorData, setSensorData] = useState<SensorData>(NO_READINGS);
  const [sensorOverride, setSensorOverrideState] = useState<SensorOverride | null>(null);
  const [historicalAverages, setHistoricalAverages] = useState<{ avgHR: number | null; avgSteps: number | null; avgTemp: number | null; avgHumidity: number | null } | null>(null);
  const [isDamaged, setIsDamaged] = useState(false);
  const [stomachVolume, setStomachVolume] = useState(0);
  // Starts empty rather than at an assumed 180ml. The pool is filled by drinks
  // the user actually logs; seeding it credited every new account with water
  // they had not drunk.
  const [absorbedHydration, setAbsorbedHydration] = useState(0);
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
  // The simulation tick is mounted once; the baseline changes when the profile
  // loads or the user edits their city, so it is reached through a ref rather
  // than by restarting the interval.
  const baselineRef = useRef(baselineFor(profile));
  baselineRef.current = baselineFor(profile);
  const stomachRef = useRef(stomachVolume);
  stomachRef.current = stomachVolume;
  const sleepScheduleRef = useRef(sleepSchedule);
  sleepScheduleRef.current = sleepSchedule;
  // Read by the tick, which is mounted once. Without this the drift would keep
  // pulling a pinned channel back to its baseline two seconds after it was set.
  const overrideRef = useRef(sensorOverride);
  overrideRef.current = sensorOverride;

  // A new entry restarts the gap from its real timestamp. Keyed on the newest
  // timestamp so re-fetching the same list does not reset a gap mid-tick.
  const newestLogAt = logs.reduce<string | null>(
    (latest, log) => (latest === null || log.timestamp > latest ? log.timestamp : latest),
    null
  );
  useEffect(() => {
    // A pinned gap outranks the logs: the tester asked for this number, and a
    // drink logged while the panel is open must not silently reset it.
    if (overrideRef.current?.gapHours !== undefined) return;
    setEffectiveHoursSinceDrink(gapFromLogs(logs, sleepSchedule));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestLogAt, sleepSchedule]);

  // Sensor stream + physiological step.
  useEffect(() => {
    const interval = setInterval(() => {
      // 1. Sensor drift, pulled back toward the profile's baseline.
      //
      //    Previously a free random walk: each tick added ±2 BPM and ±3
      //    activity to the *previous* reading with nothing holding it in
      //    place, so over a few minutes it wandered across the load-band
      //    edges (80 BPM, activity 20/50, 22°C, 40% RH) and back. Each
      //    crossing moves the risk score by eight to ten points, which is
      //    what "sometimes 25, sometimes 36" was.
      //
      //    Mean reversion keeps a reading near its anchor: noise still moves
      //    it, but the pull is proportional to how far it has strayed, so it
      //    settles inside one band instead of touring several.
      setSensorData(prev => {
        const baseline = baselineRef.current;

        /** One channel's next value: pulled toward `anchor`, plus noise. */
        const step = (current: number | null, anchor: number, noise: number, lo: number, hi: number) => {
          const from = current ?? anchor;
          const drift = (anchor - from) * BASELINE_PULL + (Math.random() * 2 - 1) * noise;
          return Math.min(hi, Math.max(lo, from + drift));
        };

        // A pinned channel is returned exactly as the tester typed it: no
        // drift, no noise, no rounding. That is the whole point of the panel —
        // a reading that wanders by a degree can cross a load-band edge and
        // move the score by nine points on its own.
        const pinned = overrideRef.current;
        const hold = (override: number | undefined, drifted: number) =>
          override ?? drifted;

        const heartRate = hold(pinned?.heartRate, Math.round(step(prev.heartRate, baseline.heartRate!, 1.5, 45, 170)));
        const activityLoad = hold(pinned?.activityLoad, Math.round(step(prev.activityLoad, baseline.activityLoad!, 2, 0, 100)));
        const temperature = hold(pinned?.temperature, Number(step(prev.temperature, baseline.temperature!, 0.15, 18, 45).toFixed(1)));
        const humidity = hold(pinned?.humidity, Math.round(step(prev.humidity, baseline.humidity!, 1, 10, 100)));
        const sweatGSR = Number(step(prev.sweatGSR, baseline.sweatGSR!, 0.15, 0.1, 15).toFixed(2));

        return {
          ...prev,
          batteryLevel: prev.batteryLevel ?? baseline.batteryLevel,
          rssi: prev.rssi ?? baseline.rssi,
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
        // A pinned gap is held still for the same reason a pinned reading is:
        // it is being used to reproduce a documented case, and a gap that
        // creeps upward every two seconds walks the score off the expected
        // value while the tester is still reading it.
        const pinnedGap = overrideRef.current?.gapHours;
        if (pinnedGap !== undefined) return pinnedGap;

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

  const liveRisk = useMemo<HydrationRiskDetails>(() => {
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
      return toRiskDetails({
        ...result,
        status: 'Device Error',
        meaning: 'Persistent sensor failure detected. Your wearable may be damaged.',
        suggestedAction: 'Inspect your device for water or physical damage.',
      });
    }

    // Dressed as `HydrationRiskDetails` rather than handed over raw: the cards
    // read `color`/`bgColor`/`textGlow` off this object, and passing the bare
    // engine output is what left those fields undefined.
    return toRiskDetails(result);
  }, [sensorData, effectiveHoursSinceDrink, profile, historicalAverages, isDamaged]);

  /**
   * The solve as published to the screen.
   *
   * `liveRisk` is recomputed on every tick; this is the one the user reads.
   * The rules are at `MIN_REPUBLISH_MS` — in short, anything the user did or
   * that changed their risk band shows at once, and gradual drift shows once
   * it is worth reading.
   */
  const [publishedRisk, setPublishedRisk] = useState<HydrationRiskDetails>(liveRisk);
  const [riskUpdatedAt, setRiskUpdatedAt] = useState(() => Date.now());

  // Set when a drink is logged. Intake and the recovery engine are what the
  // user acts on, so a log must move the score in the same breath — waiting
  // even a minute reads as the app having ignored it.
  const forcePublishRef = useRef(true);

  /**
   * A profile edit republishes the score immediately.
   *
   * Weight, medical conditions and city are all engine inputs: they set the
   * channel weights and the load multipliers, and the city additionally moves
   * the ambient baseline the readings drift toward. So saving the profile
   * editor changes `liveRisk` at once — but the *published* score is held back
   * unless the band changed or it moved at least `MIN_SCORE_DELTA` points, and
   * an edit that shifts the score by a point or two satisfies neither. The
   * user then watches the ring sit still on a screen they just changed, which
   * reads as the edit not having taken.
   *
   * This is the same rule already applied to logging a drink, for the same
   * reason: a change the user made themselves is never withheld.
   */
  const profileSignature = profile
    ? `${profile.weightKg}|${profile.age}|${profile.activityLevel}|${(profile.medicalConditions ?? []).slice().sort().join(',')}|${profile.location ?? profile.selectedCity ?? ''}`
    : '';
  const lastProfileSignature = useRef(profileSignature);
  if (lastProfileSignature.current !== profileSignature) {
    lastProfileSignature.current = profileSignature;
    forcePublishRef.current = true;
  }

  /**
   * Move the readings to the edited profile's baseline instead of drifting there.
   *
   * Forcing a republish alone is not enough for a city or activity-level
   * change. Those move the *baseline* — the anchor the stream is pulled toward
   * — and `BASELINE_PULL` closes only a quarter of the remaining distance per
   * tick, so a move from Bangalore's 25°C to Mumbai's 30°C takes some fifteen
   * seconds to arrive and crosses a load band partway through. The score
   * therefore answered a profile edit twice: once immediately with the old
   * readings, then again once the ambient caught up.
   *
   * Snapping is the honest reading of what the user did: they did not travel,
   * they corrected where the app thinks they live, so there is no journey to
   * animate. Pinned channels are left alone — an override outranks this.
   */
  useEffect(() => {
    if (!profile) return;
    const baseline = baselineRef.current;
    const pinned = overrideRef.current;

    setSensorData(prev => {
      // Nothing has streamed yet; the first tick will start from the baseline
      // on its own, and writing here would falsely mark the stream as live.
      if (prev.lastUpdated === NO_READINGS.lastUpdated) return prev;

      return {
        ...prev,
        heartRate: pinned?.heartRate ?? baseline.heartRate,
        activityLoad: pinned?.activityLoad ?? baseline.activityLoad,
        temperature: pinned?.temperature ?? baseline.temperature,
        humidity: pinned?.humidity ?? baseline.humidity,
        lastUpdated: new Date().toISOString(),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileSignature]);

  useEffect(() => {
    const now = Date.now();
    if (!shouldPublishRisk({
      live: liveRisk,
      published: publishedRisk,
      sinceLastMs: now - riskUpdatedAt,
      forced: forcePublishRef.current,
    })) {
      return;
    }

    forcePublishRef.current = false;
    setPublishedRisk(liveRisk);
    setRiskUpdatedAt(now);
  }, [liveRisk, publishedRisk, riskUpdatedAt]);

  const ingestFluid = useCallback((amountMl: number) => {
    stomachRef.current = Number(Math.min(STOMACH_CAPACITY_ML, stomachRef.current + amountMl).toFixed(1));
    setStomachVolume(stomachRef.current);
    // A logged drink is a real event, so it breaks the hourly hold.
    forcePublishRef.current = true;
  }, []);

  const applySensorPatch = useCallback((patch: Partial<SensorData>) => {
    setSensorData(prev => ({ ...prev, ...patch, lastUpdated: new Date().toISOString() }));
  }, []);

  /**
   * Pin or release the readings the engine is solved over.
   *
   * The values are written straight into the stream rather than left for the
   * next tick to pick up, so the score answers within a frame of the tester
   * moving a field — a two-second lag on a panel whose only job is cause and
   * effect reads as the control having done nothing.
   */
  const setSensorOverride = useCallback((override: SensorOverride | null) => {
    overrideRef.current = override;
    setSensorOverrideState(override);

    if (override) {
      setSensorData(prev => ({
        ...prev,
        heartRate: override.heartRate ?? prev.heartRate,
        activityLoad: override.activityLoad ?? prev.activityLoad,
        temperature: override.temperature ?? prev.temperature,
        humidity: override.humidity ?? prev.humidity,
        lastUpdated: new Date().toISOString(),
      }));
      if (override.gapHours !== undefined) setEffectiveHoursSinceDrink(override.gapHours);
    } else {
      // Releasing hands the gap back to the logs; the readings drift home on
      // their own from wherever they were pinned.
      setEffectiveHoursSinceDrink(gapFromLogs(logs, sleepSchedule));
    }

    // The score must not sit behind `MIN_REPUBLISH_MS` here: the tester is
    // watching for the change they just caused.
    forcePublishRef.current = true;
  }, [logs, sleepSchedule]);

  const rawAwakeHours = sleepSchedule ? awakeHoursPerDay(sleepSchedule) : 24;
  // A sleep window covering the whole day leaves no waking hours to divide by.
  const awakeHours = Number.isFinite(rawAwakeHours) && rawAwakeHours > 0 ? rawAwakeHours : 24;
  const targetMl = Number.isFinite(profile?.targetDailyMl as number)
    ? (profile!.targetDailyMl as number)
    : 0;

  return {
    sensorData,
    // The epoch timestamp on `NO_READINGS` is what marks "nothing yet"; a real
    // reading always stamps `lastUpdated` with the moment it arrived.
    streaming: sensorData.lastUpdated !== NO_READINGS.lastUpdated,
    solvedRisk: publishedRisk,
    riskUpdatedAt,
    effectiveHoursSinceDrink,
    stomachVolume,
    absorbedHydration,
    absorptionRate: absorptionRateFor(sensorData),
    sweatLossRate: sweatLossRateFor(sensorData),
    isSleeping,
    awakeHoursPerDay: awakeHours,
    // Averages are per waking hour: spreading the goal over 24 would quietly
    // set a pace the user could only hit by drinking in their sleep.
    targetMlPerAwakeHour: Math.round(targetMl / awakeHours),
    ingestFluid,
    applySensorPatch,
    sensorOverride,
    setSensorOverride,
  };
};

export default useHydrationTelemetry;
