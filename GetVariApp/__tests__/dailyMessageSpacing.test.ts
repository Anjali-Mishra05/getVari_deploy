/**
 * The 2-hourly cadence keeps clear of the daily messages.
 *
 * At 07:00 the user got two notifications in the same minute: the "Good
 * Morning" message and a hydration reminder. `REMINDER_RESUME_OFFSET_MS` was
 * written for exactly this, but it only applies to slots pushed out of the
 * sleep window — so it protected the greeting only when it happened to fall
 * on the wake-up time. A cadence that lands on the hour by itself walked
 * straight into it.
 *
 * The messages are no longer at fixed hours: they are an hour after wake-up
 * and an hour before bedtime. With the default 23:00–07:00 window that puts
 * the greeting at 08:00 and the wind-down at 22:00, and the guard has to
 * follow them rather than a hardcoded time — which is what the shifted-window
 * case at the bottom pins down.
 */

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {},
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  AndroidStyle: { BIGTEXT: 1 },
  AndroidCategory: {},
  AndroidVisibility: {},
  AuthorizationStatus: { AUTHORIZED: 1 },
  EventType: {},
  TriggerType: { TIMESTAMP: 0 },
  AlarmType: { SET_ALARM_CLOCK: 0, SET_EXACT_AND_ALLOW_WHILE_IDLE: 1 },
}));
jest.mock('@react-native-firebase/messaging', () => ({}));
jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 33 },
  NativeModules: {},
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import {
  DAILY_MESSAGES,
  clearOfDailyMessages,
  dailyMessageBody,
  dailyMessageMinute,
} from '../src/services/NotificationService';
import {
  GENERIC_REMINDER_BODIES,
  GENERIC_REMINDER_BODY,
  genericReminderBody,
} from '../src/utils/reminderContent';

/** A local-time helper, so these read as clock times rather than epochs. */
const at = (hour: number, minute = 0) => new Date(2026, 4, 14, hour, minute, 0, 0).getTime();

const clockOf = (ms: number) => {
  const d = new Date(ms);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
};

describe('a reminder slot is moved clear of a daily message', () => {
  it('pushes a slot landing exactly on the greeting', () => {
    // The reported collision, at the greeting's derived time.
    expect(clockOf(clearOfDailyMessages(at(8, 0)))).toBe('08:30');
  });

  it('pushes a slot landing just before the greeting', () => {
    expect(clockOf(clearOfDailyMessages(at(7, 45)))).toBe('08:30');
  });

  it('pushes a slot landing just after the greeting', () => {
    expect(clockOf(clearOfDailyMessages(at(8, 20)))).toBe('08:30');
  });

  it('does the same for the 22:00 bedtime message', () => {
    expect(clockOf(clearOfDailyMessages(at(22, 0)))).toBe('22:30');
    expect(clockOf(clearOfDailyMessages(at(21, 40)))).toBe('22:30');
  });

  it('leaves a slot outside the guard exactly where it is', () => {
    for (const [hour, minute] of [
      [6, 25],
      [9, 0],
      [12, 0],
      [17, 30],
      [21, 25],
      [23, 15],
    ] as const) {
      expect(clearOfDailyMessages(at(hour, minute))).toBe(at(hour, minute));
    }
  });

  it('only ever moves a slot forward', () => {
    // Pulling it earlier would put the reminder before the greeting instead of
    // after it — the same clump, seen from the other side.
    for (let minute = -29; minute <= 29; minute++) {
      const slot = at(8, 0) + minute * 60_000;
      expect(clearOfDailyMessages(slot)).toBeGreaterThanOrEqual(slot);
    }
  });

  it('settles: a moved slot is itself clear of every message', () => {
    for (let hour = 0; hour < 24; hour++) {
      for (const minute of [0, 15, 30, 45]) {
        const moved = clearOfDailyMessages(at(hour, minute));
        // Running it again must be a no-op, or the queue could be built from a
        // timestamp that is still inside a guard window.
        expect(clearOfDailyMessages(moved)).toBe(moved);
      }
    }
  });

  it('keeps at least the guard between a reminder and both messages', () => {
    for (let hour = 0; hour < 24; hour++) {
      for (const minute of [0, 10, 20, 30, 40, 50]) {
        const moved = clearOfDailyMessages(at(hour, minute));
        for (const messageHour of [8, 22]) {
          const gap = Math.abs(moved - at(messageHour, 0));
          // Either comfortably far, or exactly the guard away.
          expect(gap).toBeGreaterThanOrEqual(30 * 60_000);
        }
      }
    }
  });

  it('follows a shifted window instead of a hardcoded hour', () => {
    // A night-shift window: asleep 09:00–17:00, so the greeting is at 18:00
    // and the wind-down at 08:00. A guard pinned to 08:00/22:00 would protect
    // the wrong two times and leave the real ones exposed.
    const nightShift = { sleepStart: '09:00', wakeUp: '17:00' };

    expect(clockOf(clearOfDailyMessages(at(18, 0), nightShift))).toBe('18:30');
    expect(clockOf(clearOfDailyMessages(at(8, 0), nightShift))).toBe('08:30');
    // ...and the default window's times are now ordinary slots.
    expect(clearOfDailyMessages(at(22, 0), nightShift)).toBe(at(22, 0));
  });
});

describe('the daily messages are placed from the sleep window', () => {
  const minuteOf = (m: any, schedule: any) => dailyMessageMinute(m, schedule);
  const morning = DAILY_MESSAGES.find(m => m.key === 'morning')!;
  const night = DAILY_MESSAGES.find(m => m.key === 'night')!;
  const water = DAILY_MESSAGES.find(m => m.key === 'water')!;

  it('puts the greeting half an hour after wake-up', () => {
    expect(minuteOf(morning, { sleepStart: '23:00', wakeUp: '07:00' })).toBe(7 * 60 + 30);
    expect(minuteOf(morning, { sleepStart: '01:00', wakeUp: '09:30' })).toBe(10 * 60);
  });

  it('puts the Daily Water Requirement an hour after wake-up', () => {
    expect(minuteOf(water, { sleepStart: '23:00', wakeUp: '07:00' })).toBe(8 * 60);
    expect(minuteOf(water, { sleepStart: '01:00', wakeUp: '09:30' })).toBe(10 * 60 + 30);
  });

  it('puts the wind-down an hour before bedtime', () => {
    expect(minuteOf(night, { sleepStart: '23:00', wakeUp: '07:00' })).toBe(22 * 60);
    expect(minuteOf(night, { sleepStart: '01:00', wakeUp: '09:30' })).toBe(0);
  });

  it('wraps around midnight rather than clamping to it', () => {
    // Bed at 00:30 means the wind-down belongs at 23:30 the evening before,
    // not at 00:00 — which is a time nothing should ever be sent.
    expect(minuteOf(night, { sleepStart: '00:30', wakeUp: '08:00' })).toBe(23 * 60 + 30);
    // And waking at 23:45 puts the greeting just after midnight.
    expect(minuteOf(morning, { sleepStart: '10:00', wakeUp: '23:45' })).toBe(15);
    expect(minuteOf(water, { sleepStart: '10:00', wakeUp: '23:30' })).toBe(30);
  });

  it('falls back to the default window rather than midnight when unparseable', () => {
    const broken = { sleepStart: 'nonsense', wakeUp: '' } as any;
    expect(minuteOf(morning, broken)).toBe(7 * 60 + 30); // default wake 07:00 + 30 min
    expect(minuteOf(night, broken)).toBe(22 * 60); // default bed 23:00 − 1h
    expect(minuteOf(morning, broken)).not.toBe(0);
  });

  it('never returns a minute outside the day', () => {
    for (const hour of [0, 1, 6, 12, 18, 23]) {
      for (const message of DAILY_MESSAGES) {
        const minute = minuteOf(message, {
          sleepStart: `${`${hour}`.padStart(2, '0')}:00`,
          wakeUp: `${`${(hour + 8) % 24}`.padStart(2, '0')}:00`,
        });
        expect(minute).toBeGreaterThanOrEqual(0);
        expect(minute).toBeLessThan(1440);
      }
    }
  });
});

describe('the daily message copy varies', () => {
  const morning = DAILY_MESSAGES.find(m => m.key === 'morning')!;
  const dayAt = (day: number) => new Date(2026, 4, day, 9, 0, 0).getTime();

  it('offers more than one line per message', () => {
    for (const message of DAILY_MESSAGES) {
      expect(message.bodies.length).toBeGreaterThan(1);
      expect(new Set(message.bodies).size).toBe(message.bodies.length);
    }
  });

  it('is stable for a given day, however often the queue is rebuilt', () => {
    // The queue is torn down and rebuilt on every app open and every logged
    // drink; a random pick would rewrite tomorrow's greeting all day.
    const first = dailyMessageBody(morning, dayAt(14));
    for (let i = 0; i < 20; i++) expect(dailyMessageBody(morning, dayAt(14))).toBe(first);
    // Same day, different time of day, same line.
    expect(dailyMessageBody(morning, new Date(2026, 4, 14, 23, 59).getTime())).toBe(first);
  });

  it('changes from one day to the next', () => {
    expect(dailyMessageBody(morning, dayAt(15))).not.toBe(dailyMessageBody(morning, dayAt(14)));
  });

  it('cycles through the whole pool over consecutive days', () => {
    const seen = new Set(
      Array.from({ length: morning.bodies.length }, (_, i) => dailyMessageBody(morning, dayAt(10 + i)))
    );
    expect(seen.size).toBe(morning.bodies.length);
  });
});

describe('the generic reminder line varies by slot', () => {
  it('keeps the spec line as the sentinel the refresh check compares against', () => {
    expect(GENERIC_REMINDER_BODIES).toContain(GENERIC_REMINDER_BODY);
  });

  it('gives consecutive slots different lines', () => {
    expect(genericReminderBody(1)).not.toBe(genericReminderBody(2));
  });

  it('is stable for a given slot', () => {
    for (let i = 0; i < 10; i++) expect(genericReminderBody(3)).toBe(genericReminderBody(3));
  });

  it('always returns a real line, whatever the slot', () => {
    for (const slot of [0, 1, 99, -4, 1.7, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(GENERIC_REMINDER_BODIES).toContain(genericReminderBody(slot));
    }
  });
});
