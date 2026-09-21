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
 * blended with the formula, rounded up to the nearest 50, floored to a
 * configured minimum, floored to the spec's 1500, or replaced by a default
 * when it is missing. Each is asserted separately so a regression names
 * itself.
 *
 * ## The limit is a ceiling, not a prescription
 *
 * §5 step 2 of the spec: an entered limit "becomes the user's Upper Limit
 * directly", and the health adjustment drops to +0. So the pipeline still
 * runs underneath it and the goal is `MIN(what the body needs, what the
 * doctor allows)`. In practice the baseline usually exceeds the restriction,
 * so the goal *is* the limit — but for a small frame on a generous
 * restriction it is lower, and returning the limit verbatim there presented
 * the maximum a patient is permitted as the amount they should drink.
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

describe('A doctor’s number caps the formula', () => {
  it('is the goal, not a term added to the calculation', () => {
    // 70 kg gives a 3983 ml baseline; the restriction is 1200.
    expect(
      computeTargetDailyMl({
        weightKg: 70,
        medicalConditions: ['ckd'],
        physicianLimitMl: 1200,
      })
    ).toBe(1200);
  });

  it('is never exceeded, whatever the rest of the profile says', () => {
    // The one invariant that matters clinically: nothing in the pipeline —
    // weight, work environment, a co-morbid diagnosis — may push the goal
    // above the number the clinician set.
    for (const weightKg of [40, 70, 140]) {
      for (const workEnvironment of ['indoor', 'heavy_outdoor']) {
        const target = computeTargetDailyMl({
          weightKg,
          gender: 'Male',
          age: 30,
          workEnvironment,
          medicalConditions: ['ckd', 'diabetes'],
          physicianLimitMl: 1500,
        })!;
        expect(target).toBeLessThanOrEqual(1500);
      }
    }
  });

  it('zeroes the health adjustment rather than adding to a capped intake', () => {
    // §5 step 2. A CKD patient who also has diabetes does not get diabetes'
    // +400 ml stacked onto a restricted intake.
    const withComorbidity = computeTargetDailyMl({
      weightKg: 35,
      gender: 'Female',
      age: 30,
      medicalConditions: ['ckd', 'diabetes'],
      physicianLimitMl: 3000,
    });
    // 35 × 49.1 = 1718.5 → 1719, with no diabetes adjustment on top.
    expect(withComorbidity).toBe(1719);
  });

  it('paces a small frame to what the body needs, not to the ceiling', () => {
    // A 45 kg patient allowed 3000 ml/day is not told to drink 3000 ml: the
    // limit is what they may not exceed, not what they should aim for.
    const target = computeTargetDailyMl({
      weightKg: 45,
      gender: 'Female',
      age: 30,
      medicalConditions: ['ckd'],
      physicianLimitMl: 3000,
    })!;
    expect(target).toBe(2210); // 45 × 49.1 × 1.00
    expect(target).toBeLessThan(3000);
  });

  it('is not raised by the safety floor', () => {
    // §7's floor is 1500. A doctor saying 900 means 900 — flooring it to 1500
    // would pace the patient 600 ml past their limit every day, so §7 yields
    // to §5 rather than overriding it.
    expect(
      computeTargetDailyMl({
        weightKg: 70,
        medicalConditions: ['ckd'],
        physicianLimitMl: 900,
      })
    ).toBe(900);
  });

  it('is not rounded to a bottle-friendly step', () => {
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

  it('is not lifted by weight, activity or climate', () => {
    // Every one of these raises the uncapped figure. None of them may carry
    // the goal past the number a clinician set — at 45 kg the baseline is
    // 2210 and at 140 kg it is 7966, and both land on the 1400 ceiling.
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
    // 60 × 56.9 (no gender stored → the male rate) + 400 for diabetes.
    expect(
      computeTargetDailyMl({ weightKg: 60, medicalConditions: ['diabetes'] })
    ).toBe(3814);

    AppConfigStore.adopt({
      ...DEFAULT_APP_CONFIG,
      medicalConditions: DEFAULT_APP_CONFIG.medicalConditions.map(condition =>
        condition.id === 'diabetes' ? { ...condition, requiresPhysicianLimit: true } : condition
      ),
    });

    // The limit is optional: without one, a goal is still computed.
    expect(computeTargetDailyMl({ weightKg: 60, medicalConditions: ['diabetes'] })).toEqual(
      expect.any(Number)
    );
    expect(
      computeTargetDailyMl({ weightKg: 60, medicalConditions: ['diabetes'], physicianLimitMl: 1800 })
    ).toBe(1800);
  });
});

describe('With no number on file, the limit is optional', () => {
  it('computes the formula goal instead of refusing one', () => {
    const goal = computeTargetDailyMl({ weightKg: 70, medicalConditions: ['ckd'] });
    expect(goal).toEqual(expect.any(Number));
    expect(goal!).toBeGreaterThan(0);
  });

  it('treats a zero or negative limit as missing, not as the ceiling', () => {
    const withoutLimit = computeTargetDailyMl({ weightKg: 70, medicalConditions: ['ckd'] });
    for (const limit of [0, -500, Number.NaN]) {
      expect(
        computeTargetDailyMl({ weightKg: 70, medicalConditions: ['ckd'], physicianLimitMl: limit })
      ).toBe(withoutLimit);
    }
  });

  it('still computes a goal for an unrestricted profile', () => {
    expect(computeTargetDailyMl({ weightKg: 60 })).toBe(3414);
    // A limit typed against no restricted diagnosis is not a ceiling at all.
    expect(computeTargetDailyMl({ weightKg: 60, physicianLimitMl: 1200 })).toBe(3414);
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
  it('accepts a blank field, because the limit is optional', () => {
    expect(validatePhysicianLimitMl('')).toBeNull();
    expect(validatePhysicianLimitMl('   ')).toBeNull();
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
