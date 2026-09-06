/**
 * The editable risk inputs: bounds, validation, and what reaches the engine.
 *
 * The load breakdown on the dashboard now types straight into the solve, so
 * anything this module lets through is something `HydrationRiskEngine` will be
 * asked to score. The cases below are the ways a field could hand it garbage —
 * empty, mid-edit, out of range, or not a number at all.
 *
 *   npx jest --config jest.config.logic.js __tests__/riskChannels.test.ts
 */

jest.mock('react-native', () => ({ Platform: { OS: 'android', Version: 34 } }));

import {
  HEART_RATE_MAX,
  HEART_RATE_MIN,
  RISK_CHANNELS,
  channelText,
  overrideFromDraft,
  riskChannel,
  trimToDecimals,
  validateChannel,
} from '../src/utils/riskChannels';
import { HydrationRiskEngine, RISK_CONFIG } from '../src/utils/hydrationRiskEngine';

const spec = (key: string) => RISK_CHANNELS.find(c => c.key === key)!;

// ---------------------------------------------------------------------------

describe('The bounds match the engine they describe', () => {
  it('covers all five channels the engine weighs', () => {
    expect(RISK_CHANNELS.map(c => c.key)).toEqual([
      'heartRate',
      'activityLoad',
      'temperature',
      'humidity',
      'gapHours',
    ]);
  });

  it('keeps heart rate inside the range the engine will actually score', () => {
    // Outside 30-220 `solveRisk` returns 'Device Error' rather than a score,
    // so a field that accepted 25 would blank the ring instead of moving it.
    expect(HEART_RATE_MIN).toBe(30);
    expect(HEART_RATE_MAX).toBe(220);

    const atMin = HydrationRiskEngine.solveRisk({
      heartRate: HEART_RATE_MIN,
      activityLoad: 20,
      temperature: 25,
      humidity: 50,
      timeSinceWaterIntake: 1,
    });
    const atMax = HydrationRiskEngine.solveRisk({
      heartRate: HEART_RATE_MAX,
      activityLoad: 20,
      temperature: 25,
      humidity: 50,
      timeSinceWaterIntake: 1,
    });

    expect(atMin.status).not.toBe('Device Error');
    expect(atMax.status).not.toBe('Device Error');
  });

  it('spans every band edge the load mapping defines', () => {
    // A bound that stopped short of a threshold would make that band
    // unreachable from the UI, which defeats the point of the panel.
    //
    // Only the *interior* edges are checked. The first band's `min` is the
    // mapping's floor, not a threshold: heart rate starts at 0 there, but 0
    // bpm is a device error rather than a reading anyone should be able to
    // type, so the field deliberately starts at 30.
    const covers = (key: string, ranges: { min: number; max: number }[]) => {
      const { min, max } = spec(key);
      const interior = ranges.slice(1).map(r => r.min);
      expect(interior.length).toBeGreaterThan(0);
      for (const edge of interior) {
        expect(edge).toBeGreaterThanOrEqual(min);
        expect(edge).toBeLessThanOrEqual(max);
      }
    };

    covers('heartRate', RISK_CONFIG.LOAD_MAPPING.HEART_RATE);
    covers('activityLoad', RISK_CONFIG.LOAD_MAPPING.ACTIVITY);
    covers('temperature', RISK_CONFIG.LOAD_MAPPING.TEMPERATURE);
    covers('humidity', RISK_CONFIG.LOAD_MAPPING.HUMIDITY);
    covers('gapHours', RISK_CONFIG.LOAD_MAPPING.TIME_SINCE_DRINK);
  });
});

describe('Validation', () => {
  it('accepts a blank field as "leave this channel alone"', () => {
    expect(validateChannel(spec('heartRate'), '')).toBeNull();
    expect(validateChannel(spec('heartRate'), '   ')).toBeNull();
  });

  it('names the bounds in the message', () => {
    expect(validateChannel(spec('humidity'), '150')).toBe('Value must be between 0 and 100.');
    expect(validateChannel(spec('heartRate'), '25')).toBe('Value must be between 30 and 220.');
  });

  it('rejects text that is not a number', () => {
    for (const raw of ['abc', '--', '1.2.3', 'NaN']) {
      expect(validateChannel(spec('temperature'), raw)).not.toBeNull();
    }
  });

  it('accepts every bound exactly', () => {
    for (const channel of RISK_CHANNELS) {
      expect(validateChannel(channel, String(channel.min))).toBeNull();
      expect(validateChannel(channel, String(channel.max))).toBeNull();
    }
  });

  it('accepts a decimal where the channel has decimals', () => {
    expect(validateChannel(spec('temperature'), '32.5')).toBeNull();
    expect(validateChannel(spec('gapHours'), '1.75')).toBeNull();
  });
});

describe('Building the override the engine is solved over', () => {
  it('drops blank fields so untouched channels keep drifting', () => {
    expect(overrideFromDraft({ heartRate: '90', temperature: '' })).toEqual({ heartRate: 90 });
  });

  it('drops an out-of-range value rather than clamping it', () => {
    // Clamping silently solved 400 bpm as 220 and showed a score, so the field
    // looked like it had accepted a number the engine never saw.
    expect(overrideFromDraft({ heartRate: '400' })).toEqual({});
    expect(overrideFromDraft({ humidity: '-10' })).toEqual({});
  });

  it('never lets NaN through', () => {
    const out = overrideFromDraft({
      heartRate: 'abc',
      activityLoad: '',
      temperature: 'NaN',
      humidity: 'undefined',
      gapHours: '-',
    });
    expect(out).toEqual({});
    for (const value of Object.values(out)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('passes a full draft through in the engine’s own units', () => {
    expect(
      overrideFromDraft({
        heartRate: '110',
        activityLoad: '65',
        temperature: '33.5',
        humidity: '80',
        gapHours: '2.5',
      })
    ).toEqual({
      heartRate: 110,
      activityLoad: 65,
      temperature: 33.5,
      humidity: 80,
      gapHours: 2.5,
    });
  });

  it('produces an override the engine scores without erroring', () => {
    const override = overrideFromDraft({
      heartRate: '130',
      activityLoad: '85',
      temperature: '36',
      humidity: '80',
      gapHours: '3',
    });

    const result = HydrationRiskEngine.solveRisk({
      heartRate: override.heartRate!,
      activityLoad: override.activityLoad!,
      temperature: override.temperature!,
      humidity: override.humidity!,
      timeSinceWaterIntake: override.gapHours!,
    });

    // Every channel is in its top band, so this must land high and be a real
    // number — the point of the panel is that extremes are reachable.
    expect(result.score).not.toBeNull();
    expect(Number.isFinite(result.score!)).toBe(true);
    expect(result.score!).toBeGreaterThan(75);
    expect(result.status).toBe('Critical');
  });

  it('moves the score when one channel changes, and only through the engine', () => {
    const solve = (temperature: number) =>
      HydrationRiskEngine.solveRisk({
        heartRate: 75,
        activityLoad: 30,
        temperature,
        humidity: 50,
        timeSinceWaterIntake: 1,
      });

    // 20 °C is the lowest temperature band, 35 °C the highest.
    const cool = solve(20);
    const hot = solve(35);
    expect(hot.score!).toBeGreaterThan(cool.score!);
    expect(hot.temperatureLoad).toBe(90);
    expect(cool.temperatureLoad).toBe(10);
  });
});

describe('Field text', () => {
  it('shows a missing reading as blank, never as "null" or "NaN"', () => {
    expect(channelText(null, 0)).toBe('');
    expect(channelText(undefined, 0)).toBe('');
    expect(channelText(Number.NaN, 0)).toBe('');
    expect(channelText(Number.POSITIVE_INFINITY, 0)).toBe('');
  });

  it('trims trailing zeros a tester is about to retype', () => {
    expect(trimToDecimals(2.5, 2)).toBe('2.5');
    expect(trimToDecimals(75, 0)).toBe('75');
    expect(channelText(32.04, 1)).toBe('32');
  });
});

describe('Lookup', () => {
  it('finds a channel by key', () => {
    expect(riskChannel('temperature').unit).toBe('°C');
    expect(riskChannel('gapHours').unit).toBe('h');
    expect(riskChannel('activityLoad').unit).toBe('index');
  });
});
