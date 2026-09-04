/**
 * Defect 7: "Hydration Risk Score is frequently changing, sometimes 25
 * sometimes 36." And defect 8: "for weight 85 diabetic patient hydration risk
 * score should be 60 as per document, it is showing 25."
 *
 * Both come from the same place. The score is a weighted sum of *band-mapped*
 * loads — under 80 BPM is a load of 10, over it a load of 40 — and the
 * simulated sensor stream was an unanchored random walk. It wandered across
 * those band edges and back, and each crossing moves the score by eight to ten
 * points. Whatever the profile said, the number on screen was mostly a
 * reflection of where the walk happened to be.
 *
 * The fix is at the input: the stream is anchored to what the profile and the
 * user's climate imply, and pulled back toward that anchor, so it stays inside
 * one band. This file simulates the real stream to check that holds — and that
 * an 85kg diabetic in Mumbai now scores where the document says they should.
 */

import { HydrationRiskEngine } from '../src/utils/hydrationRiskEngine';
import AppConfigStore from '../src/config/appConfigStore';
import { climateBandFor } from '../src/utils/hydrationTarget';
import type { UserProfile } from '../src/types';

/** Mirrors BASELINE_PULL and the per-channel noise in useHydrationTelemetry. */
const PULL = 0.25;
const NOISE = { heartRate: 1.5, activityIndex: 2, temperature: 0.15, humidity: 1 };

const profileOf = (overrides: Partial<UserProfile>): UserProfile =>
  ({
    age: 45,
    gender: 'Male',
    weightKg: 70,
    activityLevel: 'moderate',
    fitnessGoal: 'optimize_health',
    workEnvironment: 'indoor',
    waterHabit: 'moderate',
    targetDailyMl: 2500,
    medicalConditions: [],
    ...overrides,
  } as UserProfile);

/** The anchors the hook derives from a profile. */
const anchorsFor = (profile: UserProfile) => {
  const level = AppConfigStore.current().activityLevels.find(l => l.id === profile.activityLevel)!;
  const band = climateBandFor(profile.location);
  return {
    heartRate: level.baselineHeartRate,
    activityIndex: level.baselineActivityIndex,
    temperature: band.ambientTempC,
    humidity: band.ambientHumidity,
  };
};

/** One mean-reverting step, as the hook performs it. */
const step = (current: number, anchor: number, noise: number, rand: () => number) =>
  current + (anchor - current) * PULL + (rand() * 2 - 1) * noise;

/** Deterministic PRNG so a failure is reproducible rather than flaky. */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/** Runs the stream for `ticks` and returns every score it produced. */
const runStream = (profile: UserProfile, hoursSinceDrink: number, ticks = 600) => {
  const anchor = anchorsFor(profile);
  const rand = seeded(20260904);
  let s = { ...anchor };
  const scores: number[] = [];

  for (let i = 0; i < ticks; i++) {
    s = {
      heartRate: step(s.heartRate, anchor.heartRate, NOISE.heartRate, rand),
      activityIndex: step(s.activityIndex, anchor.activityIndex, NOISE.activityIndex, rand),
      temperature: step(s.temperature, anchor.temperature, NOISE.temperature, rand),
      humidity: step(s.humidity, anchor.humidity, NOISE.humidity, rand),
    };
    const solved = HydrationRiskEngine.solveRisk(
      {
        heartRate: Math.round(s.heartRate),
        activityLoad: Math.round(s.activityIndex),
        temperature: Number(s.temperature.toFixed(1)),
        humidity: Math.round(s.humidity),
        timeSinceWaterIntake: hoursSinceDrink,
      },
      profile
    );
    scores.push(solved.score as number);
  }
  return scores;
};

afterEach(() => AppConfigStore.reset());

describe('the score no longer wanders on sensor noise', () => {
  it('stays within a few points over twenty minutes of ticks', () => {
    const scores = runStream(profileOf({ location: 'Mumbai' }), 1.5);
    const swing = Math.max(...scores) - Math.min(...scores);

    // The reported defect was an 11-point swing between readings. Anything
    // under 5 is imperceptible on a 0-100 dial.
    expect(swing).toBeLessThanOrEqual(5);
  });

  it('holds for a sedentary user in a temperate city too', () => {
    const scores = runStream(
      profileOf({ activityLevel: 'sedentary', location: 'Shimla' }),
      0.5
    );
    expect(Math.max(...scores) - Math.min(...scores)).toBeLessThanOrEqual(5);
  });

  it('keeps every channel inside one load band', () => {
    // The direct cause of the swing: a channel crossing a band edge. If the
    // anchors are placed correctly, each load is constant for the whole run.
    const profile = profileOf({ location: 'Mumbai' });
    const anchor = anchorsFor(profile);
    const rand = seeded(7);
    let s = { ...anchor };
    const loads = new Set<string>();

    for (let i = 0; i < 600; i++) {
      s = {
        heartRate: step(s.heartRate, anchor.heartRate, NOISE.heartRate, rand),
        activityIndex: step(s.activityIndex, anchor.activityIndex, NOISE.activityIndex, rand),
        temperature: step(s.temperature, anchor.temperature, NOISE.temperature, rand),
        humidity: step(s.humidity, anchor.humidity, NOISE.humidity, rand),
      };
      loads.add(
        [
          HydrationRiskEngine.calculateHeartLoad(Math.round(s.heartRate)),
          HydrationRiskEngine.calculateActivityLoad(Math.round(s.activityIndex)),
          HydrationRiskEngine.calculateTemperatureLoad(Number(s.temperature.toFixed(1))),
          HydrationRiskEngine.calculateHumidityLoad(Math.round(s.humidity)),
        ].join('/')
      );
    }

    expect([...loads]).toHaveLength(1);
  });
});

describe('defect 8: an 85kg diabetic in Mumbai', () => {
  const profile = profileOf({
    weightKg: 85,
    medicalConditions: ['diabetes'],
    location: 'Mumbai',
    selectedCity: 'Mumbai',
  });

  it('reproduces the document exactly at the telemetry the document uses', () => {
    // getVari_algo.pdf Use Case 1 is this profile at a 1.5h hydration gap, and
    // publishes 64. The climate band's ambient figures are calibrated so
    // Mumbai lands on the same loads the document uses (30C -> 60, 68% -> 70),
    // which is what makes the app and the specification agree.
    const scores = runStream(profile, 1.5);
    expect(scores[scores.length - 1]).toBe(64);
  });

  it('scores in the sixties on a normal gap, not 25', () => {
    const scores = runStream(profile, 2);
    const typical = scores[scores.length - 1];
    expect(typical).toBeGreaterThanOrEqual(60);
    expect(typical).toBeLessThanOrEqual(75);
  });

  it('is scored higher than the same body without the diagnosis', () => {
    const withDiabetes = runStream(profile, 2).pop()!;
    const without = runStream(
      profileOf({ weightKg: 85, location: 'Mumbai', selectedCity: 'Mumbai' }),
      2
    ).pop()!;
    expect(withDiabetes).toBeGreaterThan(without);
  });

  it('is scored higher than the same person in a temperate city', () => {
    const mumbai = runStream(profile, 2).pop()!;
    const london = runStream(
      profileOf({ weightKg: 85, medicalConditions: ['diabetes'], location: 'London' }),
      2
    ).pop()!;
    expect(mumbai).toBeGreaterThan(london);
  });
});

describe('the score still follows intake and the recovery engine', () => {
  const profile = profileOf({ location: 'Mumbai' });

  it('falls as the hydration gap closes', () => {
    // The recovery engine credits absorbed fluid back against the gap, so a
    // drink shows up here as a smaller `timeSinceWaterIntake`.
    const thirsty = runStream(profile, 2.5).pop()!;
    const justDrank = runStream(profile, 0.2).pop()!;
    expect(justDrank).toBeLessThan(thirsty);
  });

  it('moves by a readable amount when the gap crosses a band', () => {
    // 1-2h is a load of 60, over 2h is 90 — the algorithm's own steps. The
    // score must react to those, which is what a clock-based hold prevented.
    const under = runStream(profile, 1.5).pop()!;
    const over = runStream(profile, 2.5).pop()!;
    expect(over - under).toBeGreaterThanOrEqual(3);
  });
});
