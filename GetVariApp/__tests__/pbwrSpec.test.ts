/**
 * PBWR v2 against the one-pager, table by table.
 *
 * `pbwrAlgorithm.test.ts` walks the spec's worked example end to end through
 * `PBWRService`. This suite is the complement: it pins the *edges* of every
 * published table directly on the pure pipeline, because a band boundary is
 * where an implementation silently disagrees with a spec. `>= 22` versus
 * `> 22` moves a 22.0 °C day by 250 ml and nothing about the output looks
 * wrong.
 *
 * Source: `getVari_Algorithm/PBWR_v2_developer_onepager.docx`.
 *
 *   npx jest --config jest.config.logic.js __tests__/pbwrSpec.test.ts
 */

import AppConfigStore from '../src/config/appConfigStore';
import {
  SAFETY_FLOOR_ML,
  computePBWRBreakdown,
  isWithinCalibrationWindow,
  pbwrBaselineMl,
  type ObservedAverages,
} from '../src/utils/pbwr';

beforeEach(() => {
  AppConfigStore.reset();
});

/** Averages with only the metric under test supplied. */
const observed = (over: Partial<ObservedAverages> = {}): ObservedAverages => ({
  avgSteps: null,
  avgTemp: null,
  avgHumidity: null,
  ...over,
});

// ---------------------------------------------------------------------------
// §2 — Stage 1

describe('§2 PBWR = weight × gender rate × age factor', () => {
  it('uses the ICMR-derived rate for each gender', () => {
    // 3700 ml ÷ 65 kg and 2700 ml ÷ 55 kg.
    expect(pbwrBaselineMl({ weightKg: 1, gender: 'Male', age: 30 })).toBeCloseTo(56.9);
    expect(pbwrBaselineMl({ weightKg: 1, gender: 'Female', age: 30 })).toBeCloseTo(49.1);
  });

  it('scales at the age-band boundaries, not near them', () => {
    const at = (age: number) => pbwrBaselineMl({ weightKg: 100, gender: 'Male', age });
    expect(at(39)).toBeCloseTo(5690); // ×1.00
    expect(at(40)).toBeCloseTo(5405.5); // ×0.95
    expect(at(59)).toBeCloseTo(5405.5);
    expect(at(60)).toBeCloseTo(5121); // ×0.90
  });

  it('falls back to the floor rather than NaN for a profile with no weight', () => {
    // A row saved before `weightKg` existed would otherwise multiply undefined
    // through five stages and put "NaN ml" on the dashboard.
    expect(pbwrBaselineMl({ gender: 'Male', age: 30 })).toBe(SAFETY_FLOOR_ML);
    expect(pbwrBaselineMl({ weightKg: 0, gender: 'Male', age: 30 })).toBe(SAFETY_FLOOR_ML);
    expect(pbwrBaselineMl({ weightKg: NaN, gender: 'Male', age: 30 })).toBe(SAFETY_FLOOR_ML);
  });

  it('treats an unstated age as 19–39 rather than as the oldest band', () => {
    expect(pbwrBaselineMl({ weightKg: 100, gender: 'Male' })).toBeCloseTo(5690);
  });
});

// ---------------------------------------------------------------------------
// §4 — Stage 3, the observed bands

const adjFor = (over: Partial<ObservedAverages>) =>
  computePBWRBreakdown({ weightKg: 70, gender: 'Male', age: 30 }, observed(over));

describe('§4 activity, from observed average daily steps', () => {
  it('lands on the published band edges', () => {
    const table: [number, number][] = [
      [0, 0],
      [2999, 0],
      [3000, 300],
      [5999, 300],
      [6000, 500],
      [9999, 500],
      [10000, 900],
      [13999, 900],
      [14000, 1300],
      [25000, 1300],
    ];
    for (const [avgSteps, expected] of table) {
      expect(adjFor({ avgSteps }).activityAdj).toBe(expected);
    }
  });

  it('adds nothing at all when no step history exists', () => {
    // "Missing != Zero": an unknown metric is not the sedentary band, it is
    // no reading, and §3 has the target run on the baseline until there is one.
    expect(adjFor({ avgSteps: null }).activityAdj).toBe(0);
  });
});

describe('§4 temperature, from observed average ambient °C', () => {
  it('lands on the published band edges', () => {
    const table: [number, number][] = [
      [21.9, 0],
      [22, 250],
      [27.9, 250],
      [28, 500],
      [33.9, 500],
      [34, 900],
    ];
    for (const [avgTemp, expected] of table) {
      expect(adjFor({ avgTemp }).tempAdj).toBe(expected);
    }
  });

  it('scores a sub-zero reading as Cool rather than dropping out of the table', () => {
    // The Cool band is "< 22" with no lower bound; a bands list that started
    // at 0 would return no match for a freezing day.
    expect(adjFor({ avgTemp: -5 }).tempAdj).toBe(0);
  });
});

describe('§4 humidity, from observed average RH %', () => {
  it('lands on the published band edges', () => {
    const table: [number, number][] = [
      [39.9, 0],
      [40, 150],
      [59.9, 150],
      [60, 300],
      [74.9, 300],
      [75, 500],
      [100, 500],
    ];
    for (const [avgHumidity, expected] of table) {
      expect(adjFor({ avgHumidity }).humidityAdj).toBe(expected);
    }
  });
});

describe('§4 the self-declared bands come from the admin config', () => {
  it('matches the published work-environment table', () => {
    const table: [string, number][] = [
      ['indoor', 0],
      ['ac_office', 250],
      ['hybrid', 500],
      ['outdoor', 750],
      ['heavy_outdoor', 1300],
    ];
    for (const [workEnvironment, expected] of table) {
      expect(
        computePBWRBreakdown({ weightKg: 70, gender: 'Male', age: 30, workEnvironment }).workEnvAdj
      ).toBe(expected);
    }
  });

  it('matches the published health table', () => {
    const health = (medicalConditions: string[]) =>
      computePBWRBreakdown({ weightKg: 70, gender: 'Male', age: 30, medicalConditions }).healthAdj;

    expect(health([])).toBe(0);
    expect(health(['diabetes'])).toBe(400);
    expect(health(['stones'])).toBe(500);
    expect(health(['diabetes', 'stones'])).toBe(900);
  });

  it('contributes nothing for a work environment or diagnosis that was retired', () => {
    // Both ids stay on every profile that once selected them.
    expect(
      computePBWRBreakdown({ weightKg: 70, workEnvironment: 'gone' }).workEnvAdj
    ).toBe(0);
    expect(
      computePBWRBreakdown({ weightKg: 70, medicalConditions: ['gone'] }).healthAdj
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §5/§6 — Stage 4

describe('§6 upper limit and precedence', () => {
  const heavy = { weightKg: 130, age: 30 }; // 7397 ml male baseline: above every ceiling

  it('caps a healthy profile at the gendered ceiling', () => {
    expect(computePBWRBreakdown({ ...heavy, gender: 'Male' }).finalTarget).toBe(4500);
    expect(computePBWRBreakdown({ ...heavy, gender: 'Female' }).finalTarget).toBe(4000);
  });

  it('raises the ceiling for the categories the spec names', () => {
    const limit = (over: object) =>
      computePBWRBreakdown({ ...heavy, gender: 'Male', ...over }).upperLimit;

    expect(limit({ activityLevel: 'active' })).toBe(5000);
    expect(limit({ workEnvironment: 'outdoor' })).toBe(5000);
    expect(limit({ workEnvironment: 'heavy_outdoor' })).toBe(5500);
    expect(limit({ medicalConditions: ['diabetes'] })).toBe(5000);
    expect(limit({ medicalConditions: ['stones'] })).toBe(5000);
  });

  it('takes the lowest of several qualifying ceilings', () => {
    // Heavy outdoor work (5500) alongside diabetes (5000): the safety-first
    // reading of "MIN over the set".
    expect(
      computePBWRBreakdown({
        ...heavy,
        gender: 'Male',
        workEnvironment: 'heavy_outdoor',
        medicalConditions: ['diabetes'],
      }).upperLimit
    ).toBe(5000);
  });

  it('keeps the healthy ceiling out of the MIN when another category applies', () => {
    // Including it unconditionally would make every other row in the table
    // dead: 4500 is below all of them, so a gym-goer would never reach 5000.
    expect(
      computePBWRBreakdown({ ...heavy, gender: 'Male', activityLevel: 'elite' }).upperLimit
    ).toBe(5000);
  });

  it('lets a physician limit win over every other category', () => {
    const breakdown = computePBWRBreakdown({
      ...heavy,
      gender: 'Male',
      workEnvironment: 'heavy_outdoor',
      medicalConditions: ['ckd', 'diabetes'],
      physicianLimitMl: 1200,
    });
    expect(breakdown.isPhysicianGated).toBe(true);
    expect(breakdown.upperLimit).toBe(1200);
    expect(breakdown.finalTarget).toBe(1200);
  });

  it('§5 step 3: falls back to the healthy ceiling when the limit is missing', () => {
    const breakdown = computePBWRBreakdown({
      ...heavy,
      gender: 'Female',
      medicalConditions: ['ckd'],
    });
    expect(breakdown.physicianLimitEntered).toBe(false);
    // 4.0 L female / 4.5 L male, and never the 5000 a co-morbidity would give.
    expect(breakdown.upperLimit).toBe(4000);
  });
});

// ---------------------------------------------------------------------------
// §7 — Stage 5

describe('§7 safety floor', () => {
  it('lifts a target the formula puts below 1.5 L', () => {
    // 25 kg, 60+, female: 1104 ml.
    expect(
      computePBWRBreakdown({ weightKg: 25, gender: 'Female', age: 65 }).finalTarget
    ).toBe(SAFETY_FLOOR_ML);
  });

  it('yields to a restriction below it rather than overriding it', () => {
    // A nephrologist saying 900 means 900; a floor that returned 1500 would
    // pace the patient 600 ml past their limit every day.
    expect(
      computePBWRBreakdown({
        weightKg: 70,
        gender: 'Male',
        age: 30,
        medicalConditions: ['ckd'],
        physicianLimitMl: 900,
      }).finalTarget
    ).toBe(900);
  });
});

// ---------------------------------------------------------------------------
// §3 — Stage 2

describe('§3 the 7-day calibration window', () => {
  it('is measured from the account start date', () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
    expect(isWithinCalibrationWindow(daysAgo(0))).toBe(true);
    expect(isWithinCalibrationWindow(daysAgo(6.9))).toBe(true);
    expect(isWithinCalibrationWindow(daysAgo(7.1))).toBe(false);
  });

  it('treats a row with no start date as established, not as brand new', () => {
    // The stamp is written on first save, so only rows that predate it lack
    // one — and those are long past day seven. Reading them as calibrating
    // would pin them to the baseline forever.
    expect(isWithinCalibrationWindow(undefined)).toBe(false);
    expect(isWithinCalibrationWindow(null)).toBe(false);
    expect(isWithinCalibrationWindow('not a date')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §8

describe('§8 the worked example', () => {
  it('reproduces the published breakdown line for line', () => {
    // Male, 70 kg, 25 yrs, AC office, diabetes, no physician limit.
    // 7-day observed: 5,200 steps/day, 27 °C, 55 % RH.
    const breakdown = computePBWRBreakdown(
      {
        weightKg: 70,
        gender: 'Male',
        age: 25,
        workEnvironment: 'ac_office',
        medicalConditions: ['diabetes'],
      },
      { avgSteps: 5200, avgTemp: 27, avgHumidity: 55 }
    );

    expect(breakdown.pbwrBaseline).toBe(3983); // 70 × 56.9 × 1.00
    expect(breakdown.activityAdj).toBe(300); // Light
    expect(breakdown.tempAdj).toBe(250); // Mild
    expect(breakdown.humidityAdj).toBe(150); // Moderate
    expect(breakdown.workEnvAdj).toBe(250); // AC Office
    expect(breakdown.healthAdj).toBe(400); // Diabetes
    expect(breakdown.adjustedTotal).toBe(5333);
    expect(breakdown.upperLimit).toBe(5000); // Diabetes
    expect(breakdown.finalTarget).toBe(5000); // MAX(1500, MIN(5333, 5000))
  });
});
