/**
 * The sleep window decides two things the user feels directly: whether a
 * notification is allowed to fire, and whether an hour counts against their
 * hydration average. Both hinge on arithmetic that wraps past midnight, which
 * is exactly the kind of thing that reads as obviously correct and isn't.
 *
 * Dates are built from local components on purpose — the module reads local
 * wall-clock time, because a bedtime is a habit rather than an instant.
 */
import {
  DEFAULT_SLEEP_SCHEDULE,
  asleepMinutesBetween,
  awakeHoursBetween,
  awakeHoursPerDay,
  describeSleepWindow,
  expectedMlByNow,
  formatClock,
  formatClockLabel,
  isAsleepAt,
  lastWakeUpAt,
  mlPerAwakeHour,
  nextAwakeAt,
  normaliseSleepSchedule,
  parseClock,
  sleepDurationMinutes,
} from '../src/utils/sleepWindow';

/** 23:00 → 07:00, the default: the window wraps past midnight. */
const OVERNIGHT = DEFAULT_SLEEP_SCHEDULE;
/** 02:00 → 10:00, a late sleeper: the window sits inside one calendar day. */
const SAME_DAY = { sleepStart: '02:00', wakeUp: '10:00' };

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 0, day, hour, minute, 0, 0);

describe('clock parsing', () => {
  it('reads and rewrites HH:MM', () => {
    expect(parseClock('07:30')).toBe(450);
    expect(parseClock('7:05')).toBe(425);
    expect(formatClock(450)).toBe('07:30');
  });

  it('rejects anything that is not a time', () => {
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('07:60')).toBeNull();
    expect(parseClock('half past seven')).toBeNull();
    expect(parseClock(730)).toBeNull();
    expect(parseClock(undefined)).toBeNull();
  });

  it('labels times the way the user reads them', () => {
    expect(formatClockLabel('23:00')).toBe('11:00 PM');
    expect(formatClockLabel('00:15')).toBe('12:15 AM');
    expect(formatClockLabel('12:00')).toBe('12:00 PM');
  });
});

describe('normaliseSleepSchedule', () => {
  it('accepts the nested shape onboarding writes', () => {
    expect(normaliseSleepSchedule({ sleepSchedule: { sleepStart: '23:00', wakeUp: '7:00' } })).toEqual({
      sleepStart: '23:00',
      wakeUp: '07:00',
    });
  });

  it('accepts the two fields sitting flat on a profile', () => {
    expect(normaliseSleepSchedule({ sleepStart: '22:30', wakeUp: '06:30' })).toEqual({
      sleepStart: '22:30',
      wakeUp: '06:30',
    });
  });

  it('returns null for a profile that predates the question', () => {
    expect(normaliseSleepSchedule({ age: 26 })).toBeNull();
    expect(normaliseSleepSchedule(undefined)).toBeNull();
    expect(normaliseSleepSchedule({ sleepStart: '23:00' })).toBeNull();
  });
});

describe('isAsleepAt', () => {
  it('covers both sides of midnight for an overnight window', () => {
    expect(isAsleepAt(OVERNIGHT, at(15, 23, 30))).toBe(true);
    expect(isAsleepAt(OVERNIGHT, at(16, 2, 0))).toBe(true);
    expect(isAsleepAt(OVERNIGHT, at(15, 22, 59))).toBe(false);
    expect(isAsleepAt(OVERNIGHT, at(16, 7, 0))).toBe(false);
  });

  it('handles a window that never crosses midnight', () => {
    expect(isAsleepAt(SAME_DAY, at(15, 3, 0))).toBe(true);
    expect(isAsleepAt(SAME_DAY, at(15, 11, 0))).toBe(false);
    expect(isAsleepAt(SAME_DAY, at(15, 1, 0))).toBe(false);
  });

  it('treats identical times as no window at all, rather than a silent day', () => {
    const none = { sleepStart: '08:00', wakeUp: '08:00' };
    expect(isAsleepAt(none, at(15, 8, 0))).toBe(false);
    expect(isAsleepAt(none, at(15, 3, 0))).toBe(false);
    expect(awakeHoursPerDay(none)).toBe(24);
  });
});

describe('nextAwakeAt', () => {
  it('moves a nighttime reminder to the wake-up time', () => {
    const shifted = nextAwakeAt(OVERNIGHT, at(16, 2, 30).getTime());
    expect(new Date(shifted)).toEqual(at(16, 7, 0));
  });

  it('moves a pre-midnight reminder to the *next* morning', () => {
    const shifted = nextAwakeAt(OVERNIGHT, at(15, 23, 45).getTime());
    expect(new Date(shifted)).toEqual(at(16, 7, 0));
  });

  it('leaves a waking-hours reminder exactly where it is', () => {
    const untouched = at(15, 14, 12).getTime();
    expect(nextAwakeAt(OVERNIGHT, untouched)).toBe(untouched);
  });
});

describe('awake time', () => {
  it('discounts the night from a gap that spans it', () => {
    // 22:30 to 07:15 is 8h45m of clock, but only 45m of it awake.
    const hours = awakeHoursBetween(OVERNIGHT, at(15, 22, 30).getTime(), at(16, 7, 15).getTime());
    expect(hours).toBeCloseTo(0.75, 5);
  });

  it('counts a gap entirely inside waking hours in full', () => {
    const hours = awakeHoursBetween(OVERNIGHT, at(15, 13, 0).getTime(), at(15, 16, 30).getTime());
    expect(hours).toBeCloseTo(3.5, 5);
  });

  it('counts a gap entirely inside the night as nothing', () => {
    const hours = awakeHoursBetween(OVERNIGHT, at(16, 0, 30).getTime(), at(16, 4, 30).getTime());
    expect(hours).toBeCloseTo(0, 5);
  });

  it('accumulates across several nights', () => {
    const minutes = asleepMinutesBetween(OVERNIGHT, at(15, 12, 0).getTime(), at(18, 12, 0).getTime());
    expect(minutes).toBeCloseTo(3 * 8 * 60, 5);
  });

  it('is symmetric and never negative', () => {
    const from = at(15, 22, 30).getTime();
    const to = at(16, 7, 15).getTime();
    expect(awakeHoursBetween(OVERNIGHT, to, from)).toBeCloseTo(
      awakeHoursBetween(OVERNIGHT, from, to),
      5
    );
    expect(awakeHoursBetween(OVERNIGHT, to, to)).toBe(0);
  });
});

describe('averages over waking hours', () => {
  it('spreads the daily goal over the hours the user is actually up', () => {
    expect(sleepDurationMinutes(OVERNIGHT)).toBe(480);
    expect(awakeHoursPerDay(OVERNIGHT)).toBe(16);
    expect(mlPerAwakeHour(3200, OVERNIGHT)).toBe(200);
  });

  it('paces the day from the morning wake-up, not from midnight', () => {
    // 07:00 to 15:00 is half of a 16-hour waking day.
    expect(expectedMlByNow(3200, OVERNIGHT, at(15, 15, 0).getTime())).toBe(1600);
    expect(expectedMlByNow(3200, OVERNIGHT, at(15, 7, 0).getTime())).toBe(0);
  });

  it('reads the night as a finished day rather than a failed one', () => {
    expect(expectedMlByNow(3200, OVERNIGHT, at(16, 2, 0).getTime())).toBe(3200);
  });

  it('anchors the waking day to the most recent wake-up', () => {
    expect(new Date(lastWakeUpAt(OVERNIGHT, at(15, 15, 0).getTime()))).toEqual(at(15, 7, 0));
    // Before this morning's alarm, the current stretch began yesterday.
    expect(new Date(lastWakeUpAt(OVERNIGHT, at(15, 3, 0).getTime()))).toEqual(at(14, 7, 0));
  });
});

describe('describeSleepWindow', () => {
  it('summarises the window for the profile sheet', () => {
    expect(describeSleepWindow(OVERNIGHT)).toBe('11:00 PM – 7:00 AM · 8h');
  });
});
