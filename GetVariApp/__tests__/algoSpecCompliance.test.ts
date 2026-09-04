/**
 * getVari_algo.pdf, checked against the code paths a real user goes through.
 *
 * `algoCompliance.test.ts` already walks the document's three worked examples.
 * This file exists because those tests were passing while the algorithm was
 * not actually reaching anybody: they described each diagnosis by its display
 * name (`'Kidney Disease'`), which is what the engine used to match on, while
 * onboarding has always *stored* an id (`'ckd'`). Real profiles matched
 * nothing, so every clinical multiplier and weight tweak in section 2 of the
 * document silently did not apply.
 *
 * So each case below builds its profile exactly as onboarding writes it, and
 * asserts the intermediate quantities the document publishes — the normalised
 * weights and the adjusted loads — not just the final score. A score can come
 * out right for the wrong reasons; the weights cannot.
 */

import { HydrationRiskEngine } from '../src/utils/hydrationRiskEngine';
import {
  calculatePredictedRiskAfterDrink,
  calculateRecoveryEstimation,
} from '../src/utils/hydrationModel';
import AppConfigStore from '../src/config/appConfigStore';
import type { UserProfile } from '../src/types';

/** A profile in the shape `OnboardingScreen` upserts to Supabase. */
const storedProfile = (overrides: Partial<UserProfile>): UserProfile =>
  ({
    fullName: 'Test User',
    age: 40,
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

const round2 = (n: number) => Math.round(n * 100) / 100;

afterEach(() => AppConfigStore.reset());

describe('§1 Base load mapping', () => {
  it.each([
    [70, 10],
    [90, 40],
    [110, 70],
    [130, 90],
  ])('maps %i BPM to a heart load of %i', (bpm, load) => {
    expect(HydrationRiskEngine.calculateHeartLoad(bpm)).toBe(load);
  });

  it.each([
    [10, 10],
    [35, 40],
    [60, 70],
    [85, 90],
  ])('maps an activity index of %i to %i', (index, load) => {
    expect(HydrationRiskEngine.calculateActivityLoad(index)).toBe(load);
  });

  it.each([
    [18, 10],
    [25, 30],
    [30, 60],
    [35, 90],
  ])('maps %i°C to a temperature load of %i', (temp, load) => {
    expect(HydrationRiskEngine.calculateTemperatureLoad(temp)).toBe(load);
  });

  it.each([
    [30, 20],
    [50, 40],
    [70, 70],
    [80, 90],
  ])('maps %i%% humidity to %i', (rh, load) => {
    expect(HydrationRiskEngine.calculateHumidityLoad(rh)).toBe(load);
  });

  it.each([
    [0.25, 10],
    [0.75, 30],
    [1.5, 60],
    [3, 90],
  ])('maps %s hours since drink to %i', (hours, load) => {
    expect(HydrationRiskEngine.calculateTimeLoad(hours)).toBe(load);
  });
});

describe('§3 Use Case 1 — Diabetic, 85 kg, Mumbai', () => {
  const profile = storedProfile({
    weightKg: 85,
    medicalConditions: ['diabetes'],
    location: 'Mumbai',
    selectedCity: 'Mumbai',
  });

  const inputs = {
    heartRate: 90,
    activityLoad: 60,
    temperature: 30,
    humidity: 65,
    timeSinceWaterIntake: 1.5,
  };

  it('normalises the weights to the published set', () => {
    const w = HydrationRiskEngine.getNormalizedWeights(profile);
    // Document: w_heart 0.35, w_activity 0.25, w_temp 0.20, w_humidity 0.10, w_time 0.10
    expect(round2(w.heart)).toBe(0.35);
    expect(round2(w.activity)).toBe(0.25);
    expect(round2(w.temp)).toBe(0.2);
    expect(round2(w.humidity)).toBe(0.1);
    expect(round2(w.time)).toBe(0.1);
    expect(round2(w.heart + w.activity + w.temp + w.humidity + w.time)).toBe(1);
  });

  it('scores 64 (High Risk)', () => {
    const result = HydrationRiskEngine.solveRisk(inputs, profile);
    expect(result.score).toBe(64);
    expect(result.status).toBe('High Risk');
  });

  it('reports the base loads behind the score', () => {
    const result = HydrationRiskEngine.solveRisk(inputs, profile);
    // Pre-multiplier bases from the document: 40 / 70 / 60 / 70 / 60.
    expect(result.heartLoad).toBe(40);
    expect(result.activityLoad).toBe(70);
    expect(result.temperatureLoad).toBe(60);
    expect(result.humidityLoad).toBe(70);
    expect(result.timeLoad).toBe(60);
  });

  it('predicts a 15-point drop and a 1h20-1h50 window for 250 ml', () => {
    // 250 × 0.08 × (70/85) × 0.90 = 14.82 → 15
    expect(64 - calculatePredictedRiskAfterDrink(64, 250, profile)).toBe(15);
    // 75 × (1.133 weight × 1.25 diabetes × 0.90 hot) = 95.6 mins
    expect(calculateRecoveryEstimation(250, profile)).toBe('1h 20m to 1h 50m');
  });
});

describe('§3 Use Case 2 — Healthy, 70 kg, London', () => {
  const profile = storedProfile({ location: 'London', selectedCity: 'London' });

  it('leaves the baseline weights untouched', () => {
    const w = HydrationRiskEngine.getNormalizedWeights(profile);
    expect(round2(w.heart)).toBe(0.3);
    expect(round2(w.activity)).toBe(0.25);
    expect(round2(w.temp)).toBe(0.2);
    expect(round2(w.humidity)).toBe(0.1);
    expect(round2(w.time)).toBe(0.15);
  });

  it('scores 45 (Mild Risk)', () => {
    const result = HydrationRiskEngine.solveRisk(
      { heartRate: 90, activityLoad: 60, temperature: 18, humidity: 50, timeSinceWaterIntake: 1.5 },
      profile
    );
    expect(result.score).toBe(45);
    expect(result.status).toBe('Mild Risk');
  });
});

describe('§3 Use Case 3 — Renal patient, 65 kg, Bangalore', () => {
  const profile = storedProfile({
    age: 50,
    weightKg: 65,
    activityLevel: 'light',
    medicalConditions: ['ckd'],
    location: 'Bangalore',
    selectedCity: 'Bangalore',
  });

  it('shifts weight onto the time channel', () => {
    const w = HydrationRiskEngine.getNormalizedWeights(profile);
    // Document: w_heart 0.30, w_activity 0.25, w_temp 0.15, w_humidity 0.05, w_time 0.25
    expect(round2(w.heart)).toBe(0.3);
    expect(round2(w.activity)).toBe(0.25);
    expect(round2(w.temp)).toBe(0.15);
    expect(round2(w.humidity)).toBe(0.05);
    expect(round2(w.time)).toBe(0.25);
  });

  it('scores 37 (Mild Risk) on a long gap despite resting vitals', () => {
    const result = HydrationRiskEngine.solveRisk(
      { heartRate: 75, activityLoad: 15, temperature: 25, humidity: 45, timeSinceWaterIntake: 2.5 },
      profile
    );
    expect(result.score).toBe(37);
    expect(result.status).toBe('Mild Risk');
  });

  it('predicts a 15-point drop and a 25-45 min window for 200 ml', () => {
    // 200 × 0.08 × (70/65) × 0.85 = 14.64 → 15
    expect(37 - calculatePredictedRiskAfterDrink(37, 200, profile)).toBe(15);
    // 25 × 1.40 (renal) = 35 mins
    expect(calculateRecoveryEstimation(200, profile)).toBe('25 to 45 mins');
  });
});

describe('§2 the adjustments reach a profile as onboarding stores it', () => {
  /**
   * The regression this file was written for. Each pair is the same telemetry
   * against the same body, differing only by the diagnosis — so if the id were
   * ignored again, the two scores would be identical.
   */
  const telemetry = {
    heartRate: 95,
    activityLoad: 55,
    temperature: 29,
    humidity: 70,
    timeSinceWaterIntake: 2.5,
  };

  const scoreWith = (conditions: string[]) =>
    HydrationRiskEngine.solveRisk(telemetry, storedProfile({ medicalConditions: conditions }))
      .score;

  const weightsWith = (conditions: string[]) =>
    HydrationRiskEngine.getNormalizedWeights(storedProfile({ medicalConditions: conditions }));

  it.each([['diabetes'], ['ckd'], ['hypertension'], ['heat_stress']])(
    'the stored id %s re-weights the engine',
    condition => {
      // The weights, not the score. Hypertension shifts 0.05 from activity to
      // heart and multiplies the heart load by 1.10, which for some telemetry
      // very nearly cancels out — 61.9 against 62.0 — and a score assertion
      // would then pass or fail on a rounding boundary rather than on whether
      // the adjustment was applied at all.
      expect(weightsWith([condition])).not.toEqual(weightsWith([]));
    }
  );

  it.each([['diabetes'], ['ckd']])('the stored id %s moves the score', condition => {
    expect(scoreWith([condition])).not.toBe(scoreWith([]));
  });

  it('applies the weight-exertion scale above 75 kg', () => {
    const light = HydrationRiskEngine.getNormalizedWeights(storedProfile({ weightKg: 70 }));
    const heavy = HydrationRiskEngine.getNormalizedWeights(storedProfile({ weightKg: 85 }));
    expect(heavy.activity).toBeGreaterThan(light.activity);
    expect(heavy.time).toBeLessThan(light.time);
  });

  it('applies the hot-climate tweak from the resolved city', () => {
    const hot = HydrationRiskEngine.getNormalizedWeights(storedProfile({ location: 'Chennai' }));
    const mild = HydrationRiskEngine.getNormalizedWeights(storedProfile({ location: 'London' }));
    expect(hot.temp).toBeGreaterThan(mild.temp);
    expect(hot.humidity).toBeGreaterThan(mild.humidity);
  });

  it('clamps an adjusted load at 100, as §3 Use Case 3 requires', () => {
    // Time load 90 × 1.25 (renal) = 112.5, which the document clamps to 100.
    const renal = HydrationRiskEngine.solveRisk(
      { heartRate: 75, activityLoad: 15, temperature: 25, humidity: 45, timeSinceWaterIntake: 2.5 },
      storedProfile({ weightKg: 65, medicalConditions: ['ckd'] })
    );
    // With the clamp the time channel contributes 0.25 × 100 = 25 points; an
    // unclamped 112.5 would push the total above the documented 37.
    expect(renal.score).toBeLessThanOrEqual(37);
  });
});

describe('§4 recovery model modifiers', () => {
  it('scales the window by body mass above 75 kg', () => {
    const light = calculateRecoveryEstimation(500, storedProfile({ weightKg: 70 }));
    const heavy = calculateRecoveryEstimation(500, storedProfile({ weightKg: 100 }));
    expect(heavy).not.toBe(light);
  });

  it('uses the documented base timeline bands', () => {
    const plain = storedProfile({ weightKg: 70 });
    // ≤200ml → 25 mins, ≤500ml → 75 mins, >500ml → 100 mins.
    expect(calculateRecoveryEstimation(200, plain)).toBe('20 to 30 mins');
    expect(calculateRecoveryEstimation(500, plain)).toBe('1h to 1h 30m');
    expect(calculateRecoveryEstimation(750, plain)).toBe('1h 25m to 1h 55m');
  });

  it('scales risk reduction inversely with body mass', () => {
    // "a fixed 250ml drink reduces overall risk index less in an 85kg person
    // compared to a 50kg person".
    const smaller = 60 - calculatePredictedRiskAfterDrink(60, 250, storedProfile({ weightKg: 50 }));
    const larger = 60 - calculatePredictedRiskAfterDrink(60, 250, storedProfile({ weightKg: 85 }));
    expect(smaller).toBeGreaterThan(larger);
  });
});
