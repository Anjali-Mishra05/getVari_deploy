/**
 * The admin-driven configuration, and the drift it exists to prevent.
 *
 * The bug behind this file: onboarding stored the condition id `ckd`, the goal
 * calculator looked for `kidney`, and the risk engine looked for
 * `Kidney Disease`. Three spellings of one thing meant a user who ticked
 * "Kidney Disease / CKD" had none of the three adjustments applied. These
 * tests pin the ids to one list and check that each consumer reads it.
 */

import AppConfigStore from '../src/config/appConfigStore';
import { DEFAULT_APP_CONFIG } from '../src/config/appConfigSchema';
import { computeTargetDailyMl, climateBandFor } from '../src/utils/hydrationTarget';
import { HydrationRiskEngine } from '../src/utils/hydrationRiskEngine';
import { calculatePredictedRiskAfterDrink } from '../src/utils/hydrationModel';
import { quickLogAmounts } from '../src/utils/hydrationAmounts';
import type { UserProfile } from '../src/types';

const baseProfile = (overrides: Partial<UserProfile> = {}): UserProfile =>
  ({
    age: 40,
    gender: 'Male',
    weightKg: 70,
    activityLevel: 'moderate',
    fitnessGoal: 'optimize_health',
    workEnvironment: 'indoor',
    waterHabit: 'moderate',
    targetDailyMl: 2500,
    ...overrides,
  } as UserProfile);

afterEach(() => AppConfigStore.reset());

describe('the shipped default config', () => {
  it('gives every condition a unique id', () => {
    const ids = DEFAULT_APP_CONFIG.medicalConditions.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses the ids onboarding actually stores', () => {
    const ids = DEFAULT_APP_CONFIG.medicalConditions.map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining(['diabetes', 'hypertension', 'ckd', 'heart', 'stones']));
  });

  it('ends the climate bands with a catch-all', () => {
    const last = DEFAULT_APP_CONFIG.climateBands[DEFAULT_APP_CONFIG.climateBands.length - 1];
    expect(last.cities).toEqual([]);
  });

  it('marks exactly the fluid-restricted conditions as needing a physician limit', () => {
    const gated = DEFAULT_APP_CONFIG.medicalConditions
      .filter(c => c.requiresPhysicianLimit)
      .map(c => c.id)
      .sort();
    expect(gated).toEqual(['ckd', 'heart', 'hypertension']);
  });
});

describe('condition lookups', () => {
  it('drops ids that no longer exist rather than throwing', () => {
    expect(AppConfigStore.conditionsFor(['diabetes', 'retired_id']).map(c => c.id)).toEqual([
      'diabetes',
    ]);
  });

  it('reports a physician limit only for the conditions that need one', () => {
    expect(AppConfigStore.requiresPhysicianLimit(['ckd'])).toBe(true);
    expect(AppConfigStore.requiresPhysicianLimit(['diabetes', 'stones'])).toBe(false);
    expect(AppConfigStore.requiresPhysicianLimit(undefined)).toBe(false);
  });
});

describe('a published config reaches every consumer', () => {
  it('moves the daily goal when a condition adjustment is edited', () => {
    // Diabetes is not fluid-restricted, so the goal is a number rather than
    // the `null` a physician-gated condition without a limit would give.
    const before = computeTargetDailyMl({ weightKg: 60, medicalConditions: ['diabetes'] })!;

    AppConfigStore.adopt({
      ...DEFAULT_APP_CONFIG,
      medicalConditions: DEFAULT_APP_CONFIG.medicalConditions.map(condition =>
        condition.id === 'diabetes' ? { ...condition, targetAdjustmentMl: 1000 } : condition
      ),
    });

    const after = computeTargetDailyMl({ weightKg: 60, medicalConditions: ['diabetes'] })!;
    expect(after - before).toBe(550); // 1000 replaces the shipped 450
  });

  it('moves the goal when the millilitres-per-kilogram rate is edited', () => {
    AppConfigStore.adopt({
      ...DEFAULT_APP_CONFIG,
      targetFormula: { ...DEFAULT_APP_CONFIG.targetFormula, mlPerKg: 40 },
    });
    expect(computeTargetDailyMl({ weightKg: 60 })).toBe(2400);
  });

  it('re-weights the risk engine when a condition tweak is edited', () => {
    const profile = baseProfile({ medicalConditions: ['diabetes'] });
    const before = HydrationRiskEngine.getNormalizedWeights(profile).heart;

    AppConfigStore.adopt({
      ...DEFAULT_APP_CONFIG,
      medicalConditions: DEFAULT_APP_CONFIG.medicalConditions.map(condition =>
        condition.id === 'diabetes'
          ? { ...condition, riskWeightDeltas: { ...condition.riskWeightDeltas, heart: 0.2 } }
          : condition
      ),
    });

    expect(HydrationRiskEngine.getNormalizedWeights(profile).heart).toBeGreaterThan(before);
  });

  it('changes the quick-log amounts offered', () => {
    AppConfigStore.adopt({
      ...DEFAULT_APP_CONFIG,
      quickLogAmounts: [{ label: '330 ml', ml: 330, primary: true }],
    });
    expect(quickLogAmounts()).toEqual([
      { ml: 330, label: '330 ml', caption: 'A bottle', primary: true },
    ]);
  });

  it('keeps a section the published document omits', () => {
    const merged = AppConfigStore.validate({ medicalConditions: [{ id: 'only', title: 'Only' }] });
    expect(merged?.activityLevels).toEqual(DEFAULT_APP_CONFIG.activityLevels);
    expect(merged?.medicalConditions).toHaveLength(1);
  });

  it('rejects a document whose conditions have no ids', () => {
    expect(AppConfigStore.validate({ medicalConditions: [{ title: 'No id' }] })).toBeNull();
    expect(AppConfigStore.validate(null)).toBeNull();
  });
});

describe('climate is resolved from the city, with a catch-all', () => {
  it('places a listed city in its band', () => {
    expect(climateBandFor('Mumbai').id).toBe('hot');
    expect(climateBandFor('Bengaluru').id).toBe('moderate');
  });

  it('matches a city name that contains a listed one', () => {
    expect(climateBandFor('Navi Mumbai').id).toBe('hot');
  });

  it('falls back to the catch-all for anywhere unlisted', () => {
    expect(climateBandFor('Reykjavik').targetAdjustmentMl).toBe(0);
    expect(climateBandFor(undefined).targetAdjustmentMl).toBe(0);
  });
});

describe('the arithmetic that used to produce NaN', () => {
  it('survives a profile with no weight', () => {
    const profile = baseProfile({ weightKg: undefined as unknown as number });
    expect(calculatePredictedRiskAfterDrink(60, 500, profile)).toEqual(expect.any(Number));
    expect(Number.isNaN(calculatePredictedRiskAfterDrink(60, 500, profile))).toBe(false);
  });

  it('survives a weight of zero', () => {
    const profile = baseProfile({ weightKg: 0 });
    expect(Number.isFinite(calculatePredictedRiskAfterDrink(60, 500, profile))).toBe(true);
  });

  it('survives a non-numeric risk or amount', () => {
    const profile = baseProfile();
    expect(
      Number.isFinite(calculatePredictedRiskAfterDrink(NaN, NaN as unknown as number, profile))
    ).toBe(true);
  });

  it('never returns a negative risk', () => {
    expect(calculatePredictedRiskAfterDrink(5, 5000, baseProfile())).toBe(0);
  });
});
