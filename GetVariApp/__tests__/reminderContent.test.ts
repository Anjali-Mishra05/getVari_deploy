/**
 * What a reminder says, and why it never says a number it does not know.
 *
 * The reminder shipped one fixed line on every delivery — "Time to hydrate!" —
 * twelve times a day, telling the user nothing they did not already know.
 * These cover the replacement: real figures about this user, and the rule that
 * matters more than any of them, which is that an absent fact prints nothing
 * rather than a zero.
 *
 * A wrong number on a health notification is worse than no number. The user
 * cannot check it and the shade gives no room to qualify it, so every case
 * below where an input is missing asserts the *absence* of a line.
 *
 *   npx jest --config jest.config.logic.js __tests__/reminderContent.test.ts
 */

import {
  GENERIC_REMINDER_BODY,
  buildReminderContent,
} from '../src/utils/reminderContent';

describe('a reminder states what is known', () => {
  it('leads with the gap since the last drink', () => {
    const { body } = buildReminderContent({ hoursSinceDrink: 3.2 });
    expect(body).toBe('3h since your last drink');
  });

  it('states a gap under an hour in minutes, where the precision is useful', () => {
    expect(buildReminderContent({ hoursSinceDrink: 0.75 }).body).toBe(
      '45 min since your last drink'
    );
    expect(buildReminderContent({ hoursSinceDrink: 0 }).body).toBe('Just logged a drink');
  });

  it('rounds hours down rather than reporting a measurement', () => {
    // "2.7 hours" reads as an instrument; "2h" reads as a fact.
    expect(buildReminderContent({ hoursSinceDrink: 2.7 }).body).toContain('2h');
    expect(buildReminderContent({ hoursSinceDrink: 2.7 }).body).not.toContain('2.7');
  });

  it('measures today against the goal', () => {
    const { body } = buildReminderContent({ totalMl: 750, targetMl: 3000 });
    expect(body).toBe('750 / 3000 ml — 2250 ml to go');
  });

  it('says the goal is reached instead of counting past zero', () => {
    // A reminder still nagging for "-200 ml to go" is the app failing to
    // notice the user succeeded.
    const { body } = buildReminderContent({ totalMl: 3200, targetMl: 3000 });
    expect(body).toBe('3200 / 3000 ml — goal reached');
  });

  it('adds the risk score with its band, never bare', () => {
    const { body } = buildReminderContent({ riskScore: 68, riskStatus: 'High Risk' });
    expect(body).toBe('Risk 68 · High Risk');
  });

  it('orders the facts by what should change the user’s next action', () => {
    const { body } = buildReminderContent({
      hoursSinceDrink: 4,
      totalMl: 500,
      targetMl: 3000,
      riskScore: 72,
      riskStatus: 'High Risk',
    });
    expect(body).toBe(
      '4h since your last drink · 500 / 3000 ml — 2500 ml to go · Risk 72 · High Risk'
    );
  });

  it('keeps the title stable, so the reminder is recognisable in the shade', () => {
    expect(buildReminderContent({ riskScore: 10, riskStatus: 'Hydrated' }).title).toBe(
      buildReminderContent().title
    );
  });
});

describe('a reminder never states what it does not know', () => {
  it('falls back to the generic line when nothing is known', () => {
    expect(buildReminderContent().body).toBe(GENERIC_REMINDER_BODY);
    expect(buildReminderContent({}).body).toBe(GENERIC_REMINDER_BODY);
  });

  it('prints nothing at all for a null risk score', () => {
    // `null` is the engine's "Insufficient Data". A dash or a zero would both
    // read as a real reading.
    const { body } = buildReminderContent({
      hoursSinceDrink: 2,
      riskScore: null,
      riskStatus: 'Insufficient Data',
    });
    expect(body).toBe('2h since your last drink');
    expect(body).not.toMatch(/risk/i);
  });

  it('withholds the score when the band is missing', () => {
    // "68" alone means nothing to a user who has not memorised the scale.
    expect(buildReminderContent({ riskScore: 68 }).body).toBe(GENERIC_REMINDER_BODY);
  });

  it('states the total without a goal when there is no goal to state', () => {
    // A fluid-restricted profile with no physician limit on file. Measuring
    // progress would mean inventing the denominator the app refuses to invent.
    const { body } = buildReminderContent({ totalMl: 900, targetMl: null });
    expect(body).toBe('900 ml logged today');
    expect(body).not.toContain('/');
  });

  it('omits progress entirely when the total itself is unknown', () => {
    expect(buildReminderContent({ targetMl: 3000 }).body).toBe(GENERIC_REMINDER_BODY);
  });

  it('drops a value that is not a finite number', () => {
    // A failed read that resolved to NaN must not reach the shade as "NaN ml".
    const { body } = buildReminderContent({
      hoursSinceDrink: Number.NaN,
      totalMl: Number.POSITIVE_INFINITY,
      riskScore: Number.NaN,
      riskStatus: 'High Risk',
    });
    expect(body).toBe(GENERIC_REMINDER_BODY);
    expect(body).not.toMatch(/nan|infinity/i);
  });

  it('drops a negative gap rather than printing one', () => {
    // Clock skew between the device and the server can date a log in the
    // future; "-1h since your last drink" is worse than saying nothing.
    expect(buildReminderContent({ hoursSinceDrink: -2 }).body).toBe(GENERIC_REMINDER_BODY);
  });
});
