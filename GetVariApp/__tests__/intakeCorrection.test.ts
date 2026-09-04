/**
 * Defect 4: "On AquaSage AI when user enters reduce 4 litre, updated value is
 * not getting reflected on front screen."
 *
 * The parser had no notion of direction, so "reduce 4 litre" was read as an
 * intake *of* 4,000ml. That then failed the unrealistic-amount check, the chat
 * reported a save error, and the day's total was untouched — so the request
 * appeared to do nothing. There was also no way whatsoever to take back a
 * mis-log once it was written.
 */

import { matchIntake, isRemovalRequest } from '../src/utils/parseIntake';

describe('telling an intake from a correction', () => {
  it.each([
    'reduce 4 litre',
    'reduce my intake by 4 litres',
    'remove 500 ml',
    'subtract 250ml',
    'take off 1 litre',
    'take back 500 ml',
    'I logged too much, 2 litres',
    'delete 250 ml',
    'I accidentally added 1 litre',
  ])('reads %p as a correction', text => {
    expect(matchIntake(text)?.direction).toBe('remove');
  });

  it.each([
    'I drank 500 ml',
    'log 1 litre',
    'add 2L to my intake',
    'just had 2 glasses',
    // Contains "less", which is about the amount and not an instruction to
    // take anything back.
    'I drank a little less than a litre',
  ])('reads %p as an intake', text => {
    expect(matchIntake(text)?.direction).toBe('add');
  });

  it('still reports the amount as a positive number', () => {
    // The sign is the caller's business — `adjustIntake` writes the negative
    // row — so the parser reports magnitude and direction separately.
    const parsed = matchIntake('reduce 4 litres');
    expect(parsed).toEqual({ amountMl: 4000, hasUnit: true, direction: 'remove' });
  });

  it('recognises a correction with no amount at all', () => {
    // "undo that" has nothing to parse, but the intent is still visible, which
    // is what lets the chat ask how much rather than treating it as a question.
    expect(isRemovalRequest('undo that')).toBe(true);
    expect(isRemovalRequest('how much water should I drink?')).toBe(false);
  });

  it('keeps the direction on a bare number', () => {
    expect(matchIntake('reduce 500')?.direction).toBe('remove');
    expect(matchIntake('500')?.direction).toBe('add');
  });
});
