import { HydrationRiskEngine } from '../src/utils/hydrationRiskEngine';

describe('Hydration Risk Score: Time Since Last Drink Buckets', () => {
  // The buckets are:
  // <= 30 mins -> 10
  // 31-60 mins -> 30
  // 61-120 mins -> 60
  // >= 121 mins -> 90

  const testCases = [
    { mins: 0, expected: 10 },
    { mins: 15, expected: 10 },
    { mins: 30, expected: 10 },
    { mins: 31, expected: 30 },
    { mins: 45, expected: 30 },
    { mins: 60, expected: 30 },
    { mins: 61, expected: 60 },
    { mins: 90, expected: 60 },
    { mins: 120, expected: 60 },
    { mins: 121, expected: 90 },
    { mins: 150, expected: 90 },
  ];

  testCases.forEach(({ mins, expected }) => {
    test(`Minutes: ${mins} should result in load: ${expected}`, () => {
      const hours = mins / 60;
      const load = HydrationRiskEngine.calculateTimeLoad(hours);
      expect(load).toBe(expected);
    });
  });

  test('Null input should result in null load', () => {
    expect(HydrationRiskEngine.calculateTimeLoad(null)).toBeNull();
  });
});
