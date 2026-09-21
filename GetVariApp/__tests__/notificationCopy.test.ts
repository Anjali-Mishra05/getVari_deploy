/**
 * The rules every notification body has to obey.
 *
 * Two of them are product rules the user stated directly — a forecast is
 * always hedged ("may", "could", never "will" or "would"), and a hydration
 * notification carries the risk score it was raised over — and both are the
 * kind of rule that decays silently: the message table is edited far more
 * often than the module that builds it, and a single "will" slipped into a
 * health notification is a claim the app cannot stand behind and the user
 * cannot check.
 *
 * The third is the projection itself. FDI and CDI are the only part of the
 * engine that can say anything about the *next* half hour, and what they say
 * is a proxy: distance to the next band edge, rounded to a lead time. Pinning
 * that mapping here is what keeps "in the next 15 minutes" from drifting into
 * a number nobody chose.
 *
 *   npx jest --config jest.config.logic.js __tests__/notificationCopy.test.ts
 */

import {
  LEAD_TIMES_MIN,
  MAX_DROP_NOTICE_WORDS,
  countWords,
  buildDropNotice,
  describeRisk,
  isHedged,
  projectDropMinutes,
  unhedgedWord,
  withRisk,
} from '../src/utils/notificationCopy';

describe('the hedging rule', () => {
  test('rejects the words that claim certainty', () => {
    expect(isHedged('Your focus will drop.')).toBe(false);
    expect(isHedged('That would help.')).toBe(false);
    expect(isHedged('This definitely happens.')).toBe(false);
    expect(unhedgedWord('Your focus will drop.')).toBe('will');
  });

  test('accepts the hedged forms, and leaves innocent words alone', () => {
    expect(isHedged('Your focus may start to slip.')).toBe(true);
    expect(isHedged('A glass of water could help.')).toBe(true);
    // "willing" and "wound" contain the forbidden words but are not them.
    expect(isHedged('A willing sip could help a wound heal.')).toBe(true);
  });

  test('every notice this module can produce is hedged', () => {
    for (const kind of ['focus', 'cognitive'] as const) {
      for (const severity of ['early', 'severe'] as const) {
        for (const score of [25, 40, 55, 60, 95]) {
          const { body } = buildDropNotice(kind, severity, score, {
            riskScore: 62,
            riskStatus: 'High Risk',
          });
          expect({ kind, severity, score, offender: unhedgedWord(body) }).toEqual({
            kind,
            severity,
            score,
            offender: null,
          });
        }
      }
    }
  });
});

describe('the risk score', () => {
  test('is stated with its band', () => {
    expect(describeRisk({ riskScore: 61.6, riskStatus: 'High Risk' })).toBe(
      'Hydration risk 62 · High Risk'
    );
  });

  test('is left out entirely when the engine has no score', () => {
    // "Insufficient Data" is null, and a 0 printed there would read as the
    // best possible score rather than as no reading at all.
    expect(describeRisk({ riskScore: null, riskStatus: 'Insufficient Data' })).toBeNull();
    expect(describeRisk({})).toBeNull();
    expect(withRisk('Drink some water.', {})).toBe('Drink some water.');
  });

  test('is appended to a body that has one', () => {
    expect(withRisk('Drink some water.', { riskScore: 40, riskStatus: 'Mild Risk' })).toBe(
      'Drink some water. Hydration risk 40 · Mild Risk.'
    );
  });
});

describe('the lead time', () => {
  test('is one of the four round numbers on offer', () => {
    for (let score = 0; score <= 100; score += 1) {
      expect(LEAD_TIMES_MIN).toContain(projectDropMinutes(score, 'early') as any);
      expect(LEAD_TIMES_MIN).toContain(projectDropMinutes(score, 'severe') as any);
    }
  });

  test('shortens as the index closes on the next band', () => {
    // 25 is the bottom of the band; 60 is where the next one starts.
    expect(projectDropMinutes(25, 'early')).toBe(60);
    expect(projectDropMinutes(40, 'early')).toBe(45);
    expect(projectDropMinutes(50, 'early')).toBe(30);
    expect(projectDropMinutes(58, 'early')).toBe(15);
  });

  test('never lengthens as the index rises', () => {
    let previous = Infinity;
    for (let score = 25; score <= 60; score += 1) {
      const minutes = projectDropMinutes(score, 'early');
      expect(minutes).toBeLessThanOrEqual(previous);
      previous = minutes;
    }
  });

  test('reports the shortest lead once the band is already reached', () => {
    // There is no higher edge to count down to, so the alert is about now.
    expect(projectDropMinutes(60, 'severe')).toBe(15);
    expect(projectDropMinutes(95, 'severe')).toBe(15);
  });

  test('falls back to the longest lead on an unusable score', () => {
    expect(projectDropMinutes(Number.NaN, 'early')).toBe(60);
  });
});

describe('what the four notices say', () => {
  const context = { riskScore: 58, riskStatus: 'High Risk' };

  test('focus, early: the forecast, the score, then the suggestion', () => {
    const { title, body, leadMinutes } = buildDropNotice('focus', 'early', 50, context);
    expect(title).toBe('🧭 Focus Slipping');
    expect(leadMinutes).toBe(30);
    expect(body).toBe('Focus may slip within 30 min. Risk 58. Sip water and fix your posture.');
  });

  test('cognitive, early: names the index in the user’s words, not the model’s', () => {
    const { title, body } = buildDropNotice('cognitive', 'early', 50, context);
    expect(title).toBe('💧 Cognitive Decline Risk');
    expect(body).toBe('Sharpness may dip within 30 min. Risk 58. Drink fluids and find somewhere cooler.');
  });

  test('the severe bands keep hedging rather than escalating into certainty', () => {
    expect(buildDropNotice('focus', 'severe', 80, context).body).toContain(
      'Focus could drop sharply within 15 min.'
    );
    expect(buildDropNotice('cognitive', 'severe', 80, context).body).toContain(
      'Thinking could be affected within 15 min.'
    );
  });

  test('a notice with no risk score states the forecast and nothing it cannot back', () => {
    const { body } = buildDropNotice('focus', 'early', 50, { riskScore: null });
    expect(body).not.toContain('Risk');
    expect(body).toBe('Focus may slip within 30 min. Sip water and fix your posture.');
  });

  test('every notice is at most 15 words, at every score', () => {
    for (const kind of ['focus', 'cognitive'] as const) {
      for (const severity of ['early', 'severe'] as const) {
        for (const score of [0, 25, 40, 55, 60, 95]) {
          const { body } = buildDropNotice(kind, severity, score, { riskScore: 100, riskStatus: 'High Risk' });
          expect(countWords(body)).toBeLessThanOrEqual(MAX_DROP_NOTICE_WORDS);
        }
      }
    }
    expect(MAX_DROP_NOTICE_WORDS).toBe(15);
  });
});

