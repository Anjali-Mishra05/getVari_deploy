/**
 * The physician daily limit, for fluid-restricted diagnoses.
 *
 * ## Why this suite is strict
 *
 * Over-drinking on a fluid restriction is a clinical harm, not a cosmetic
 * defect. A CKD profile carrying a nephrologist's 1200 ml/day was shown
 * `weight × 35 − 250` instead — 2200 ml for a 70 kg patient — because the
 * limit was collected, stored, honoured by PBWR, and then ignored by the one
 * calculation that produces the goal on the dashboard.
 *
 * Every case below is a way that number could be quietly raised again:
 * blended with the formula, rounded up to the nearest 50, floored to
 * `minTargetMl`, floored to PBWR's 1500, or replaced by a default when it is
 * missing. Each is asserted separately so a regression names itself.
 *
 *   npx jest --config jest.config.logic.js __tests__/physicianLimit.test.ts
 */

import {
  MAX_PHYSICIAN_LIMIT_ML,
  MIN_PHYSICIAN_LIMIT_ML,
  computeTargetDailyMl,
  physicianLimitStateFor,
  profileNeedsPhysicianLimit,
  targetFromProfile,
  validatePhysicianLimitMl,
} from '../src/utils/hydrationTarget';
import AppConfigStore from '../src/config/appConfigStore';
import { DEFAULT_APP_CONFIG } from '../src/config/appConfigSchema';

beforeEach(() => {
  AppConfigStore.reset();
});

// ---------------------------------------------------------------------------

describe('A doctor’s number replaces the formula', () => {
  it('is the goal verbatim, not a term added to the calculation', () => {
    // 70 kg would give 2450 before adjustments; the restriction is 1200.
    expect(
      computeTargetDailyMl({
        weightKg: 70,
        medicalConditions: ['ckd'],
        physicianLimitMl: 1200,
      })
    ).toBe(1200);
  });

  it('is not raised by the safe-range floor', () => {
    // `minTargetMl` is 1500. A doctor saying 900 means 900 — flooring it to
    // 1500 would pace the patient 600 ml past their limit every day.
    expect(
      computeTargetDailyMl({
        weightKg: 70,
        medicalConditions: ['ckd'],
        physicianLimitMl: 900,
      })
    ).toBe(900);
  });

  it('is not rounded to the formula’s 50 ml step', () => {
    // 1225 must not become 1250: rounding a restriction upwards is the same
    // error as the floor, just smaller.
    expect(
      computeTargetDailyMl({
        weightKg: 70,
        medicalConditions: ['ckd'],
        physicianLimitMl: 1225,
      })
    ).toBe(1225);
  });

  it('ignores weight, activity and climate entirely', () => {
    // Every one of these would raise a formula-derived goal. None of them may
    // move a number a clinician set.
    const base = {
      medicalConditions: ['ckd'],
      physicianLimitMl: 1400,
    };
    expect(computeTargetDailyMl({ ...base, weightKg: 45 })).toBe(1400);
    expect(
      computeTargetDailyMl({
        ...base,
        weightKg: 140,
        activityLevel: 'elite',
        selectedCity: 'Delhi',
      })
    ).toBe(1400);
  });

  it('applies to every condition flagged as fluid-restricted, not just CKD', () => {
    for (const id of ['ckd', 'hypertension', 'heart']) {
      expect(
        computeTargetDailyMl({ weightKg: 70, medicalConditions: [id], physicianLimitMl: 1300 })
      ).toBe(1300);
    }
  });

  it('follows the admin config rather than a hardcoded list of ids', () => {
    // Diabetes ships as not-restricted. Flipping the flag has to be enough.
    expect(
      computeTargetDailyMl({ weightKg: 60, medicalConditions: ['diabetes'] })
    ).toBe(2550);

    AppConfigStore.adopt({
      ...DEFAULT_APP_CONFIG,
      medicalConditions: DEFAULT_APP_CONFIG.medicalConditions.map(condition =>
        condition.id === 'diabetes' ? { ...condition, requiresPhysicianLimit: true } : condition
      ),
    });

    expect(computeTargetDailyMl({ weightKg: 60, medicalConditions: ['diabetes'] })).toBeNull();
    expect(
      computeTargetDailyMl({ weightKg: 60, medicalConditions: ['diabetes'], physicianLimitMl: 1800 })
    ).toBe(1800);
  });
});

describe('With no number on file, there is no goal', () => {
  it('returns null rather than a formula-derived guess', () => {
    expect(computeTargetDailyMl({ weightKg: 70, medicalConditions: ['ckd'] })).toBeNull();
  });

  it('treats a zero or negative limit as missing', () => {
    for (const limit of [0, -500, Number.NaN]) {
      expect(
        computeTargetDailyMl({ weightKg: 70, medicalConditions: ['ckd'], physicianLimitMl: limit })
      ).toBeNull();
    }
  });

  it('still computes a goal for an unrestricted profile', () => {
    expect(computeTargetDailyMl({ weightKg: 60 })).toBe(2100);
    expect(computeTargetDailyMl({ weightKg: 60, physicianLimitMl: 1200 })).toBe(2100);
  });
});

describe('Reading it back off a stored profile', () => {
  it('carries the limit through targetFromProfile', () => {
    expect(
      targetFromProfile({
        weightKg: 70,
        medicalConditions: ['ckd'],
        physicianLimitMl: 1200,
      } as any)
    ).toBe(1200);
  });

  it('reports a legacy row that predates the requirement as needing one', () => {
    // A row written before the gate existed has the diagnosis and no limit.
    expect(profileNeedsPhysicianLimit({ medicalConditions: ['ckd'] } as any)).toBe(true);
    expect(
      profileNeedsPhysicianLimit({ medicalConditions: ['ckd'], physicianLimitMl: 1200 } as any)
    ).toBe(false);
    expect(profileNeedsPhysicianLimit({ medicalConditions: ['diabetes'] } as any)).toBe(false);
    expect(profileNeedsPhysicianLimit(null)).toBe(false);
  });

  it('names the three states apart', () => {
    expect(physicianLimitStateFor(['diabetes'], undefined)).toBe('not-required');
    expect(physicianLimitStateFor(['ckd'], undefined)).toBe('missing');
    expect(physicianLimitStateFor(['ckd'], 1200)).toBe('set');
  });
});

describe('What the user is allowed to type', () => {
  it('rejects a blank field', () => {
    expect(validatePhysicianLimitMl('')).toMatch(/required/i);
    expect(validatePhysicianLimitMl('   ')).toMatch(/required/i);
  });

  it('rejects a slipped digit in either direction', () => {
    // 20000 for 2000 is the typo worth catching — it would hand a restricted
    // patient a goal four times any safe intake.
    expect(validatePhysicianLimitMl('20000')).toMatch(/between/i);
    expect(validatePhysicianLimitMl(String(MAX_PHYSICIAN_LIMIT_ML + 1))).toMatch(/between/i);
    expect(validatePhysicianLimitMl(String(MIN_PHYSICIAN_LIMIT_ML - 1))).toMatch(/between/i);
  });

  it('accepts the range a real restriction falls in', () => {
    for (const value of ['800', '1200', '1500', '2000']) {
      expect(validatePhysicianLimitMl(value)).toBeNull();
    }
    expect(validatePhysicianLimitMl(String(MIN_PHYSICIAN_LIMIT_ML))).toBeNull();
    expect(validatePhysicianLimitMl(String(MAX_PHYSICIAN_LIMIT_ML))).toBeNull();
  });

  it('rejects text that is not a number', () => {
    expect(validatePhysicianLimitMl('abc')).not.toBeNull();
  });
});
