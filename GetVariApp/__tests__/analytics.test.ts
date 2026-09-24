/**
 * The numbers behind the Analytics tab.
 */
import { computeStreak, dailyTotals, hourlyRhythm, weekSummary } from '../src/utils/analytics';
import type { HydrationLog } from '../src/types';

// Mon 21 Sep 2026, 18:00 local.
const NOW = new Date(2026, 8, 21, 18, 0).getTime();
const at = (daysAgo: number, hour: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const log = (daysAgo: number, ml: number, hour = 12): HydrationLog => ({
  id: `${daysAgo}-${hour}-${ml}`,
  timestamp: at(daysAgo, hour),
  amountMl: ml,
  source: 'manual',
});

describe('dailyTotals', () => {
  test('one slot per day, oldest first, empty days kept at zero', () => {
    const days = dailyTotals([log(0, 500), log(0, 250), log(2, 1000)], 7, 2000, NOW);
    expect(days).toHaveLength(7);
    expect(days[6].totalMl).toBe(750);
    expect(days[6].entries).toBe(2);
    expect(days[5].totalMl).toBe(0);
    expect(days[4].totalMl).toBe(1000);
    expect(days[6].label).toBe('Mon');
  });

  test('groups by local day, so a late-evening drink stays on its own day', () => {
    const days = dailyTotals([log(1, 400, 23)], 3, 2000, NOW);
    expect(days[1].totalMl).toBe(400);
    expect(days[2].totalMl).toBe(0);
  });

  test('a backdated entry counts on the day it was drunk', () => {
    const entry = { ...log(0, 300), reportedAt: at(1, 20) };
    const days = dailyTotals([entry], 2, 2000, NOW);
    expect(days[0].totalMl).toBe(300);
    expect(days[1].totalMl).toBe(0);
  });

  test('marks goal days, and none when there is no goal', () => {
    expect(dailyTotals([log(0, 2000)], 1, 2000, NOW)[0].goalMet).toBe(true);
    expect(dailyTotals([log(0, 1999)], 1, 2000, NOW)[0].goalMet).toBe(false);
    expect(dailyTotals([log(0, 5000)], 1, null, NOW)[0].goalMet).toBe(false);
  });
});

describe('computeStreak', () => {
  /**
   * `logged[i]` is whether that day has an entry at all. The amount is small
   * on purpose: the streak counts days logged, not days the goal was met, so
   * 250 ml against a 2,000 ml goal still has to extend it.
   */
  const daysFrom = (logged: boolean[]) =>
    dailyTotals(
      logged.flatMap((l, i) => (l ? [log(logged.length - 1 - i, 250)] : [])),
      logged.length,
      2000,
      NOW
    );

  test('counts back from today once something is logged', () => {
    const s = computeStreak(daysFrom([false, true, true, true]));
    expect(s).toMatchObject({ current: 3, best: 3, todayLogged: true });
  });

  test('an empty today does not reset the streak', () => {
    const s = computeStreak(daysFrom([true, true, true, false]));
    expect(s.current).toBe(3);
    expect(s.todayLogged).toBe(false);
  });

  test('a skipped yesterday ends it', () => {
    expect(computeStreak(daysFrom([true, true, false, false])).current).toBe(0);
  });

  test('best is the longest run anywhere', () => {
    const s = computeStreak(daysFrom([true, true, true, true, false, true, false]));
    expect(s.best).toBe(4);
    expect(s.current).toBe(1);
  });

  test('a day under the goal still counts — this is the reported defect', () => {
    // Every day logged, none anywhere near the 4,500 ml goal. Judged on
    // `goalMet` this returned 0 and told a diligent user they had no streak.
    const days = dailyTotals(
      [log(3, 2000), log(2, 2200), log(1, 1800), log(0, 2500)],
      4,
      4500,
      NOW
    );
    expect(days.every(d => !d.goalMet)).toBe(true);
    expect(computeStreak(days).current).toBe(4);
  });

  test('a day with no entries breaks it however high the goal-day totals are', () => {
    const days = dailyTotals([log(3, 9000), log(1, 9000), log(0, 9000)], 4, 2000, NOW);
    // Day index 2 is empty, so the run back from today is today + yesterday.
    expect(computeStreak(days).current).toBe(2);
  });

  test('no history at all is a streak of zero, not a crash', () => {
    expect(computeStreak([])).toEqual({
      current: 0,
      best: 0,
      todayLogged: false,
      bestStart: null,
      bestEnd: null,
    });
  });
});

describe('the best run names its days', () => {
  const daysFrom = (logged: boolean[]) =>
    dailyTotals(
      logged.flatMap((l, i) => (l ? [log(logged.length - 1 - i, 250)] : [])),
      logged.length,
      2000,
      NOW
    );

  test('the window spans exactly the best run', () => {
    // 6 days: gap, then a 3-day run, then a gap, then today.
    const days = daysFrom([false, true, true, true, false, true]);
    const s = computeStreak(days);
    expect(s.best).toBe(3);
    expect(s.bestStart).toBe(days[1].start);
    expect(s.bestEnd).toBe(days[3].start);
  });

  test('a one-day best starts and ends on the same day', () => {
    const days = daysFrom([false, true, false]);
    const s = computeStreak(days);
    expect(s.best).toBe(1);
    expect(s.bestStart).toBe(days[1].start);
    expect(s.bestEnd).toBe(days[1].start);
  });

  test('the earliest of two equally long runs keeps the title', () => {
    // Otherwise the dates under "Best" would move on their own, as a later
    // run drew level with one the user had already been shown.
    const days = daysFrom([true, true, false, true, true]);
    const s = computeStreak(days);
    expect(s.best).toBe(2);
    expect(s.bestStart).toBe(days[0].start);
    expect(s.bestEnd).toBe(days[1].start);
  });

  test('a run reaching today is still reported', () => {
    const days = daysFrom([false, true, true]);
    const s = computeStreak(days);
    expect(s.bestEnd).toBe(days[2].start);
  });

  test('no logged day anywhere leaves the window empty', () => {
    const s = computeStreak(daysFrom([false, false, false]));
    expect(s.best).toBe(0);
    expect(s.bestStart).toBeNull();
    expect(s.bestEnd).toBeNull();
  });

  test('the window is always start <= end and spans `best` days', () => {
    const days = daysFrom([true, false, true, true, true, true, false, true]);
    const s = computeStreak(days);
    expect(s.bestStart!).toBeLessThanOrEqual(s.bestEnd!);
    const spanDays = Math.round((s.bestEnd! - s.bestStart!) / 86_400_000) + 1;
    expect(spanDays).toBe(s.best);
  });
});

describe('weekSummary', () => {
  test('totals, averages and goal days for the last 7', () => {
    const logs = [log(0, 2000), log(1, 1000), log(3, 2500)];
    const w = weekSummary(dailyTotals(logs, 7, 2000, NOW));
    expect(w.totalMl).toBe(5500);
    expect(w.averageMl).toBe(786);
    expect(w.daysMet).toBe(2);
    expect(w.bestDay?.totalMl).toBe(2500);
    expect(w.changeVsLastWeek).toBeNull();
  });

  test('compares with the week before when 14 days are given', () => {
    const logs = [log(0, 1500), log(8, 1000)];
    expect(weekSummary(dailyTotals(logs, 14, 2000, NOW)).changeVsLastWeek).toBe(50);
  });
});

describe('hourlyRhythm', () => {
  test('buckets by hour of intake', () => {
    const buckets = hourlyRhythm([log(0, 250, 9), log(1, 500, 9), log(0, 300, 15)]);
    expect(buckets).toHaveLength(24);
    expect(buckets[9]).toBe(750);
    expect(buckets[15]).toBe(300);
  });
});
