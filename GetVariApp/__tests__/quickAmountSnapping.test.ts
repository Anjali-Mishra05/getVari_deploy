/**
 * Opening the quick-log sheet on a suggested amount.
 *
 * The risk card's water-requirement pill suggests a multiple of 250 ml, which
 * the admin config's offered amounts need not contain. The suggestion picks
 * which row opens selected; it never adds a row, so the sheet's grid stays the
 * only answer to what can be logged.
 */

jest.mock('../src/config/appConfigStore', () => ({
  __esModule: true,
  default: {
    current: () => ({
      quickLogAmounts: [
        { ml: 250, label: '250 ml' },
        { ml: 500, label: '500 ml', primary: true },
        { ml: 1000, label: '1 litre' },
      ],
    }),
  },
}));

import { nearestQuickAmount, primaryQuickAmount } from '../src/utils/hydrationAmounts';

describe('a suggested amount snaps to one the sheet offers', () => {
  it('takes an exact match unchanged', () => {
    expect(nearestQuickAmount(500).ml).toBe(500);
    expect(nearestQuickAmount(250).ml).toBe(250);
  });

  it('snaps a suggestion the list does not carry', () => {
    // Four glasses, nearer 1000 than 500.
    expect(nearestQuickAmount(850).ml).toBe(1000);
    // One and a bit glasses.
    expect(nearestQuickAmount(300).ml).toBe(250);
  });

  it('breaks a tie downward, so it never opens on more than was asked for', () => {
    // 375 sits exactly between 250 and 500...
    expect(nearestQuickAmount(375).ml).toBe(250);
    // ...and three glasses sits exactly between 500 and 1000, which is the
    // tie the risk card actually produces.
    expect(nearestQuickAmount(750).ml).toBe(500);
  });

  it('clamps past the ends of the list rather than inventing an amount', () => {
    expect(nearestQuickAmount(50).ml).toBe(250);
    expect(nearestQuickAmount(9000).ml).toBe(1000);
  });

  it('falls back to the pre-selected amount for a suggestion that is not one', () => {
    expect(nearestQuickAmount(0).ml).toBe(primaryQuickAmount().ml);
    expect(nearestQuickAmount(-250).ml).toBe(primaryQuickAmount().ml);
    expect(nearestQuickAmount(Number.NaN).ml).toBe(primaryQuickAmount().ml);
  });
});
