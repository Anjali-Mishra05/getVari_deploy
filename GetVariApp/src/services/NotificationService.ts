import notifee, {
  AlarmType,
  AndroidCategory,
  AndroidImportance,
  AndroidNotificationSetting,
  AndroidStyle,
  AndroidVisibility,
  AuthorizationStatus,
  Event,
  EventType,
  Notification,
  TimestampTrigger,
  TriggerType,
} from '@notifee/react-native';
// v26 of the Firebase SDK dropped the namespaced `messaging()` accessor; the
// modular functions below take the instance from `getMessaging()` instead.
import {
  AuthorizationStatus as MessagingAuthorizationStatus,
  getMessaging,
  getToken,
  onMessage,
  requestPermission as requestMessagingPermission,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

import ActiveReminder, { DISMISS_SNOOZE_MS, type ActiveReminderRecord } from './ActiveReminder';
import NotificationHistory from './NotificationHistory';
import { primaryQuickAmount } from '../utils/hydrationAmounts';
import type { ReminderFacts } from '../utils/reminderContent';
import {
  DEFAULT_SLEEP_SCHEDULE,
  SleepSchedule,
  isAsleepAt,
  nextAwakeAt,
  normaliseSleepSchedule,
  describeSleepWindow,
  parseClock,
} from '../utils/sleepWindow';
import type { NotificationKind } from '../types';
import buildNotificationContent from '../utils/notificationContent';
import {
  DROP_INDEX_ALERT_THRESHOLD,
  NOTIFICATION_COOLDOWNS,
  NOTIFICATION_SIMULATION,
  RISK_THRESHOLDS,
} from '../config/edgeCaseConfig';
import type { NotificationTrigger } from './NotificationEngine';

/**
 * Channel id carries a version, because Android notification channels are
 * **immutable once created**. Changing importance, sound or vibration in code
 * does nothing to a channel the user already has — the original was created
 * without a sound, so every reminder arrived silently (`sound=null
 * vibrate=null` in the notification record) with nothing for the user to
 * notice. Bumping the id is the only way a change to these settings actually
 * reaches an existing install.
 */
export const REMINDER_CHANNEL_ID = 'hydration-reminders-v3';
/** Retired ids, deleted on startup so they don't linger in system settings. */
const LEGACY_CHANNEL_IDS = ['hydration-reminders', 'hydration-reminders-v2'];
const REMINDER_ID_PREFIX = 'hydration-reminder-';
/**
 * Id of the one-shot nudge that brings a snoozed reminder back.
 *
 * Deliberately outside `REMINDER_ID_PREFIX`: the cadence rebuild cancels every
 * id carrying that prefix, and it runs on every foreground. A snooze sharing
 * the prefix would therefore be wiped the moment the user opened the app —
 * which is the one thing that must not happen to a reminder they asked to be
 * reminded about later. It is cancelled explicitly, when the reminder is
 * actually answered.
 */
const SNOOZE_ID = 'hydration-snooze-nudge';
const PENDING_PROMPT_KEY = 'getvari_pending_hydration_prompt';

/**
 * The app's own reminder sound, as `res/raw/getvari_reminder.wav`.
 *
 * Android names raw resources without their extension. The reminder used the
 * system default, which on a phone full of chat apps is indistinguishable from
 * any of them — a sound of our own is the difference between "something
 * pinged" and "that's the water one".
 *
 * Swapping the file is enough to rebrand it, but note the channel rule above:
 * a sound change only reaches an existing install when the channel id is
 * bumped too.
 */
const REMINDER_SOUND = 'getvari_reminder';

/**
 * Press-action ids carried by the reminder.
 *
 * `default` is deliberately not reused for any of them: the background handler
 * has to be able to tell "the user tapped the body" (open the app) from "the
 * user pressed Snooze" (do not open the app at all), and the id is the only
 * thing that distinguishes them.
 */
export const REMINDER_PRESS_ACTION = 'open-hydration-chat';
export const REMINDER_LOG_ACTION = 'hydration-log-primary';
export const REMINDER_SNOOZE_ACTION = 'hydration-snooze';
export const REMINDER_FULL_SCREEN_ACTION = 'hydration-full-screen';

/** How long the notification's inline "Snooze" button pushes a reminder back. */
export const NOTIFICATION_SNOOZE_MIN = 15;
/**
 * The sleep window is cached on the device rather than read from the profile
 * row, because scheduling runs from places that have no Supabase session in
 * hand — a background handler, a cold start, the headless delivery task.
 */
const SLEEP_SCHEDULE_KEY = 'getvari_sleep_schedule';
const NOTIFICATION_RECIPIENT_KEY = 'getvari_notification_recipient';
const DAILY_WATER_TARGET_KEY = 'getvari_notification_daily_water_target';
/** The account id the current schedule was built for. See `adoptAccount`. */
const SCHEDULE_OWNER_KEY = 'getvari_notification_schedule_owner';
/**
 * `NotificationEngine`'s persisted state (once-a-day flags and the like). It
 * belongs to one account, so it is cleared when a different account signs in.
 * Named here rather than imported: the engine imports this module.
 */
const ENGINE_STATE_KEY = 'getvari_notification_engine_state';
/** Cap on replayable background presses, so the queue cannot grow unbounded. */
const PENDING_PROMPT_LIMIT = 10;

/** Key and cap for persisted processed event ids (deduplication registry). */
const PROCESSED_EVENTS_KEY = 'getvari_processed_notification_events';
const PROCESSED_EVENTS_LIMIT = 100;

/**
 * Reminders repeat every 2 hours while the user has nothing logged — N1 in the
 * notification spec ("Regular Hydration Reminder / Every 2 hours").
 *
 * This was 2 *minutes*, a demo setting that shipped: the tray filled with "Log
 * your water" every couple of minutes, which is most of what "the notifications
 * all come at once" looked like on a real phone.
 */
export const REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1000;

/**
 * How far ahead reminders are queued.
 *
 * The cadence is built from one-shot alarms, so the queue is only as long as
 * this window. Rescheduling happens when the app is foregrounded or an entry
 * is logged — neither of which is guaranteed to happen for a while — so the
 * window has to outlast a long absence or reminders simply stop. A full day of
 * 2-hourly slots is 12 alarms, well inside Android's 500-per-app ceiling.
 */
export const REMINDER_COVERAGE_MS = 24 * 60 * 60 * 1000;
const REMINDER_SLOTS = Math.floor(REMINDER_COVERAGE_MS / REMINDER_INTERVAL_MS);

/**
 * How long after wake-up the reminder cadence resumes.
 *
 * A slot pushed out of the quiet window lands exactly on the wake-up time —
 * which is also when N22's "good morning" message goes out, so the day opened
 * with two notifications in the same second. Half an hour lets the greeting
 * lead and the reminders follow.
 */
const REMINDER_RESUME_OFFSET_MS = 30 * 60 * 1000;

/**
 * How far a reminder slot must stay from a fixed-time daily message.
 *
 * `REMINDER_RESUME_OFFSET_MS` was written for this problem but only solves
 * half of it: it applies to slots *shifted out of the sleep window*, so it
 * keeps the cadence clear of the 07:00 greeting only when 07:00 happens to be
 * the wake-up time. A user who wakes at 06:00 has a cadence that lands on the
 * hour naturally, and the 07:00 slot and the 07:00 "Good Morning" were queued
 * for the same second — the reported pair of notifications, and the same
 * clumping the engine's gap prevents for its own alerts.
 *
 * Enforced when the queue is built rather than when a reminder is delivered,
 * because both are one-shot AlarmManager triggers: by the time either arrives
 * the other is already on its way, and withdrawing one at that point costs
 * the user a reminder rather than moving it.
 */
const DAILY_MESSAGE_GUARD_MS = 30 * 60 * 1000;

/**
 * Ceiling on one queue rebuild.
 *
 * Every notifee call here is a native round trip, and a native promise that
 * never settles would otherwise wedge the scheduling chain for the life of the
 * process — no reminder ever rescheduled again, and every caller waiting on it
 * stuck. A rebuild that overruns this is abandoned so the next one can run;
 * the queue it left behind is still valid, just older than intended.
 */
const RESCHEDULE_TIMEOUT_MS = 20 * 1000;

/** Marks a notification as the "you haven't logged water" nudge. */
export const HYDRATION_REMINDER_TYPE = 'hydration_reminder';

/** Marks one of the daily messages (N22 in the spec). */
export const DAILY_MESSAGE_TYPE = 'daily_message';
const DAILY_ID_PREFIX = 'getvari-daily-';

export const SIMULATED_ID_PREFIX = 'getvari-simulated-';

/**
 * Prefix for a scheduled notification the delivery gate moved to a later time
 * (spacing, or the quiet period after opening the app).
 *
 * Deliberately outside every source's own prefix: the per-source rebuilds run
 * on each app open, and a shifted notification sharing its parent's prefix was
 * wiped by the next one, so the user never received it. Shifted entries are
 * cancelled only when the sleep window changes (the schedule they were derived
 * from is gone) or, for hydration reminders, when water is logged.
 */
export const SHIFTED_ID_PREFIX = 'getvari-shifted-';

/**
 * Where a notification came from — stamped on every notification as
 * `data.source` so a delivery in the logs or the tray can be traced back.
 *
 * - `event`: raised live by `NotificationEngine` or a user action (welcome).
 * - `actual`: queued from the user's real data (sleep window, last drink).
 * - `simulation`: the temporary fixed daily timeline.
 */
export type NotificationSource = 'event' | 'actual' | 'simulation';

export interface SimulatedSlot {
  hour: number;
  minute: number;
  trigger: NotificationTrigger;
  type: string;
}

/**
 * The fixed daily schedule, at exact local clock times. These are never moved
 * by the spacing rules; they are only suppressed (sleep window, the quiet
 * period after opening the app, a missed delivery) or, for Risk Improved,
 * Focus and Priority, skipped when their condition does not hold.
 *
 * Not in this table, deliberately:
 * - 07:00 Day Start: a day-start/reset point only; it never sends anything.
 * - Good Morning (08:00), PBWR 50% (15:00) and Good Night (23:30): those
 *   times are only the spec's examples. All three are "at actual" — wake + 1h,
 *   the midpoint of the awake day, sleep − 1h — and are calculated from the
 *   user's real data elsewhere.
 */
export const SIMULATED_SCHEDULE_SLOTS: SimulatedSlot[] = [
  { hour: 9, minute: 0, trigger: 'regular_reminder', type: HYDRATION_REMINDER_TYPE },
  { hour: 10, minute: 30, trigger: 'focus_alert', type: 'simulated_alert' },
  { hour: 11, minute: 0, trigger: 'elevated_risk', type: 'simulated_alert' },
  { hour: 11, minute: 30, trigger: 'risk_improved', type: 'simulated_alert' },
  { hour: 12, minute: 30, trigger: 'focus_alert', type: 'simulated_alert' },
  { hour: 14, minute: 30, trigger: 'priority_alert', type: 'simulated_alert' },
  { hour: 16, minute: 0, trigger: 'focus_alert', type: 'simulated_alert' },
  { hour: 17, minute: 0, trigger: 'regular_reminder', type: HYDRATION_REMINDER_TYPE },
  { hour: 18, minute: 30, trigger: 'priority_alert', type: 'simulated_alert' },
  { hour: 20, minute: 0, trigger: 'elevated_risk', type: 'simulated_alert' },
  { hour: 20, minute: 30, trigger: 'risk_improved', type: 'simulated_alert' },
  { hour: 22, minute: 30, trigger: 'regular_reminder', type: HYDRATION_REMINDER_TYPE },
];

export interface ScheduledSimulatedSlot {
  slotIndex: number;
  trigger: NotificationTrigger;
  type: string;
  timestamp: number;
}

/** Local "YYYYMMDD" for `at` — used to build stable, date-keyed ids. */
const localDateKey = (at: number | Date): string => {
  const d = new Date(at);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * The simulated notifications for the local day containing `date`, at their
 * exact clock times.
 *
 * A slot is dropped, never moved, when it falls inside the silence window
 * (Good Night → next Good Morning, which contains the sleep window).
 * Otherwise it keeps its exact time, whatever Dynamic notification is near it.
 */
export function calculateDailySimulatedSchedule(
  sleepSchedule: SleepSchedule = DEFAULT_SLEEP_SCHEDULE,
  date: Date = new Date()
): ScheduledSimulatedSlot[] {
  const scheduled: ScheduledSimulatedSlot[] = [];

  SIMULATED_SCHEDULE_SLOTS.forEach((slot, idx) => {
    const timestamp = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      slot.hour,
      slot.minute,
      0,
      0
    ).getTime();
    if (isInSilenceWindow(sleepSchedule, timestamp)) return;
    scheduled.push({ slotIndex: idx + 1, trigger: slot.trigger, type: slot.type, timestamp });
  });

  return scheduled;
}

/**
 * How far the daily messages sit from the edges of the user's sleep window.
 *
 * The greeting lands half an hour *after* wake-up, the Daily Water
 * Requirement half an hour after that, and the wind-down an hour *before*
 * bedtime, so none is the first or last thing that happens to the user — a
 * "good morning" at the moment the alarm goes off is noise, and a "keep up
 * your hydration" as someone is falling asleep is worse.
 */
const GOOD_MORNING_OFFSET_MIN = 30;
const DAILY_WATER_REQUIREMENT_OFFSET_MIN = 60;
const GOOD_NIGHT_OFFSET_MIN = 60;

/**
 * The daily messages, and when they sit relative to the sleep window.
 *
 * ## Why these are no longer fixed at 07:00 and 22:00
 *
 * The spec pinned them to wall-clock times, and for a user who sleeps
 * 23:00–07:00 that happens to be right. For a nurse on nights it was absurd:
 * "Good morning! Start your day with a glass of water" arriving at 7 AM as
 * they got into bed, and the wind-down at 10 PM as their day began. The times
 * are now derived from whatever window the user actually chose, so the
 * greeting always follows their wake-up and the wind-down always precedes
 * their bedtime.
 *
 * The scheduled payload itself always comes from `notificationContent.ts`.
 * The legacy `bodies` metadata remains exported only for compatibility with
 * older scheduling tests; it is not a delivery source.
 */
export const DAILY_MESSAGES = [
  {
    key: 'morning',
    trigger: 'morning_msg',
    /** Offset from wake-up, in minutes. Positive is after. */
    anchor: 'wake' as const,
    offsetMin: GOOD_MORNING_OFFSET_MIN,
    title: '🌅 Good Morning',
    bodies: [
      'Good morning! Start your day with a glass of water and stay hydrated throughout the day.',
      'Morning. A glass of water now is the easiest win of your day.',
      'You woke up a little dehydrated — everyone does. First glass sets the tone.',
      'Good morning. Water before coffee, if you can manage it.',
      'New day. Start it with a glass and let the rest follow.',
    ],
  },
  {
    key: 'water',
    trigger: 'daily_water_requirement',
    anchor: 'wake' as const,
    offsetMin: DAILY_WATER_REQUIREMENT_OFFSET_MIN,
    title: '💧 Daily Water Requirement',
    bodies: ['Your daily water requirement for today.', 'Today’s water target is ready.'],
  },
  {
    key: 'night',
    trigger: 'night_msg',
    /** Offset from bedtime, in minutes. Positive is before. */
    anchor: 'sleep' as const,
    offsetMin: GOOD_NIGHT_OFFSET_MIN,
    title: '🌙 Bedtime',
    bodies: [
      'It’s almost bedtime. Keep up your hydration.',
      'Winding down. A small glass now, not a large one — you want to sleep through.',
      'Nearly bedtime. Top up gently if you are short today.',
      'Last call for water before bed. Keep it light.',
      'Almost done for the day. A few sips now is plenty.',
    ],
  },
] as const;

type DailyMessage = (typeof DAILY_MESSAGES)[number];

/**
 * Legacy helper retained for compatibility; scheduling does not call it.
 *
 * Keyed off the local date so it is stable: the queue is rebuilt whenever the
 * app is opened or a drink is logged, and a random pick would rewrite
 * tomorrow's greeting several times a day. The day number is a plain count of
 * local days since the epoch, which steps by exactly one at local midnight.
 */
export const dailyMessageBody = (message: DailyMessage, at: number): string => {
  const d = new Date(at);
  const localDayIndex = Math.floor(
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000
  );
  return message.bodies[
    ((localDayIndex % message.bodies.length) + message.bodies.length) % message.bodies.length
  ];
};

/**
 * The local minute-of-day a daily message should fire, from the sleep window.
 *
 * Wrapped into the day rather than clamped: a bedtime of 00:30 puts the
 * wind-down at 23:30 the evening before, which is the right message at the
 * right moment, where clamping to 00:00 would have queued it after the user
 * was already asleep.
 */
export const dailyMessageMinute = (message: DailyMessage, schedule: SleepSchedule): number => {
  const anchor = parseClock(message.anchor === 'wake' ? schedule.wakeUp : schedule.sleepStart);
  // An unparseable window falls back to the shipped default rather than to
  // midnight, which is the one time of day nothing should ever be sent.
  const base =
    anchor ??
    parseClock(
      message.anchor === 'wake' ? DEFAULT_SLEEP_SCHEDULE.wakeUp : DEFAULT_SLEEP_SCHEDULE.sleepStart
    )!;
  const shifted = message.anchor === 'wake' ? base + message.offsetMin : base - message.offsetMin;
  return ((shifted % 1440) + 1440) % 1440;
};

/** How many days of daily messages are queued ahead. */
export const DAILY_HORIZON_DAYS = 7;

/**
 * `at`, moved clear of any fixed-time daily message it would collide with.
 *
 * Exported for the scheduling tests, which is the only way to observe it —
 * the queue it shapes lives in the OS. See `DAILY_MESSAGE_GUARD_MS`.
 *
 * The loop runs once per message rather than once: pushing clear of the
 * morning greeting can in principle land inside another message's guard, and
 * re-checking costs two comparisons. It cannot spin, because every push moves
 * strictly forward and there are finitely many messages in a day.
 */
export const clearOfDailyMessages = (
  at: number,
  schedule: SleepSchedule = DEFAULT_SLEEP_SCHEDULE
): number => {
  let moved = at;

  for (let pass = 0; pass < DAILY_MESSAGES.length; pass++) {
    let pushed = false;

    for (const message of DAILY_MESSAGES) {
      // The message's time on the same local day as the slot, derived from the
      // user's own sleep window rather than a fixed hour — the guard has to
      // track wherever `dailyMessageMinute` actually puts the message, or it
      // protects a time nothing is scheduled at. Built with the local setters,
      // so it follows the user's clock, and their DST, the way the queued
      // message itself does.
      const minute = dailyMessageMinute(message, schedule);
      const messageAt = new Date(moved);
      messageAt.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
      const messageMs = messageAt.getTime();

      if (Math.abs(moved - messageMs) < DAILY_MESSAGE_GUARD_MS) {
        // Always forward. Pulling the reminder earlier would let the greeting
        // land on a user who has just been reminded, which is the same clump
        // seen from the other side.
        moved = messageMs + DAILY_MESSAGE_GUARD_MS;
        pushed = true;
      }
    }

    if (!pushed) break;
  }

  return moved;
};

/* ------------------------------------------------------------------ *
 * Priority: Sleep > Dynamic > Fixed > 2-hour Hydration
 *
 *  - Dynamic: Good Morning / Good Night and the engine's event alerts
 *    (Welcome, heat, humidity, PBWR 50%, goal, risk). Never moved because of
 *    a fixed or hydration notification.
 *  - Fixed: the simulation timetable. Suppressed (never moved) within 30 min
 *    of a dynamic notification.
 *  - 2-hour Hydration: the cadence and its snooze nudge. Always yields.
 *  - Silence window: from Good Night until the next Good Morning (the sleep
 *    window lies inside it). Only Good Night and Good Morning themselves are
 *    delivered at its edges; nothing else inside it.
 * ------------------------------------------------------------------ */

export type NotificationCategory = 'dynamic' | 'fixed' | 'hydration';

/** A notification's priority class, from its key and source. */
export const categoryOf = (notificationKey: string, source?: unknown): NotificationCategory =>
  source === 'simulation' ? 'fixed' : notificationKey === 'regular_reminder' ? 'hydration' : 'dynamic';

/** Good Morning and Good Night: the silence window's own edges. */
const isDailyMessageKey = (notificationKey: string): boolean =>
  notificationKey === 'morning_msg' || notificationKey === 'night_msg';

const MORNING_MESSAGE = DAILY_MESSAGES.find(message => message.key === 'morning')!;
const NIGHT_MESSAGE = DAILY_MESSAGES.find(message => message.key === 'night')!;

/**
 * Whether `at` is inside the silence window: from Good Night's time until the
 * next Good Morning's time (end exclusive), or inside the sleep window.
 * Derived from the schedule, not from what was delivered, so the answer never
 * depends on the order notifications happen to be processed in.
 */
export const isInSilenceWindow = (schedule: SleepSchedule, at: number): boolean => {
  if (isAsleepAt(schedule, at)) return true;
  const gn = dailyMessageMinute(NIGHT_MESSAGE, schedule);
  const gm = dailyMessageMinute(MORNING_MESSAGE, schedule);
  if (gn === gm) return false;
  const d = new Date(at);
  const minute = d.getHours() * 60 + d.getMinutes();
  return gn < gm ? minute >= gn && minute < gm : minute >= gn || minute < gm;
};

/** `at` itself when outside the silence window, otherwise the next Good Morning. */
export const nextActiveAt = (schedule: SleepSchedule, at: number): number => {
  if (!isInSilenceWindow(schedule, at)) return at;
  const gm = dailyMessageMinute(MORNING_MESSAGE, schedule);
  const next = new Date(at);
  next.setHours(Math.floor(gm / 60), gm % 60, 0, 0);
  if (next.getTime() <= at) next.setDate(next.getDate() + 1);
  // A Good Morning that itself falls in sleep (a degenerate window) cannot
  // anchor anything; fall back to the wake-up time.
  return isAsleepAt(schedule, next.getTime()) ? nextAwakeAt(schedule, next.getTime()) : next.getTime();
};

/**
 * `at`, moved forward until it is clear of every other fixed notification:
 * the daily messages (30 min) and, while simulation is on, the simulated
 * slots — 30 min from any of them, and a full hour from a simulated Hydration
 * Reminder, since the same notification may not repeat within an hour.
 *
 * Done when the cadence is built so the delivery gate does not have to shift
 * reminders at the last moment. Always forward, and bounded: every push moves
 * strictly later and a day holds finitely many slots.
 */
export const clearOfScheduledSlots = (
  at: number,
  schedule: SleepSchedule = DEFAULT_SLEEP_SCHEDULE,
  simulationEnabled: boolean = NOTIFICATION_SIMULATION.ENABLED
): number => {
  let moved = at;

  for (let pass = 0; pass < 32; pass++) {
    const before = moved;
    moved = clearOfDailyMessages(moved, schedule);
    moved = clearOfFixedSlots(moved, schedule, 'regular_reminder', simulationEnabled);
    if (moved === before) break;
  }

  return moved;
};

/**
 * `at`, moved forward until it is clear of every fixed-time slot: 30 min
 * from any of them, and a full hour from a fixed slot of the same kind
 * (`notificationKey`), since the same notification may not repeat within an
 * hour.
 *
 * Used for the 2-hour cadence only: Hydration gives way to the fixed slots.
 * Dynamic notifications (Good Morning, Good Night, live alerts) never step
 * around a fixed slot — the fixed one is suppressed instead.
 */
export const clearOfFixedSlots = (
  at: number,
  schedule: SleepSchedule = DEFAULT_SLEEP_SCHEDULE,
  notificationKey?: string,
  simulationEnabled: boolean = NOTIFICATION_SIMULATION.ENABLED
): number => {
  if (!simulationEnabled) return at;
  let moved = at;

  for (let pass = 0; pass < 32; pass++) {
    const before = moved;
    for (const slot of calculateDailySimulatedSchedule(schedule, new Date(moved))) {
      const guard = slot.trigger === notificationKey ? SAME_TYPE_DELIVERY_GAP_MS : DAILY_MESSAGE_GUARD_MS;
      if (Math.abs(moved - slot.timestamp) < guard) moved = slot.timestamp + guard;
    }
    if (moved === before) break;
  }

  return moved;
};

/**
 * N1's title and message, verbatim from the notification spec.
 *
 * The earlier "Log your water / Still nothing logged / Missed an entry?"
 * variations were a testing nudge rather than a notification the spec asks
 * for, and are gone with the 2-minute cadence they were written for. Tapping
 * this still opens the logging conversation — that is the press action, not a
 * second kind of notification.
 */
/**
 * Recipient cached before one-shot alarms are built. The queued copy is never
 * rewritten at delivery.
 */
let notificationRecipient: string | undefined;

/**
 * The Final Daily Target the Daily Water Requirement message shows, cached
 * for the same reason: scheduling has no profile to hand. `undefined` until
 * storage has been read, `null` when no target is known yet.
 */
let dailyWaterTargetMl: number | null | undefined;

/** Makes each locally displayed notification's event id unique. */
let displayCounter = 0;

/**
 * The same notification (by title) is not shown twice inside this window.
 * A backstop under every path that displays immediately — engine alerts and
 * foreground pushes — so a repeat from any source cannot stack in the tray.
 */
const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;
const RECENT_SHOWN_KEY = 'getvari_recently_shown_notifications';
/** Set at login; the welcome notification is shown when the dashboard opens. */
const PENDING_WELCOME_KEY = 'getvari_pending_welcome';
/** The welcome's notification key: the only one the sleep window does not hold. */
const WELCOME_KEY = 'welcome';

/**
 * When the user last logged a drink, epoch ms.
 *
 * A stamp rather than a read of the hydration log, because the one caller that
 * needs it most is the background delivery handler: no network, no session,
 * and no room to import `HydrationService` — the profile, the log and the
 * telemetry history all import this module already, and reading them from
 * inside it closes the cycle `ReminderFactsService` exists to avoid.
 */
const LAST_INTAKE_KEY = 'getvari_last_intake_at';

/**
 * When the app last put *any* notification on screen, epoch ms.
 *
 * The engine keeps its own `lastDeliveredAt` and spaces its alerts by it, but
 * that clock only ever saw the engine's own deliveries. Scheduled reminders
 * come from AlarmManager on a path the engine never runs, so the two could
 * — and did — land in the same minute: an "Elevated Risk" alert and a
 * "Hydration" reminder, one notification apart in the shade. This is the one
 * stamp both paths write and both read, which is what makes the gap real.
 */
const LAST_NOTIFICATION_KEY = 'getvari_last_notification_at';
/** When the last *dynamic* notification was delivered. See `categoryOf`. */
const LAST_DYNAMIC_KEY = 'getvari_last_dynamic_notification_at';

/**
 * The engine's latest live readings (risk score, FDI, CDI), stamped with when
 * they were taken. Fixed-time conditional notifications read this at delivery,
 * because the delivery handler has no sensor stream of its own.
 */
const CONDITION_SNAPSHOT_KEY = 'getvari_notification_condition_snapshot';

export interface ConditionSnapshot {
  at: number;
  riskScore: number | null;
  fdi: number | null;
  cdi: number | null;
}

/** One notification a rebuild wants in the OS queue. See `replaceInPlace`. */
interface QueuedEntry {
  id: string;
  notification: Notification;
  trigger: TimestampTrigger;
}

/** Id of the welcome when it has to wait for the post-open quiet period. */
const DEFERRED_WELCOME_ID = 'getvari-welcome';

/** Whether a tray id belongs to a hydration reminder of any kind. */
const isReminderTrayId = (id?: string | null): boolean =>
  !!id &&
  (id.startsWith(REMINDER_ID_PREFIX) ||
    id === SNOOZE_ID ||
    id.startsWith(`${SHIFTED_ID_PREFIX}${REMINDER_ID_PREFIX}`) ||
    (id.startsWith(SIMULATED_ID_PREFIX) && id.endsWith('-regular_reminder')));

/** A slot from the fixed daily schedule (never moved by spacing). */
const isFixedSlot = (notification?: Notification | null): boolean =>
  notification?.data?.source === 'simulation';
const RECENT_DELIVERY_KEY = 'getvari_recent_delivery_state';
const GLOBAL_DELIVERY_GAP_MS = 30 * 60 * 1000;
const SAME_TYPE_DELIVERY_GAP_MS = 60 * 60 * 1000;

/** Stable storage key for a notification type, regardless of a title's case. */
const normalizeNotificationKey = (value: unknown): string =>
  String(value ?? 'notification')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'notification';

/** FCM listeners are registered once per app run; see `setupFCM`. */
let fcmListenersRegistered = false;

const isHydrationReminder = (event: Event): boolean =>
  event.detail.notification?.data?.type === HYDRATION_REMINDER_TYPE;

/**
 * Stable identity for a reminder press.
 *
 * The same press can reach the app through the foreground listener, the
 * background handler and `getInitialNotification()`. All three read the id
 * that was baked into the notification when it was scheduled, so downstream
 * dedupe sees one event instead of three. The fallbacks deliberately collapse
 * to a shared bucket rather than inventing a unique value — under-prompting is
 * far better than the duplicate prompts this replaces.
 */
export const readReminderEventId = (notification?: Notification | null): string => {
  const fromData = notification?.data?.eventId;
  if (typeof fromData === 'string' && fromData) return fromData;
  if (notification?.id) return `${REMINDER_ID_PREFIX}${notification.id}`;
  return `${REMINDER_ID_PREFIX}unknown`;
};

/**
 * The moment a scheduled notification was queued for, read from the
 * `<id>@<timestamp>` event id every scheduled notification carries, or null
 * for one displayed immediately.
 */
export const scheduledTimeOf = (notification?: Notification | null): number | null => {
  const eventId = readReminderEventId(notification);
  if (!eventId.includes('@')) return null;
  const at = Number(eventId.split('@').pop());
  return Number.isFinite(at) && at > 0 ? at : null;
};

const notificationKeyOf = (notification?: Notification | null): string =>
  normalizeNotificationKey(
    notification?.data?.notificationKey ??
      notification?.data?.key ??
      notification?.data?.type ??
      notification?.title ??
      'notification'
  );


/**
 * The Android options every notification this app posts shares.
 *
 * The important part is `style`. Without it Android renders the body as a
 * single truncated line and there is nothing behind the expand chevron — so a
 * message like the morning greeting, or an AI-written nudge that runs to a
 * sentence or two, was unreadable past the first line and expanding it showed
 * the same truncated text again. BigText is what gives the notification
 * something to expand *into*.
 *
 * `summary` fills the sub-line in the expanded view, so the shade still says
 * which kind of message this is once it has been opened.
 */
const androidOptions = (
  channelId: string,
  body: string,
  overrides: {
    importance?: AndroidImportance;
    pressAction?: { id: string; launchActivity?: string };
    summary?: string;
  } = {}
) => ({
  channelId,
  // A white-on-transparent silhouette of the logo (icon/final_icon.jpeg).
  // Without one Android falls back to the launcher icon, which is now an
  // adaptive icon — not a valid notification icon — and some phones draw a
  // warning "!" in its place.
  smallIcon: 'ic_stat_final_icon',
  color: '#012060',
  importance: overrides.importance ?? AndroidImportance.DEFAULT,
  pressAction: overrides.pressAction ?? { id: 'default', launchActivity: 'default' },
  // Attached only when there is something to expand into. Notifee's validator
  // rejects a BigText style with an empty `text` by throwing, and a push
  // message can legitimately arrive with a title and no body — which would
  // then take out the whole notification rather than just its expanded view.
  ...(body
    ? {
        style: {
          type: AndroidStyle.BIGTEXT as const,
          text: body,
          ...(overrides.summary ? { summary: overrides.summary } : {}),
        },
      }
    : {}),
});

/**
 * The reminder notification, in the one shape every path that raises it uses.
 *
 * Three things here are what turn the old passive nudge into something the
 * user is actually asked to answer:
 *
 * **`fullScreenAction`** — Android launches the activity over whatever is on
 * screen (and, with `showWhenLocked` on `MainActivity`, over the lock screen)
 * instead of dropping a banner that scrolls away. The app then shows the
 * reminder screen, because `ActiveReminder` is holding an unanswered reminder.
 * Where the OS refuses — the channel demoted, or the Android 14+
 * `USE_FULL_SCREEN_INTENT` grant missing — it silently falls back to a
 * heads-up banner, and the two inline actions below are still there.
 *
 * **`actions`** — "Log <primary amount>" and "Snooze" resolve the reminder
 * from the shade itself, without opening the app. That is what makes the
 * common case one press rather than "tap, wait for the app, choose, confirm".
 *
 * **`autoCancel: false`** — pressing an action must not make the notification
 * vanish before its handler has run; the handlers cancel it themselves once
 * they have done the work.
 */
const reminderNotification = ({
  id,
  eventId,
  body,
  refreshed = false,
  source = 'actual',
  reason = 'no water logged for 2 hours',
}: {
  id: string;
  eventId: string;
  source?: NotificationSource;
  reason?: string;
  /** The delivery-time line, when there is one. See `refreshReminderContent`. */
  body?: string;
  /**
   * Marks a re-post, so the delivery it produces is not refreshed again.
   *
   * Android updates a notification by posting it a second time under the same
   * id, and that post arrives as another DELIVERED event. Without this flag
   * the refresh would trigger its own refresh, forever.
   */
  refreshed?: boolean;
}): Notification => {
  const primary = primaryQuickAmount();
  const content = buildNotificationContent('regular_reminder', notificationRecipient);
  const exactBody = content?.body ?? body ?? buildNotificationContent('regular_reminder')!.body;

  return {
    id,
    title: content?.title ?? '💧 Hydration Reminder',
    body: exactBody,
    data: {
      type: HYDRATION_REMINDER_TYPE,
      notificationKey: 'regular_reminder',
      eventId,
      source,
      reason,
      // Carried on the notification so a background action press knows what
      // "Log" meant without having to read the config it may not have loaded.
      primaryMl: String(primary.ml),
      ...(refreshed ? { refreshed: '1' } : {}),
    },
    android: {
      ...androidOptions(REMINDER_CHANNEL_ID, exactBody, {
        importance: AndroidImportance.HIGH,
        pressAction: { id: REMINDER_PRESS_ACTION, launchActivity: 'default' },
        summary: 'Hydration reminder',
      }),
      // ALARM is what tells the OS this is time-critical: it is the category
      // that survives Do Not Disturb's "alarms only" mode and that ranks the
      // notification above the social chatter it was getting lost in.
      category: AndroidCategory.ALARM,
      visibility: AndroidVisibility.PUBLIC,
      autoCancel: false,
      // A timestamp on the notification answers "how long has this been
      // sitting here?", which matters once a reminder can outlive its moment.
      showTimestamp: true,
      fullScreenAction: {
        id: REMINDER_FULL_SCREEN_ACTION,
        launchActivity: 'default',
      },
      actions: [
        {
          title: `Log ${primary.label}`,
          pressAction: { id: REMINDER_LOG_ACTION, launchActivity: 'default' },
        },
        {
          title: `Snooze ${NOTIFICATION_SNOOZE_MIN}m`,
          // No `launchActivity`: snoozing must not drag the app to the front.
          pressAction: { id: REMINDER_SNOOZE_ACTION },
        },
      ],
    },
  };
};

class NotificationService {
  /** Serialises reminder (re)scheduling so overlapping calls can't interleave. */
  private schedulingQueue: Promise<void> = Promise.resolve();

  /**
   * Serialises the final delivery gate across local and scheduled paths.
   * Check-and-record must be one operation or two concurrent deliveries can
   * both observe an open 30-minute window.
   */
  private deliveryQueue: Promise<unknown> = Promise.resolve();

  /**
   * The reschedule of each kind that is queued but has not started yet.
   *
   * Rebuilding a queue takes seconds of native work, so callers that fire in
   * bursts — a foreground event, a profile load and a hydration write landing
   * together — could pile up more work than the chain could drain, and a
   * caller awaiting its own turn would wait indefinitely. Only one reschedule
   * of a kind is ever worth having in the queue: they all rebuild the same
   * thing from scratch, so a second one waiting behind the first is pure
   * duplicate work. Extra callers join the pending run instead, taking the
   * most recent `fromMs` with them.
   */
  private pending: Record<'reminders' | 'daily' | 'simulated', { run: Promise<void>; fromMs: number } | null> = {
    reminders: null,
    daily: null,
    simulated: null,
  };

  /**
   * Queue `task`, collapsing it into an identical one that is already waiting.
   */
  private enqueue(
    kind: 'reminders' | 'daily' | 'simulated',
    fromMs: number,
    task: (at: number) => Promise<void>
  ): Promise<void> {
    const waiting = this.pending[kind];
    if (waiting) {
      // Run from the latest request; the earlier one has not started yet.
      waiting.fromMs = Math.max(waiting.fromMs, fromMs);
      return waiting.run;
    }

    const entry = { fromMs, run: Promise.resolve() };
    entry.run = this.schedulingQueue.then(() => {
      // Started: from here on a new call needs its own run.
      this.pending[kind] = null;
      return this.withTimeout(kind, task(entry.fromMs));
    });
    this.pending[kind] = entry;
    this.schedulingQueue = entry.run.catch(() => undefined);
    return entry.run;
  }

  /**
   * Last known sleep window, cached so the hot path (deciding whether to show
   * a notification) doesn't have to await storage on every call. `undefined`
   * means "not read yet"; `null` means "read, and the user has none".
   */
  private sleepSchedule: SleepSchedule | null | undefined = undefined;

  /**
   * When the app was last opened (cold start, login, or return to the
   * foreground). In memory on purpose: it only matters while the app is
   * actually open, and a headless delivery with the app closed is not
   * "just after opening".
   */
  private appOpenedAt = 0;

  /** Starts the post-open quiet period. See `LOGIN_QUIET_MS`. */
  markAppOpened(now: number = Date.now()): void {
    this.appOpenedAt = now;
    console.log(
      `[Notifications] App opened; quiet until ${new Date(now + NOTIFICATION_COOLDOWNS.LOGIN_QUIET_MS).toLocaleTimeString()}.`
    );
  }

  /** When the post-open quiet period ends, or 0 if it is not running. */
  appOpenQuietUntil(now: number = Date.now()): number {
    const until = this.appOpenedAt + NOTIFICATION_COOLDOWNS.LOGIN_QUIET_MS;
    return this.appOpenedAt > 0 && now >= this.appOpenedAt && now < until ? until : 0;
  }

  /**
   * Cache the recipient used by the Excel copy before one-shot alarms are
   * built. Alarm payloads are immutable, so this is intentionally done at
   * scheduling time rather than by rewriting a notification after delivery.
   */
  async setNotificationRecipient(fullName?: string | null): Promise<boolean> {
    const next = fullName?.trim() || undefined;
    // Whether the name baked into queued notifications is now wrong.
    const changed = next !== (await this.getNotificationRecipient());
    notificationRecipient = next;
    try {
      if (next) await AsyncStorage.setItem(NOTIFICATION_RECIPIENT_KEY, next);
      else await AsyncStorage.removeItem(NOTIFICATION_RECIPIENT_KEY);
    } catch (error) {
      console.error('[Notifications] Failed to persist notification recipient:', error);
    }
    return changed;
  }

  /**
   * Cache the Final Daily Target shown by the Daily Water Requirement message
   * and, when it differs from the one already queued, re-queue the daily
   * messages so the figure they carry is the current one. Entries are replaced
   * in place under their date-keyed ids, so this never adds a second copy.
   */
  async setDailyWaterTarget(targetMl?: number | null): Promise<boolean> {
    if (!(await this.cacheDailyWaterTarget(targetMl))) return false;
    await this.scheduleDailyNotifications();
    return true;
  }

  /**
   * Cache the target without re-queueing anything, returning whether the
   * cached figure changed. For callers about to rebuild the schedule
   * themselves: the Daily Water Requirement has no text without a target, so
   * one must be in place *before* `rescheduleDaily` runs or the message is
   * left out of the queue.
   *
   * With `onlyIfEmpty` the figure is a fallback — the profile's baseline,
   * which guarantees the message is queued — and never replaces a target
   * that is already cached.
   */
  async cacheDailyWaterTarget(
    targetMl?: number | null,
    options: { onlyIfEmpty?: boolean } = {}
  ): Promise<boolean> {
    const value = Number(targetMl);
    const next = Number.isFinite(value) && value > 0 ? Math.round(value) : null;
    if (next === null) return false;

    const current = await this.getDailyWaterTarget();
    if (next === current) return false;
    if (options.onlyIfEmpty && current !== null) return false;

    dailyWaterTargetMl = next;
    try {
      await AsyncStorage.setItem(DAILY_WATER_TARGET_KEY, String(next));
    } catch (error) {
      console.error('[Notifications] Failed to persist the daily water target:', error);
    }
    return true;
  }

  private async getDailyWaterTarget(): Promise<number | null> {
    if (dailyWaterTargetMl !== undefined) return dailyWaterTargetMl;
    try {
      const stored = Number(await AsyncStorage.getItem(DAILY_WATER_TARGET_KEY));
      dailyWaterTargetMl = Number.isFinite(stored) && stored > 0 ? stored : null;
    } catch (error) {
      console.error('[Notifications] Failed to read the daily water target:', error);
      dailyWaterTargetMl = null;
    }
    return dailyWaterTargetMl;
  }

  private withDeliveryLock<T>(work: () => Promise<T>): Promise<T> {
    const run = this.deliveryQueue.then(work);
    this.deliveryQueue = run.catch(() => undefined);
    return run;
  }

  private async getNotificationRecipient(): Promise<string | undefined> {
    if (notificationRecipient !== undefined) return notificationRecipient;
    try {
      notificationRecipient = (await AsyncStorage.getItem(NOTIFICATION_RECIPIENT_KEY))?.trim() || undefined;
    } catch (error) {
      console.error('[Notifications] Failed to read notification recipient:', error);
    }
    return notificationRecipient;
  }

  /** The latest rebuild of each kind to have started. See `beginRebuild`. */
  private rebuildGeneration = { daily: 0, simulated: 0 };

  /**
   * Marks the start of a rebuild and returns whether it is still the latest
   * of its kind.
   *
   * Rebuilds are serialised, but one that outlives `RESCHEDULE_TIMEOUT_MS` is
   * left running while the next starts. The older one was built from older
   * inputs — before a daily water target was known, say — and finishing last
   * it would overwrite the newer entries and cancel as "stale" the ones only
   * the newer rebuild queued. `replaceInPlace` stops it instead.
   */
  private beginRebuild(kind: 'daily' | 'simulated'): () => boolean {
    const generation = ++this.rebuildGeneration[kind];
    return () => generation === this.rebuildGeneration[kind];
  }

  /** Resolves when `work` finishes, or when it has taken too long. */
  private withTimeout(kind: string, work: Promise<void>): Promise<void> {
    return new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        console.warn(`[Reminders] ${kind} rebuild timed out; moving on.`);
        resolve();
      }, RESCHEDULE_TIMEOUT_MS);

      work
        .catch(error => console.error(`[Reminders] ${kind} rebuild failed:`, error))
        .finally(() => {
          clearTimeout(timer);
          resolve();
        });
    });
  }

  /* ------------------------------------------------------------------ *
   * Sleep window
   *
   * Reminders are the app's most intrusive surface, so the window the user
   * gave during onboarding is treated as a hard mute: nothing is queued
   * inside it and nothing is displayed during it. The queue resumes at the
   * wake-up time rather than being dropped.
   * ------------------------------------------------------------------ */

  /**
   * Store the user's sleep window and re-queue reminders around it. Called
   * when onboarding finishes and whenever the profile is (re)loaded, so a
   * schedule edited on another device reaches this one on the next open.
   *
   * ## Nothing is not an answer
   *
   * A null or unparseable schedule leaves the stored window alone. Every
   * caller here passes `normaliseSleepSchedule(profile)`, which returns null
   * for a profile row that merely does not carry the field — an older row, or
   * one written before the question was asked — and treating that as "the
   * user has no quiet hours" wiped the window they set during onboarding on
   * the very next profile load. Reminders then resumed on the default
   * 23:00-07:00, which is why a user who sleeps at nine was still being
   * nudged at ten. Forgetting the window is what `clearSleepSchedule` is for,
   * and sign-out is the only thing that asks for it.
   */
  async setSleepSchedule(schedule: SleepSchedule | null | undefined): Promise<void> {
    await this.reconcileSchedule(schedule, { fullRebuild: false });
  }

  /**
   * The one place the whole schedule is reconciled with a wake/sleep window.
   *
   * `schedule` is the window to use — the freshly loaded profile's — or null
   * to keep the stored one (the last profile seen), which is the fallback when
   * the profile could not be read. When the window actually differs from the
   * stored one, everything derived from the old window is replaced. With
   * `fullRebuild` the three queues are rebuilt even when it did not, which is
   * what startup does so the 7-day horizon stays topped up; otherwise an
   * unchanged window rebuilds nothing.
   *
   * Every rebuild replaces entries in place under stable ids and removes only
   * its own obsolete ids, so this can run any number of times without
   * duplicating anything or touching another scheduler's notifications.
   * Returns whether the queues were rebuilt.
   */
  async reconcileSchedule(
    schedule: SleepSchedule | null | undefined,
    options: { fullRebuild: boolean }
  ): Promise<boolean> {
    const changed = await this.storeSleepSchedule(schedule);
    if (changed) {
      // Anything the delivery gate shifted was derived from the old window
      // and must not survive it.
      await this.cancelShiftedNotifications();
    } else if (!options.fullRebuild) {
      return false;
    }

    await this.scheduleHydrationReminders();
    await this.scheduleDailyNotifications();
    await this.scheduleSimulatedNotifications();
    this.lastFullReconcileAt = Date.now();
    return true;
  }

  /**
   * Persist `schedule`, returning whether it differs from what was stored.
   *
   * The comparison is with the *persisted* window. The in-memory copy is
   * `undefined` until something has read storage, and comparing with it made
   * an unchanged window look changed on a cold start — cancelling valid
   * shifted notifications and rebuilding every queue for nothing.
   */
  private async storeSleepSchedule(schedule: SleepSchedule | null | undefined): Promise<boolean> {
    const normalised = schedule ? normaliseSleepSchedule(schedule) : null;
    if (!normalised) {
      console.log('[Reminders] No sleep window to apply; keeping the stored one.');
      return false;
    }

    // Loads the stored window into the cache (null when there is none).
    if (this.sleepSchedule === undefined) await this.getSleepSchedule();
    const changed = JSON.stringify(normalised) !== JSON.stringify(this.sleepSchedule ?? null);
    this.sleepSchedule = normalised;

    try {
      await AsyncStorage.setItem(SLEEP_SCHEDULE_KEY, JSON.stringify(normalised));
    } catch (error) {
      console.error('[Reminders] Failed to persist sleep window:', error);
    }

    if (changed) console.log('[Reminders] Sleep window set to', describeSleepWindow(normalised));
    return changed;
  }

  /** When the queues were last fully rebuilt in this process (0 = never). */
  private lastFullReconcileAt = 0;

  /**
   * Whether the 7-day queues are due a top-up: never rebuilt in this process,
   * last rebuilt on an earlier local day, or more than six hours ago. Used on
   * return to the foreground, where an unchanged profile rebuilds nothing
   * unless this says so.
   */
  isScheduleStale(now: number = Date.now()): boolean {
    if (this.lastFullReconcileAt === 0) return true;
    if (new Date(this.lastFullReconcileAt).toDateString() !== new Date(now).toDateString()) return true;
    return now - this.lastFullReconcileAt > 6 * 60 * 60 * 1000;
  }

  /**
   * Called once a sign-in has produced an account id, before anything else
   * of that session. Returns whether a *different* account now owns the
   * schedule.
   *
   * The schedule outlives a logout — the same account signing back in keeps
   * every valid future notification. A different account must not inherit
   * the previous one's: its queued notifications (their name in the text,
   * their wake time), its outstanding reminder, its last-drink time, its
   * once-a-day alert state and its stored window are dropped here (its bell
   * history is kept, per account, and shown only to it), and the new
   * account's schedule is built from its own
   * profile as soon as that loads. Only GetVari's own scheduled ids are
   * cancelled; nothing else on the device is touched.
   */
  async adoptAccount(userId: string): Promise<boolean> {
    let owner: string | null = null;
    try {
      owner = await AsyncStorage.getItem(SCHEDULE_OWNER_KEY);
      await AsyncStorage.setItem(SCHEDULE_OWNER_KEY, userId);
    } catch (error) {
      console.error('[Notifications] Could not read or record the schedule owner:', error);
    }
    // No owner recorded yet (first sign-in, or a build from before owners
    // were tracked): nothing to tell apart, so nothing is dropped.
    if (!owner || owner === userId) return false;

    console.log('[Notifications] A different account signed in; dropping the previous account’s schedule.');
    try {
      const ownPrefixes = [REMINDER_ID_PREFIX, DAILY_ID_PREFIX, SIMULATED_ID_PREFIX, SHIFTED_ID_PREFIX];
      const queued = (await notifee.getTriggerNotificationIds()).filter(
        id => ownPrefixes.some(prefix => id.startsWith(prefix)) || id === SNOOZE_ID || id === DEFERRED_WELCOME_ID
      );
      if (queued.length) await notifee.cancelTriggerNotifications(queued);
    } catch (error) {
      console.error('[Notifications] Could not cancel the previous account’s schedule:', error);
    }
    await this.clearDisplayedReminders();
    await ActiveReminder.resolve();
    try {
      await AsyncStorage.removeItem(LAST_INTAKE_KEY);
      await AsyncStorage.removeItem(ENGINE_STATE_KEY);
      await AsyncStorage.removeItem(SLEEP_SCHEDULE_KEY);
      await AsyncStorage.removeItem(DAILY_WATER_TARGET_KEY);
    } catch (error) {
      console.error('[Notifications] Could not clear the previous account’s state:', error);
    }
    dailyWaterTargetMl = null;
    // Forgotten, so the new account's profile is always a change and its
    // schedule is always built in full.
    this.sleepSchedule = null;
    return true;
  }

  /**
   * Logout ends the session — nothing else. Scheduled notifications, the
   * stored window and the bell history stay: the same account signing back
   * in keeps them, and a different one replaces the schedule
   * (`adoptAccount`) and sees only its own history.
   */
  async onSignedOut(userId?: string | null): Promise<void> {
    if (userId) await NotificationHistory.keepForAccount(userId);
  }

  /**
   * The window to stay quiet in — the user's own, or 23:00–07:00.
   *
   * N14 makes quiet hours a rule of the product rather than a preference, so a
   * device with nothing stored (onboarding not finished, a fresh install, a
   * signed-out session) still gets them. Treating "no answer yet" as "no quiet
   * hours" is what queued reminders for 01:00 and 03:00 on a phone that had
   * simply never been asked.
   */
  async getSleepSchedule(): Promise<SleepSchedule> {
    if (this.sleepSchedule !== undefined) {
      return this.sleepSchedule ?? DEFAULT_SLEEP_SCHEDULE;
    }

    try {
      const raw = await AsyncStorage.getItem(SLEEP_SCHEDULE_KEY);
      this.sleepSchedule = raw ? normaliseSleepSchedule(JSON.parse(raw)) : null;
    } catch (error) {
      console.error('[Reminders] Failed to read sleep window:', error);
      this.sleepSchedule = null;
    }
    return this.sleepSchedule ?? DEFAULT_SLEEP_SCHEDULE;
  }

  /** Whether the app is currently in its quiet, "user is asleep" state. */
  async isSleeping(at: number = Date.now()): Promise<boolean> {
    return isAsleepAt(await this.getSleepSchedule(), at);
  }

  /**
   * Whether a notification with this key may not be delivered at `at`.
   * The welcome is the one exception to the sleep window: it answers a login
   * the user has just made, whatever the time. Good Morning and Good Night are
   * only held by the sleep window — they are the silence window's own edges;
   * everything else is held by the whole silence window (Good Night → next
   * Good Morning).
   */
  async isSilentFor(notificationKey: string, at: number = Date.now()): Promise<boolean> {
    if (notificationKey === WELCOME_KEY) return false;
    const schedule = await this.getSleepSchedule();
    return isDailyMessageKey(notificationKey) ? isAsleepAt(schedule, at) : isInSilenceWindow(schedule, at);
  }

  /** When a dynamic notification was last delivered, or 0. */
  private async lastDynamicAt(): Promise<number> {
    try {
      const at = Number(await AsyncStorage.getItem(LAST_DYNAMIC_KEY));
      return Number.isFinite(at) && at > 0 ? at : 0;
    } catch {
      return 0;
    }
  }

  private async noteDynamicDelivered(at: number = Date.now()): Promise<void> {
    try {
      await AsyncStorage.setItem(LAST_DYNAMIC_KEY, String(at));
    } catch (error) {
      console.error('[Notifications] Could not record the dynamic delivery:', error);
    }
  }

  /**
   * Time since the last *dynamic* notification, or Infinity. The engine spaces
   * its alerts by this: a dynamic alert is not held back by a fixed or
   * hydration notification that went out before it (Dynamic > both).
   */
  async msSinceLastDynamicNotification(): Promise<number> {
    const at = await this.lastDynamicAt();
    if (at <= 0) return Infinity;
    const since = Date.now() - at;
    return since < 0 ? Infinity : since;
  }

  /**
   * The last gate: a notification that arrives inside the quiet window is
   * pulled back off the screen. Returns whether it was.
   *
   * Everything else about the sleep window happens *before* a notification
   * exists — slots are shifted out of the night when they are queued, daily
   * messages inside it are never queued, and `displayNotification` refuses to
   * post one. None of that can help a reminder that was already queued when
   * the window changed: reminders are handed to AlarmManager up to a day
   * ahead, the app is not running to re-queue them, and Android fires exactly
   * what it was given. That is the one path by which a nudge still arrives at
   * 2 AM, and it is the path this closes.
   *
   * The queue is rebuilt on the way out, which moves the rest of the night's
   * slots to the wake-up time — so one stray delivery repairs the whole
   * night rather than being cancelled once per hour until morning.
   */
  async suppressIfAsleep(notification?: Notification | null): Promise<boolean> {
    if (!(await this.isSleeping())) return false;

    const id = notification?.id;
    console.log('[Notifications] Withdrawing a delivery inside the sleep window:', id);

    try {
      if (id) await notifee.cancelDisplayedNotifications([id]);
    } catch (error) {
      console.error('[Notifications] Could not withdraw the delivery:', error);
    }

    try {
      await this.scheduleHydrationReminders();
    } catch (error) {
      console.error('[Notifications] Could not re-queue past the night:', error);
    }

    return true;
  }

  /* ------------------------------------------------------------------ *
   * Cross-path gates: recent intake, and the gap between any two alerts
   * ------------------------------------------------------------------ */

  /**
   * Records that the user just drank. Called from `HydrationService` on every
   * entry, alongside resolving the outstanding reminder and re-queueing.
   */
  async noteIntakeLogged(atMs: number = Date.now()): Promise<void> {
    try {
      await AsyncStorage.setItem(LAST_INTAKE_KEY, String(atMs));
    } catch (error) {
      console.error('[Notifications] Could not record the intake time:', error);
    }
  }

  /** Records the engine's latest live readings. See `CONDITION_SNAPSHOT_KEY`. */
  async noteConditionSnapshot(snapshot: ConditionSnapshot): Promise<void> {
    try {
      await AsyncStorage.setItem(CONDITION_SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.error('[Notifications] Could not record the condition snapshot:', error);
    }
  }

  /** The latest readings, or null when there are none or they are stale. */
  private async readConditionSnapshot(now: number): Promise<ConditionSnapshot | null> {
    try {
      const raw = await AsyncStorage.getItem(CONDITION_SNAPSHOT_KEY);
      if (!raw) return null;
      const snapshot = JSON.parse(raw) as ConditionSnapshot;
      const age = now - snapshot.at;
      if (!(age >= 0 && age <= NOTIFICATION_COOLDOWNS.CONDITION_SNAPSHOT_MAX_AGE_MS)) return null;
      return snapshot;
    } catch {
      return null;
    }
  }

  /**
   * Whether a fixed-time notification's own condition holds right now.
   * Elevated Risk and Hydration Reminder have none: they are sent at their
   * fixed times. A missing or stale reading is a fail ("Missing != Zero").
   */
  private async fixedConditionHolds(notificationKey: string, now: number): Promise<string | null> {
    const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

    if (notificationKey === 'risk_improved') {
      if (!(await this.followsRiskAlert(now))) return 'no risk alert before it';
      const snapshot = await this.readConditionSnapshot(now);
      if (!snapshot || !finite(snapshot.riskScore)) return 'no current risk score';
      if (snapshot.riskScore >= RISK_THRESHOLDS.RECOVERY) {
        return `risk ${snapshot.riskScore} not below ${RISK_THRESHOLDS.RECOVERY}`;
      }
      return null;
    }
    if (notificationKey === 'focus_alert' || notificationKey === 'priority_alert') {
      const index = notificationKey === 'focus_alert' ? 'fdi' : 'cdi';
      const snapshot = await this.readConditionSnapshot(now);
      const value = snapshot?.[index];
      if (!finite(value)) return `no current ${index.toUpperCase()}`;
      if (value < DROP_INDEX_ALERT_THRESHOLD) {
        return `${index.toUpperCase()} ${value} below ${DROP_INDEX_ALERT_THRESHOLD}`;
      }
      return null;
    }
    return null;
  }

  /** When the user last logged a drink, or null if nothing is on record. */
  async lastIntakeAt(): Promise<number | null> {
    try {
      const raw = await AsyncStorage.getItem(LAST_INTAKE_KEY);
      const at = raw ? Number(raw) : NaN;
      return Number.isFinite(at) && at > 0 ? at : null;
    } catch (error) {
      console.error('[Notifications] Could not read the intake time:', error);
      return null;
    }
  }

  /**
   * The second last gate: a reminder that arrives on the heels of a drink is
   * pulled back off the screen. Returns whether it was.
   *
   * The rule this enforces is the one the scheduler already states — "a
   * reminder only ever fires when nothing has been logged for one full
   * interval" — which logging a drink tries to guarantee by re-queueing from
   * that moment. It cannot quite: the re-queue is deliberately not awaited so
   * the user's confirmation never waits on the OS, notifee's scheduling can
   * stall behind other native work, and an alarm already handed to
   * AlarmManager fires exactly when it was told to regardless. So a drink and
   * a reminder land together, and the user is asked for water a moment after
   * providing it — the reported "Just logged a drink · 250 / 4552 ml" nudge.
   *
   * Withdrawing here rather than widening the re-queue is deliberate: this is
   * the only point at which the *delivery* is observable, and the check is a
   * single local read with no network, which is all a background handler can
   * be relied on to complete.
   */
  async suppressIfRecentlyHydrated(notification?: Notification | null): Promise<boolean> {
    if (notification?.data?.type !== HYDRATION_REMINDER_TYPE) return false;
    // The fixed 09:00 / 17:00 / 22:30 reminders carry no condition; only the
    // dynamic 2-hour cadence depends on when water was last logged.
    if (isFixedSlot(notification)) return false;
    const lastAt = await this.lastIntakeAt();
    if (lastAt === null) return false;

    const sinceMs = Date.now() - lastAt;
    // A stamp from the future is a clock change, not a drink; ignore it rather
    // than silencing reminders until the device catches up.
    if (sinceMs < 0 || sinceMs >= REMINDER_INTERVAL_MS) return false;

    const id = notification?.id;
    console.log(
      `[Notifications] Withdrawing a reminder ${Math.round(sinceMs / 60000)} min after a drink:`,
      id
    );

    try {
      if (id) await notifee.cancelDisplayedNotifications([id]);
    } catch (error) {
      console.error('[Notifications] Could not withdraw the delivery:', error);
    }

    return true;
  }

  /**
   * Records that something was just shown, whatever path showed it.
   *
   * Written by `displayNotification` and by every scheduled reminder that
   * survives its gates, so `msSinceLastNotification` sees one timeline.
   */
  async noteNotificationShown(atMs: number = Date.now()): Promise<void> {
    try {
      await AsyncStorage.setItem(LAST_NOTIFICATION_KEY, String(atMs));
      const raw = await AsyncStorage.getItem(RECENT_DELIVERY_KEY);
      let byType: Record<string, number> = {};
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.byType && typeof parsed.byType === 'object') {
            byType = parsed.byType;
          } else if (parsed.key && typeof parsed.at === 'number') {
            byType[parsed.key] = parsed.at;
          }
        } catch {}
      }
      await AsyncStorage.setItem(
        RECENT_DELIVERY_KEY,
        JSON.stringify({ lastGlobalAt: atMs, byType })
      );
    } catch (error) {
      console.error('[Notifications] Could not record the delivery time:', error);
    }
  }

  private processedEventsSet: Set<string> | null = null;

  private async getProcessedEvents(): Promise<Set<string>> {
    if (this.processedEventsSet !== null) {
      return this.processedEventsSet;
    }
    try {
      const raw = await AsyncStorage.getItem(PROCESSED_EVENTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.processedEventsSet = new Set(parsed);
          return this.processedEventsSet;
        }
      }
    } catch (error) {
      console.error('[Notifications] Failed to read processed events:', error);
    }
    this.processedEventsSet = new Set();
    return this.processedEventsSet;
  }

  async isEventAlreadyProcessed(eventId: string): Promise<boolean> {
    if (!eventId || eventId.includes('unknown')) return false;
    // Exact match only. Matching on the id before `@` as well treated every
    // later occurrence of a reused slot id (`hydration-reminder-3` on each
    // day) as "already processed", which let it skip every delivery gate.
    // Shifted copies are tied to their original via `originalEventId`.
    const events = await this.getProcessedEvents();
    return events.has(eventId);
  }

  async markEventProcessed(eventId: string): Promise<void> {
    if (!eventId || eventId.includes('unknown')) return;
    const events = await this.getProcessedEvents();
    events.delete(eventId);
    events.add(eventId);
    const arr = [...events].slice(-PROCESSED_EVENTS_LIMIT);
    this.processedEventsSet = new Set(arr);
    try {
      await AsyncStorage.setItem(PROCESSED_EVENTS_KEY, JSON.stringify(arr));
    } catch (error) {
      console.error('[Notifications] Failed to persist processed event:', error);
    }
  }

  /**
   * How long since anything was last shown, or `Infinity` when nothing has
   * been — which is what lets a caller compare against a gap unconditionally.
   */
  async msSinceLastNotification(): Promise<number> {
    try {
      const rawKey = await AsyncStorage.getItem(LAST_NOTIFICATION_KEY);
      const atKey = rawKey ? Number(rawKey) : NaN;

      const rawDelivery = await AsyncStorage.getItem(RECENT_DELIVERY_KEY);
      let atDelivery = NaN;
      if (rawDelivery) {
        try {
          const parsed = JSON.parse(rawDelivery);
          atDelivery =
            typeof parsed.lastGlobalAt === 'number'
              ? parsed.lastGlobalAt
              : typeof parsed.at === 'number'
              ? parsed.at
              : NaN;
        } catch {}
      }

      const at = Math.max(
        Number.isFinite(atKey) && atKey > 0 ? atKey : 0,
        Number.isFinite(atDelivery) && atDelivery > 0 ? atDelivery : 0
      );

      if (at <= 0) return Infinity;
      const since = Date.now() - at;
      // A backwards clock must open the gate, never wedge it shut.
      return since < 0 ? Infinity : since;
    } catch (error) {
      console.error('[Notifications] Could not read the delivery time:', error);
      return Infinity;
    }
  }

  /** Forgets the window — used on sign-out, alongside the rest of the state. */
  async clearSleepSchedule(): Promise<void> {
    this.sleepSchedule = null;
    try {
      await AsyncStorage.removeItem(SLEEP_SCHEDULE_KEY);
    } catch (error) {
      console.error('[Reminders] Failed to clear sleep window:', error);
    }
  }

  /**
   * Whether the app may post notifications. A plain read of Android's current
   * setting — it never shows a dialog.
   *
   * It is called from background paths (the engine's tick, the schedule
   * rebuilds, `displayNotification`), and asking from there put the system
   * dialog up on its own at every launch while notifications were off, on top
   * of the permission screen that exists to ask. The only places that ask are
   * the ones a user tapped: the permission screen and the dashboard's
   * "Enable" banner, through `promptForNotificationPermission`.
   */
  async requestPermission(): Promise<boolean> {
    return this.hasNotificationPermission();
  }

  /**
   * Whether notifications are allowed, without ever showing the dialog.
   *
   * Android's current setting is the only source of truth — nothing is
   * remembered — so this answers correctly after a relaunch, an update, or a
   * change the user made in App info while the app was closed.
   */
  async hasNotificationPermission(): Promise<boolean> {
    try {
      const current = await notifee.getNotificationSettings();
      return current.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
    } catch (error) {
      console.warn('[Notifications] Could not read permission state:', error);
      return false;
    }
  }

  /**
   * Asks for notification permission — for a user who tapped "Allow".
   *
   * Already granted: resolves true without any dialog. Otherwise the system
   * dialog, then Android's setting is read again, so the answer is the real
   * state rather than whatever the dialog reported. Android stops showing the
   * dialog after two refusals and returns at once, which is why the callers
   * fall back to the settings page when this resolves false.
   */
  async promptForNotificationPermission(): Promise<boolean> {
    if (await this.hasNotificationPermission()) return true;
    try {
      await notifee.requestPermission();
    } catch (error) {
      console.error('[Notifications] Permission request failed:', error);
    }
    return this.hasNotificationPermission();
  }

  /** Opens this app's notification settings, for a user Android will not re-prompt. */
  async openNotificationSettings(): Promise<void> {
    try {
      await notifee.openNotificationSettings();
    } catch (error) {
      console.error('[Notifications] Could not open notification settings:', error);
    }
  }

  /**
   * Get the FCM token for this device.
   */
  async getFCMToken(): Promise<string | null> {
    try {
      const messaging = getMessaging();
      const authStatus = await requestMessagingPermission(messaging);
      const enabled =
        authStatus === MessagingAuthorizationStatus.AUTHORIZED ||
        authStatus === MessagingAuthorizationStatus.PROVISIONAL;

      if (enabled) {
        const token = await getToken(messaging);
        console.log('[FCM Token]:', token);
        return token;
      }
      return null;
    } catch (error) {
      console.error('FCM Token Error:', error);
      return null;
    }
  }

  /**
   * Setup FCM listeners.
   */
  async setupFCM() {
    // Once per app run. This is called every time the dashboard sets up
    // notifications, and each call used to add another `onMessage` listener
    // that was never removed — so after a few logins or remounts a single
    // push was displayed once per listener.
    if (fcmListenersRegistered) return;
    fcmListenersRegistered = true;

    const messaging = getMessaging();

    // 1. Handle background messages
    setBackgroundMessageHandler(messaging, async remoteMessage => {
      console.log('Message handled in the background!', remoteMessage);
    });

    // 2. Handle foreground messages
    onMessage(messaging, async remoteMessage => {
      console.log('A new FCM message arrived!', JSON.stringify(remoteMessage));

      // Push payload copy is not an approved notification source. The Excel
      // table is authoritative, and its triggers are evaluated/scheduled by
      // this service and NotificationEngine instead of mirroring arbitrary
      // server text into the notification shade.
    });
  }

  /**
   * Create the default notification channel for hydration reminders.
   */
  async createNotificationChannel() {
    // Drop the superseded channel so the user isn't left with a dead, silent
    // "Hydration Reminders" entry sitting in system settings.
    for (const legacyId of LEGACY_CHANNEL_IDS) {
      try {
        await notifee.deleteChannel(legacyId);
      } catch {
        // Never created on this device — nothing to retire.
      }
    }

    return await notifee.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: 'Hydration Reminders',
      // HIGH is the floor for a heads-up banner, and it is also the floor for
      // a full-screen intent: Android drops the full-screen behaviour of a
      // notification on a channel the user has demoted, and shows the banner
      // instead. That degradation is intentional and is left alone.
      importance: AndroidImportance.HIGH,
      // A reminder the user cannot hear is not a reminder. Without these the
      // channel is created silent, which is how every nudge so far arrived.
      sound: REMINDER_SOUND,
      vibration: true,
      // Two pulses with a gap, rather than one long buzz, so the reminder is
      // recognisable through a pocket without looking at the screen.
      vibrationPattern: [200, 400, 200, 600],
      // The reminder is an alarm-shaped thing; showing it in full on the lock
      // screen is what lets the user act on it without unlocking first.
      visibility: AndroidVisibility.PUBLIC,
      bypassDnd: false,
    });
  }

  /**
   * Display a generic notification.
   *
   * An `eventId` is stamped on every notification the app shows, not just on
   * reminders: it is what the delivery log uses to tie a later press back to
   * the row for this exact notification.
   */
  async displayNotification(
    title: string,
    body: string,
    channelId: string = REMINDER_CHANNEL_ID,
    kind: NotificationKind = 'local',
    options: {
      allowRepeat?: boolean;
      /**
       * Only the welcome: sent "immediately after successful login", so it is
       * not held by the quiet period after opening or the 30-minute gap. It
       * is not held by the sleep window either (see `isSilentFor`).
       */
      immediate?: boolean;
      /**
       * Only a message an admin sent by hand: it is shown without being
       * counted as a delivery, so it never moves or holds back an automatic
       * notification.
       */
      untracked?: boolean;
      notificationKey?: string;
      source?: NotificationSource;
      reason?: string;
    } = {}
  ): Promise<boolean> {
    return this.withDeliveryLock(async () => {
      const notificationKey = normalizeNotificationKey(options.notificationKey ?? title);
      const source = options.source ?? 'event';
      const reason = options.reason ?? notificationKey;

      const category = categoryOf(notificationKey, source);

      // The whole app goes quiet from Good Night until the next Good Morning
      // (the sleep window inside it), push messages and risk alerts
      // included. The welcome after a login is the only exception.
      if (await this.isSilentFor(notificationKey)) {
        console.log(`[Notifications] Suppressed ${notificationKey} (${source}: ${reason}) - silence window`);
        return false;
      }

      // The quiet period after opening holds everything back except the
      // welcome, which is the login event itself (`immediate`).
      if (!options.immediate && this.appOpenQuietUntil() > 0) {
        console.log(`[Notifications] Suppressed ${notificationKey} (${source}: ${reason}) - app just opened`);
        return false;
      }

      const hasPermission = await this.requestPermission();
      if (!hasPermission) return false;

      // `allowRepeat` skips only the same-type hour gate; the 30-minute gap
      // still applies to everything except an `immediate` welcome. A dynamic
      // notification is spaced only from other dynamic ones — a fixed or
      // hydration notification never holds it back.
      if (
        !options.immediate &&
        !(await this.canDeliverNow(notificationKey, options.allowRepeat === true, category))
      ) {
        console.log('[Notifications] Suppressed by delivery spacing:', title);
        return false;
      }

      await this.createNotificationChannel();
      const eventId = `${kind}:${Date.now()}:${(displayCounter++).toString(36)}`;
      await notifee.displayNotification({
        id: `shown:${notificationKey}:${eventId}`,
        title,
        body,
        data: { type: kind, notificationKey, deliveryAccepted: '1', eventId, source, reason },
        android: androidOptions(channelId, body),
      });
      console.log(`[Notifications] Delivered ${notificationKey} (${source}: ${reason})`);

      // Recorded only after the native post succeeds, while the lock is held.
      await this.markEventProcessed(eventId);
      if (options.untracked) return true;
      await this.noteNotificationShown();
      await this.noteDeliveredType(notificationKey);
      if (category === 'dynamic') await this.noteDynamicDelivered();
      return true;
    });
  }

  /**
   * Called at login: a welcome is owed, to be shown when the user reaches the
   * dashboard (see `showPendingWelcome`) — after onboarding and the device
   * step, not the moment the OTP is accepted.
   */
  async queueWelcomeNotification(): Promise<void> {
    try {
      await AsyncStorage.setItem(PENDING_WELCOME_KEY, '1');
    } catch (error) {
      console.error('[Notifications] Could not queue welcome:', error);
    }
  }

  /**
   * Shows the welcome if one is owed, once. Called when the dashboard opens,
   * so a cold start without a fresh login shows nothing.
   */
  async showPendingWelcome(): Promise<void> {
    try {
      if ((await AsyncStorage.getItem(PENDING_WELCOME_KEY)) !== '1') return;
      // Shown whatever the time: the welcome is the one notification the
      // sleep window does not hold (see `isSilentFor`).

      const delivered = await this.showWelcomeNotification();
      if (delivered) {
        await AsyncStorage.removeItem(PENDING_WELCOME_KEY);
        return;
      }

      // Not displayed — a failed native post, say. Retried
      // later through the same delivery gate every scheduled notification
      // passes, rather than dropped.
      if (await this.scheduleDeferredWelcome()) {
        await AsyncStorage.removeItem(PENDING_WELCOME_KEY);
      }
    } catch (error) {
      console.error('[Notifications] Pending welcome failed:', error);
    }
  }

  /** Queues the welcome for the end of the quiet period (or a minute from now). */
  private async scheduleDeferredWelcome(): Promise<boolean> {
    try {
      if (!(await this.requestPermission())) return false;
      const content = buildNotificationContent('welcome');
      if (!content) return false;
      await this.createNotificationChannel();

      const timestamp = Math.max(this.appOpenQuietUntil(), Date.now() + 60 * 1000);
      // One stable id: a second login before it fires replaces it.
      await notifee.createTriggerNotification(
        {
          id: DEFERRED_WELCOME_ID,
          title: content.title,
          body: content.body,
          data: {
            type: 'local',
            notificationKey: 'welcome',
            eventId: `${DEFERRED_WELCOME_ID}@${timestamp}`,
            source: 'event',
            reason: 'login (after the post-open quiet period)',
          },
          android: androidOptions(REMINDER_CHANNEL_ID, content.body),
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp,
          alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
        } satisfies TimestampTrigger
      );
      console.log(`[Notifications] Welcome deferred to ${new Date(timestamp).toLocaleTimeString()}`);
      return true;
    } catch (error) {
      console.error('[Notifications] Could not defer the welcome:', error);
      return false;
    }
  }

  /**
   * The welcome greeting itself. Goes through `displayNotification`, so it
   * respects the notification permission (asking for it if needed). It is the
   * one notification the sleep window does not hold.
   */
  async showWelcomeNotification(): Promise<boolean> {
    try {
      const content = buildNotificationContent('welcome');
      if (!content) return false;
      return await this.displayNotification(
        content.title,
        content.body,
        REMINDER_CHANNEL_ID,
        'local',
        // Already once per login (see `showPendingWelcome`). Without this, a
        // quick log out and back in was swallowed as a "duplicate". Sent
        // immediately after login: not held by the quiet period after opening,
        // the 30-minute gap or the sleep window.
        {
          allowRepeat: true,
          immediate: true,
          notificationKey: 'welcome',
          source: 'event',
          reason: 'login',
        }
      );
    } catch (error) {
      console.error('[Notifications] Welcome notification failed:', error);
      return false;
    }
  }

  /**
   * The 30-minute gap and the one-hour same-type rule. The 30-minute gap is
   * not global: it only holds back a 2-hour Hydration reminder (the one that
   * yields). A dynamic notification is delivered at its own time whatever went
   * out before it; only the same-type hour applies to it.
   */
  private async canDeliverNow(
    rawKey: string,
    allowSameTypeRepeat = false,
    category: NotificationCategory = 'hydration'
  ): Promise<boolean> {
    const notificationKey = normalizeNotificationKey(rawKey);
    try {
      const raw = await AsyncStorage.getItem(RECENT_DELIVERY_KEY);
      if (!raw) return true;
      const parsed = JSON.parse(raw);
      let lastGlobalAt = 0;
      let byType: Record<string, number> = {};

      if (typeof parsed.lastGlobalAt === 'number') {
        lastGlobalAt = parsed.lastGlobalAt;
        byType = parsed.byType ?? {};
      } else if (typeof parsed.at === 'number') {
        lastGlobalAt = parsed.at;
        if (parsed.key) byType[parsed.key] = parsed.at;
      }
      const now = Date.now();
      if (category !== 'dynamic' && lastGlobalAt > 0 && now - lastGlobalAt < GLOBAL_DELIVERY_GAP_MS) {
        return false;
      }

      const typeLastAt = byType[notificationKey] ?? 0;
      if (!allowSameTypeRepeat && typeLastAt > 0 && now - typeLastAt < SAME_TYPE_DELIVERY_GAP_MS) {
        return false;
      }

      return true;
    } catch {
      return true;
    }
  }

  private async noteDeliveredType(rawKey: string, atMs: number = Date.now()): Promise<void> {
    const notificationKey = normalizeNotificationKey(rawKey);
    try {
      const raw = await AsyncStorage.getItem(RECENT_DELIVERY_KEY);
      let byType: Record<string, number> = {};
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.byType && typeof parsed.byType === 'object') {
            byType = parsed.byType;
          } else if (parsed.key && typeof parsed.at === 'number') {
            byType[parsed.key] = parsed.at;
          }
        } catch {}
      }
      byType[notificationKey] = atMs;
      await AsyncStorage.setItem(
        RECENT_DELIVERY_KEY,
        JSON.stringify({ lastGlobalAt: atMs, byType })
      );
    } catch (error) {
      console.error('[Notifications] Could not persist delivery spacing:', error);
    }
  }

  /**
   * The gate every OS-scheduled notification passes when it is delivered.
   * In order, and the first that applies decides:
   *
   * Sleep/silence beats everything. Dynamic and Fixed are each delivered at
   * their own time and never hold each other back; a 2-hour Hydration reminder
   * yields to both. There is no global 30-minute gap: it applies only to the
   * 2-hour reminder. Nothing already delivered is ever withdrawn.
   *
   * 1. already processed: accept (a repeat of a delivery already let through);
   * 2. silence window (Good Night → next Good Morning, sleep inside it): drop.
   *    Good Morning and Good Night are only held by sleep itself. A 2-hour
   *    reminder is moved to after the next Good Morning instead;
   * 3. missed (delivered long after its own time): drop, never sent late;
   *
   * **Dynamic** (Good Morning / Good Night, and every notification that is
   * neither a fixed slot nor a 2-hour reminder): delivered at its own time,
   * whatever went out before it. Only the quiet period after opening, or the
   * same type within the hour, moves it.
   *
   * **Fixed** (`source: 'simulation'`): never moved.
   * 4. only while CHECK_FIXED_SLOT_CONDITIONS is on (off for now): its
   *    condition fails: drop;
   * 5. quiet period after opening the app: drop;
   * 6. otherwise delivered at its exact time — a Dynamic notification before
   *    or after it does not suppress, move or delay it.
   *
   * **2-hour Hydration**: quiet period, the 30-min / same-type spacing, or
   * within 30 min of Good Morning / Good Night or of a fixed slot (an hour of
   * a fixed Hydration Reminder): moved to the next allowed time.
   */
  async acceptScheduledDelivery(notification: Notification): Promise<boolean> {
    return this.withDeliveryLock(async () => {
      const notificationKey = notificationKeyOf(notification);
      const eventId = readReminderEventId(notification);
      const source = String(notification.data?.source ?? 'actual');
      const label = `${notificationKey} (${source}, ${eventId})`;
      const now = Date.now();

      if (await this.isEventAlreadyProcessed(eventId)) return true;

      const category = categoryOf(notificationKey, notification.data?.source);
      const schedule = await this.getSleepSchedule();

      if (await this.isSilentFor(notificationKey, now)) {
        if (category === 'hydration' && !isAsleepAt(schedule, now)) {
          // Awake but after Good Night / before Good Morning: comes back after
          // the next Good Morning rather than being lost.
          console.log(`[Notifications] Moved ${label} - silence window`);
          await this.rescheduleBlockedNotification(notification, nextActiveAt(schedule, now));
        } else {
          console.log(`[Notifications] Dropped ${label} - silence window`);
          if (category !== 'hydration') await this.markEventProcessed(eventId);
        }
        return false;
      }

      const scheduledAt = scheduledTimeOf(notification);
      if (scheduledAt !== null && now - scheduledAt > NOTIFICATION_COOLDOWNS.MISSED_DELIVERY_TOLERANCE_MS) {
        console.log(
          `[Notifications] Dropped ${label} - missed by ${Math.round((now - scheduledAt) / 60000)} min`
        );
        await this.markEventProcessed(eventId);
        return false;
      }

      const quietUntil = this.appOpenQuietUntil(now);

      if (category === 'fixed') {
        // Off for now: see NOTIFICATION_SIMULATION.CHECK_FIXED_SLOT_CONDITIONS.
        const failed = NOTIFICATION_SIMULATION.CHECK_FIXED_SLOT_CONDITIONS
          ? await this.fixedConditionHolds(notificationKey, now)
          : null;
        if (failed) {
          console.log(`[Notifications] Dropped ${label} - condition not met: ${failed}`);
          await this.markEventProcessed(eventId);
          return false;
        }
        if (quietUntil > 0) {
          console.log(`[Notifications] Dropped ${label} - app just opened; fixed time is not moved`);
          await this.markEventProcessed(eventId);
          return false;
        }
      } else if (category === 'dynamic') {
        if (notificationKey === 'risk_improved' && !(await this.followsRiskAlert(now))) {
          console.log(`[Notifications] Dropped ${label} - no risk alert before it`);
          await this.markEventProcessed(eventId);
          return false;
        }
        if (quietUntil > 0 || !(await this.canDeliverNow(notificationKey, false, 'dynamic'))) {
          await this.rescheduleBlockedNotification(notification, quietUntil);
          return false;
        }
      } else {
        // 2-hour Hydration gives way to everything: Good Morning / Good Night
        // and fixed slots (from the schedule, whichever arrives first), and
        // anything already delivered within the gap.
        const clear = clearOfScheduledSlots(now, schedule);
        // A queued dynamic notification (a shifted one) within the gap wins
        // too, whichever of the two alarms happens to fire first.
        const dynamicDue = await this.pendingDynamicNear(now);
        if (
          quietUntil > 0 ||
          clear > now ||
          dynamicDue !== null ||
          !(await this.canDeliverNow(notificationKey))
        ) {
          // Not dropped: moved to the next time the rules allow.
          await this.rescheduleBlockedNotification(
            notification,
            Math.max(quietUntil, clear, dynamicDue !== null ? dynamicDue + GLOBAL_DELIVERY_GAP_MS : 0)
          );
          return false;
        }
      }

      await this.markEventProcessed(eventId);
      // A shifted copy answers for its original too, so a late duplicate of
      // the original can never be delivered as well.
      const originalEventId = notification.data?.originalEventId;
      if (typeof originalEventId === 'string' && originalEventId !== eventId) {
        await this.markEventProcessed(originalEventId);
      }
      await this.noteNotificationShown();
      await this.noteDeliveredType(notificationKey);
      if (category === 'dynamic') await this.noteDynamicDelivered(now);
      console.log(`[Notifications] Delivered ${label}`);
      return true;
    });
  }

  /**
   * The time of a dynamic notification queued with the OS within the 30-min
   * gap of `now` (either side), or null. The latest such time, so a reminder
   * moved past it is clear of all of them.
   */
  private async pendingDynamicNear(now: number): Promise<number | null> {
    try {
      let latest: number | null = null;
      for (const { notification, trigger } of await notifee.getTriggerNotifications()) {
        const at = (trigger as TimestampTrigger)?.timestamp;
        if (typeof at !== 'number' || Math.abs(at - now) >= GLOBAL_DELIVERY_GAP_MS) continue;
        const key = notificationKeyOf(notification);
        if (categoryOf(key, notification.data?.source) !== 'dynamic') continue;
        if (latest === null || at > latest) latest = at;
      }
      return latest;
    } catch {
      return null;
    }
  }

  /**
   * Whether a risk alert (Elevated or High) was delivered recently and has
   * not already been followed by a Risk Improved.
   */
  private async followsRiskAlert(now: number): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(RECENT_DELIVERY_KEY);
      const byType: Record<string, number> = raw ? JSON.parse(raw).byType ?? {} : {};
      const lastRiskAlert = Math.max(byType.elevated_risk ?? 0, byType.high_risk ?? 0);
      const lastImproved = byType.risk_improved ?? 0;
      return (
        lastRiskAlert > 0 &&
        lastRiskAlert > lastImproved &&
        now - lastRiskAlert <= NOTIFICATION_COOLDOWNS.RISK_IMPROVED_FOLLOW_UP_MS
      );
    } catch {
      return false;
    }
  }

  private async rescheduleBlockedNotification(
    notification: Notification,
    notBefore: number = 0
  ): Promise<boolean> {
    try {
      const notificationKey = notificationKeyOf(notification);
      const now = Date.now();

      const raw = await AsyncStorage.getItem(RECENT_DELIVERY_KEY);
      let lastGlobalAt = 0;
      let byType: Record<string, number> = {};
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed.lastGlobalAt === 'number') {
            lastGlobalAt = parsed.lastGlobalAt;
            byType = parsed.byType ?? {};
          }
        } catch {}
      }

      const typeLastAt = byType[notificationKey] ?? 0;
      const schedule = await this.getSleepSchedule();
      const category = categoryOf(notificationKey, notification.data?.source);
      // The 30-minute gap holds back only a 2-hour reminder; a dynamic one
      // waits for nothing but the quiet period and its own type's hour.
      const lastRelevantAt = category === 'dynamic' ? 0 : lastGlobalAt;
      let nextAvailableMs = Math.max(
        now + 60 * 1000,
        notBefore,
        lastRelevantAt > 0 ? lastRelevantAt + GLOBAL_DELIVERY_GAP_MS : 0,
        typeLastAt > 0 ? typeLastAt + SAME_TYPE_DELIVERY_GAP_MS : 0
      );
      if (category === 'hydration') {
        // A 2-hour reminder gives way to everything: out of the silence window
        // (to after the next Good Morning) and clear of Good Morning / Good
        // Night and of the fixed slots. Dynamic notifications never step
        // around fixed ones.
        for (let pass = 0; pass < 4; pass++) {
          const active = nextActiveAt(schedule, nextAvailableMs);
          const cleared = clearOfScheduledSlots(active, schedule);
          if (cleared === nextAvailableMs) break;
          nextAvailableMs = cleared;
        }
      }

      const rawEventId = readReminderEventId(notification);
      // The first scheduled occurrence, kept across repeated shifts, so the
      // shifted copy and its original are recognised as one notification.
      const originalEventId = String(notification.data?.originalEventId ?? rawEventId);

      // Silence wins: a shift that would land in it is dropped, not carried
      // over (a 2-hour reminder has already been moved past it above). The
      // welcome is exempt, as everywhere (see `isSilentFor`).
      const silent =
        notificationKey !== WELCOME_KEY &&
        (isDailyMessageKey(notificationKey)
          ? isAsleepAt(schedule, nextAvailableMs)
          : isInSilenceWindow(schedule, nextAvailableMs));
      if (silent) {
        console.warn(
          `[Notifications] Dropped blocked ${notificationKey} (${originalEventId}): next allowed time is inside the silence window.`
        );
        await this.markEventProcessed(rawEventId);
        return false;
      }

      // Stable per original notification, so shifting it again replaces the
      // pending copy instead of stacking a second one.
      const nextId = `${SHIFTED_ID_PREFIX}${originalEventId.replace(/@/g, '-')}`;
      await notifee.createTriggerNotification(
        {
          id: nextId,
          title: notification.title,
          body: notification.body,
          data: {
            ...(notification.data ?? {}),
            notificationKey,
            originalEventId,
            eventId: `${originalEventId}@${nextAvailableMs}`,
            reason: `${String(notification.data?.reason ?? notificationKey)} (shifted)`,
          },
          android: notification.android,
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: nextAvailableMs,
          alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
        } satisfies TimestampTrigger
      );

      console.log(
        `[Notifications] Shifted blocked ${notificationKey} (${originalEventId}) to ${new Date(nextAvailableMs).toLocaleTimeString()}`
      );
      return true;
    } catch (error) {
      console.error('[Notifications] Failed to reschedule blocked notification:', error);
      return false;
    }
  }

  /**
   * True if a notification with this title was shown in the last
   * DUPLICATE_WINDOW_MS; otherwise records it as shown now and returns false.
   */
  private async shownRecently(title: string): Promise<boolean> {
    const now = Date.now();
    try {
      const raw = await AsyncStorage.getItem(RECENT_SHOWN_KEY);
      const recent: Record<string, number> = raw ? JSON.parse(raw) : {};
      if (now - (recent[title] ?? 0) < DUPLICATE_WINDOW_MS) return true;

      const next: Record<string, number> = { [title]: now };
      for (const [key, at] of Object.entries(recent)) {
        if (now - at < DUPLICATE_WINDOW_MS) next[key] = at;
      }
      await AsyncStorage.setItem(RECENT_SHOWN_KEY, JSON.stringify(next));
    } catch (error) {
      // An unreadable record must not silence the app.
      console.error('[Notifications] Could not read recent notifications:', error);
    }
    return false;
  }

  /* ------------------------------------------------------------------ *
   * N1 — the recurring 2-hourly hydration reminder
   * ------------------------------------------------------------------ */

  /**
   * Queue reminders at `REMINDER_INTERVAL_MS` for the next
   * `REMINDER_COVERAGE_MS`, starting one interval after `fromMs`.
   *
   * Notifee's `IntervalTrigger` has a 15-minute floor, so a rolling batch of
   * one-shot timestamp triggers is used instead. Any previously queued
   * reminders are dropped first, which means calling this after a hydration
   * entry (or when the app comes back to the foreground) effectively resets
   * the countdown — a reminder only ever fires when nothing has been logged
   * for one full interval.
   *
   * Slots that would land inside the user's sleep window are pushed to their
   * wake-up time, so a night produces no reminders and the cadence picks up
   * again in the morning.
   */
  async scheduleHydrationReminders(fromMs?: number): Promise<void> {
    // 0 means "anchor on the last drink"; see `reminderAnchor`. An explicit
    // time from another caller in the same burst wins over it.
    return this.enqueue('reminders', fromMs ?? 0, at => this.rescheduleReminders(at));
  }

  /**
   * Where the 2-hour countdown starts when no explicit time is given: the
   * last logged drink, when there is a recent one. Opening the app is not a
   * drink, so it no longer restarts the countdown — only logging water does.
   * With nothing on record (a fresh install) the countdown starts now.
   */
  private async reminderAnchor(requested: number): Promise<number> {
    if (requested > 0) return requested;
    const now = Date.now();
    const lastIntake = await this.lastIntakeAt();
    if (lastIntake !== null && lastIntake <= now && now - lastIntake < REMINDER_COVERAGE_MS) {
      return lastIntake;
    }
    return now;
  }

  private async rescheduleReminders(requestedFromMs: number): Promise<void> {
    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        console.warn('[Reminders] Notification permission denied; skipping schedule.');
        return;
      }

      await this.createNotificationChannel();
      await this.getNotificationRecipient();
      // Record whatever is in the tray. Reminders delivered while the app was
      // killed may never have reached JS as an event. The rebuild below no
      // longer clears the tray: a reminder on screen stays there until it is
      // answered (see `resolveActiveReminder`) or superseded by a newer one.
      await this.syncDeliveredFromTray();

      const schedule = await this.getSleepSchedule();
      // Built first and applied in place (see `replaceInPlace`) — never
      // cancel-then-recreate.
      const entries: QueuedEntry[] = [];

      // Slots are walked with a cursor rather than computed from `fromMs`,
      // because a slot landing inside the sleep window is *moved to the
      // wake-up time*, not dropped. That matters more than it sounds: the
      // queue only covers a couple of hours, so simply skipping the night
      // would leave nothing queued at all by the time the user woke up, and
      // reminders would stay dead until they next opened the app.
      const fromMs = await this.reminderAnchor(requestedFromMs);
      let cursor = fromMs;
      let sleepShifted = false;
      let slot = 0;

      // Walked from the anchor, which can be in the past (the last drink), so
      // slots already gone by are skipped — never sent late — and the walk
      // continues until a full window of future slots is queued.
      for (let step = 0; slot < REMINDER_SLOTS && step < REMINDER_SLOTS * 4; step++) {
        cursor += REMINDER_INTERVAL_MS;
        // Out of the silence window (Good Night → next Good Morning): resumes
        // after Good Morning, which is always the first notification of the day.
        const awakeAt = nextActiveAt(schedule, cursor);
        if (awakeAt !== cursor) {
          sleepShifted = true;
          cursor = awakeAt + REMINDER_RESUME_OFFSET_MS;
        } else {
          cursor = awakeAt;
        }

        /**
         * Keep the cadence off the other fixed notifications — the daily
         * messages and the simulated slots. See `clearOfScheduledSlots`.
         *
         * Applied after the sleep shift and re-checked against the window
         * afterwards, because the push is forward in time and could walk a
         * slot into the evening quiet hours, at which point it moves to the
         * morning and is cleared once more.
         */
        for (let pass = 0; pass < 3; pass++) {
          const cleared = clearOfScheduledSlots(cursor, schedule);
          if (cleared === cursor) break;
          cursor = cleared;
          const reAwakeAt = nextActiveAt(schedule, cursor);
          if (reAwakeAt !== cursor) {
            sleepShifted = true;
            cursor = reAwakeAt + REMINDER_RESUME_OFFSET_MS;
          }
        }

        const timestamp = cursor;
        if (timestamp <= Date.now()) continue;
        slot++;

        // Keyed by the slot's own date and time, not by its position in this
        // rebuild: the same slot keeps the same id across app reopens (so a
        // rebuild replaces rather than duplicates it), and a future slot can
        // never share an id with the reminder currently on screen.
        const at = new Date(timestamp);
        const id =
          `${REMINDER_ID_PREFIX}${localDateKey(timestamp)}-` +
          `${String(at.getHours()).padStart(2, '0')}${String(at.getMinutes()).padStart(2, '0')}`;

        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp,
          // `SET_ALARM_CLOCK` is the only alarm type Android exempts from Doze
          // and app-standby outright. The weaker
          // `SET_EXACT_AND_ALLOW_WHILE_IDLE` that was here fires in Doze too,
          // but the OS still rate-limits it to roughly one per app every nine
          // minutes and OEM battery managers push it further — which is the
          // "reminder turns up half an hour late" the user reported. The cost
          // is the system's next-alarm icon in the status bar; for a reminder
          // that now opens a full screen and expects an answer, being on time
          // is worth more than a clean status bar.
          alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
        };

        entries.push({
          id,
          notification: reminderNotification({
            id,
            // The scheduled timestamp makes the id unique per reminder while
            // staying identical across every delivery of the same press.
            eventId: `${id}@${timestamp}`,
            body: buildNotificationContent('regular_reminder', notificationRecipient)?.body,
          }),
          trigger,
        });
      }

      const { failed } = await this.replaceInPlace('Reminders', REMINDER_ID_PREFIX, entries);
      // A cadence slot the delivery gate shifted belongs to the queue just
      // replaced, so it goes too — after the new queue is in place.
      await this.cancelShiftedHydrationReminders();

      console.log(
        `[Reminders] Queued ${slot - failed} reminders (source: actual, anchored on ` +
          `${requestedFromMs > 0 ? 'the requested time' : 'the last drink'} ${new Date(fromMs).toLocaleTimeString()}), ` +
          `${REMINDER_INTERVAL_MS / 3600000}h apart` +
          (sleepShifted
            ? `, resuming at ${schedule.wakeUp} (asleep ${describeSleepWindow(schedule)}).`
            : '.')
      );
    } catch (error) {
      console.error('[Reminders] Failed to schedule:', error);
    }
  }

  /**
   * Remove every queued hydration reminder plus any already sitting in the
   * tray, leaving unrelated notifications untouched.
   */
  async cancelHydrationReminders(): Promise<void> {
    try {
      const triggerIds = await notifee.getTriggerNotificationIds();
      // A cadence slot the delivery gate shifted belongs to the queue being
      // replaced, so it goes with it. Simulated reminders are left alone.
      const queued = triggerIds.filter(
        id =>
          id.startsWith(REMINDER_ID_PREFIX) || id.startsWith(`${SHIFTED_ID_PREFIX}${REMINDER_ID_PREFIX}`)
      );
      if (queued.length) {
        await notifee.cancelTriggerNotifications(queued);
      }

      const displayed = await notifee.getDisplayedNotifications();
      const stale = displayed
        .map(entry => entry.id)
        .filter((id): id is string => !!id && id.startsWith(REMINDER_ID_PREFIX));
      if (stale.length) {
        await notifee.cancelDisplayedNotifications(stale);
      }
    } catch (error) {
      console.error('[Reminders] Failed to cancel:', error);
    }
  }

  /** Drop shifted copies of 2-hour cadence reminders, leaving the rest. */
  private async cancelShiftedHydrationReminders(): Promise<void> {
    try {
      const prefix = `${SHIFTED_ID_PREFIX}${REMINDER_ID_PREFIX}`;
      const queued = (await notifee.getTriggerNotificationIds()).filter(id => id.startsWith(prefix));
      if (queued.length) await notifee.cancelTriggerNotifications(queued);
    } catch (error) {
      console.error('[Reminders] Failed to cancel shifted reminders:', error);
    }
  }

  /** Drop every notification the delivery gate shifted, and nothing else. */
  async cancelShiftedNotifications(): Promise<void> {
    try {
      const triggerIds = await notifee.getTriggerNotificationIds();
      const queued = triggerIds.filter(id => id.startsWith(SHIFTED_ID_PREFIX));
      if (queued.length) {
        await notifee.cancelTriggerNotifications(queued);
      }
    } catch (error) {
      console.error('[Notifications] Failed to cancel shifted notifications:', error);
    }
  }

  /**
   * Fire a reminder in `seconds`, for testing the full-screen behaviour.
   *
   * The real cadence is two hours, which makes every manual check of the
   * lock-screen takeover, the sound, and the shade's action buttons a two-hour
   * wait. Shortening the interval to test it is exactly the change that once
   * shipped a two-minute reminder loop to real users, so this is a separate
   * one-shot instead: it queues a single genuine reminder — same builder, same
   * channel, same alarm type — and touches neither the cadence nor the queue.
   *
   * Guarded by `__DEV__` at the only call site (the bell menu), so it cannot
   * reach a release build. The delay exists so the phone can be locked before
   * it fires, which is the case worth watching.
   */
  async fireTestReminder(seconds: number = 10): Promise<number> {
    const timestamp = Date.now() + seconds * 1000;

    await this.createNotificationChannel();
    await notifee.createTriggerNotification(
      reminderNotification({
        id: `${REMINDER_ID_PREFIX}test`,
        eventId: `${REMINDER_ID_PREFIX}test@${timestamp}`,
      }),
      {
        type: TriggerType.TIMESTAMP,
        timestamp,
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      } satisfies TimestampTrigger
    );

    console.log(`[Reminders] Test reminder queued for ${new Date(timestamp).toLocaleTimeString()}.`);
    return timestamp;
  }

  /* ------------------------------------------------------------------ *
   * The reminder lifecycle, shared by the foreground and background handlers
   * ------------------------------------------------------------------ */

  /**
   * Apply one notifee event to the reminder's state.
   *
   * The same four outcomes have to be handled whether the app is in front of
   * the user, backgrounded, or not running — Android delivers the identical
   * event to `onForegroundEvent` and `onBackgroundEvent` depending only on
   * where the app happens to be. Keeping the decision in one function is what
   * stops the two paths from drifting, which is how "snooze works from the
   * shade but not from the app" bugs are born.
   *
   * Returns what the caller should do next, because that part *is* different:
   * only a mounted app can open the reminder screen.
   */
  async handleReminderEvent(
    type: EventType,
    detail: Event['detail']
  ): Promise<'open-prompt' | 'log-primary' | 'none'> {
    const notification = detail.notification;
    if (notification?.data?.type !== HYDRATION_REMINDER_TYPE) return 'none';

    const eventId = readReminderEventId(notification);

    if (type === EventType.DELIVERED) {
      const id = notification?.id;
      // A reminder that reaches the user inside the quiet window is taken back
      // rather than answered. See `suppressIfAsleep`.
      if (await this.suppressIfAsleep(notification)) return 'none';
      // Nor is a reminder an honest question when the user has just drunk.
      // Withdrawn before `noteReminderDelivered`, so a reminder nobody should
      // have seen never becomes an outstanding one the bell menu reports.
      if (await this.suppressIfRecentlyHydrated(notification)) return 'none';
      if (notification.data?.deliveryAccepted !== '1') {
        const accepted = await this.acceptScheduledDelivery(notification);
        if (!accepted) {
          if (id) {
            try {
              await notifee.cancelDisplayedNotifications([id]);
            } catch (error) {
              console.error('[Notifications] Could not withdraw suppressed reminder:', error);
            }
          }
          return 'none';
        }
        notification.data = { ...(notification.data ?? {}), deliveryAccepted: '1' };
      }
      await this.noteReminderDelivered(notification);
      return 'none';
    }

    if (type === EventType.DISMISSED) {
      // Swiping the shade clear is housekeeping, not an answer. The reminder
      // is kept and pushed back half an hour, which is the direct fix for
      // "I remove the notification and then I forget".
      await ActiveReminder.raise(eventId);
      // Same half hour as before, unless it would land in the sleep window.
      const now = Date.now();
      const returnAt = await this.awakeReturnTime(now + DISMISS_SNOOZE_MS);
      const wakeAt = await ActiveReminder.snooze((returnAt - now) / 60000, now);
      if (wakeAt !== null) {
        await this.queueSnoozeNudge(wakeAt).catch(error =>
          console.error('[Reminders] Failed to re-queue after dismissal:', error)
        );
      }
      return 'none';
    }

    if (type === EventType.ACTION_PRESS) {
      const actionId = detail.pressAction?.id;

      if (actionId === REMINDER_SNOOZE_ACTION) {
        await ActiveReminder.raise(eventId);
        await this.snoozeReminder(NOTIFICATION_SNOOZE_MIN);
        return 'none';
      }

      if (actionId === REMINDER_LOG_ACTION) {
        // The write itself is the caller's job: it needs the authenticated
        // Supabase session and the shared idempotency rules, neither of which
        // belong in the notification layer.
        await ActiveReminder.raise(eventId);
        return 'log-primary';
      }
    }

    if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
      await ActiveReminder.raise(eventId);
      return 'open-prompt';
    }

    return 'none';
  }

  /**
   * The amount the notification's "Log" button offered, taken from the
   * notification itself rather than from the config.
   *
   * A background handler may be running before the admin config has been
   * fetched, and it must log the amount whose label the user actually read.
   */
  readPrimaryAmountMl(notification?: Notification | null): number {
    const stamped = Number(notification?.data?.primaryMl);
    if (Number.isFinite(stamped) && stamped > 0) return stamped;
    return primaryQuickAmount().ml;
  }

  /**
   * Watch reminder deliveries, dismissals and action presses while the app is
   * foregrounded. Returns an unsubscribe function.
   *
   * `onAction` receives the same verdict the background handler acts on, so a
   * "Log" pressed with the app open behaves exactly as one pressed with it
   * closed.
   */
  startReminderLifecycle(
    onAction: (
      verdict: 'open-prompt' | 'log-primary',
      context: { eventId: string; amountMl: number }
    ) => void
  ): () => void {
    return notifee.onForegroundEvent(({ type, detail }) => {
      this.handleReminderEvent(type, detail)
        .then(verdict => {
          if (verdict === 'none') return;
          onAction(verdict, {
            eventId: readReminderEventId(detail.notification),
            // Read off the notification the user actually pressed, so the
            // amount written is the one whose label was on the button.
            amountMl: this.readPrimaryAmountMl(detail.notification),
          });
        })
        .catch(error => console.error('[Reminders] Foreground event failed:', error));
    });
  }

  /* ------------------------------------------------------------------ *
   * Snooze, reschedule, and the outstanding-reminder state
   *
   * A reminder used to be over the moment it was delivered: swipe it away and
   * nothing remembered it had ever fired. Everything below exists so that a
   * reminder stays a question until the user answers it — snoozing moves it,
   * dismissing it postpones it, and only logging (or an explicit skip) ends it.
   * ------------------------------------------------------------------ */

  /**
   * Record that a reminder has just been delivered, so the app knows there is
   * an unanswered one even if the notification never gets tapped.
   *
   * Called from every delivery path — foreground event, background event, and
   * the tray sweep on open — because none of them is guaranteed to run. They
   * all pass the same event id, and `ActiveReminder.raise` collapses repeats.
   */
  async noteReminderDelivered(notification?: Notification | null): Promise<void> {
    if (notification?.data?.type !== HYDRATION_REMINDER_TYPE) return;
    await ActiveReminder.raise(readReminderEventId(notification));
    // One outstanding reminder at a time, in the tray as in the app: a newer
    // one supersedes any older reminder still sitting in the shade.
    await this.clearDisplayedReminders(notification.id);
  }

  /**
   * Push the outstanding reminder back by `minutes` and queue the nudge that
   * brings it back.
   *
   * The re-nudge is a single one-shot notification rather than a rebuild of
   * the whole cadence: the 2-hourly queue is still standing and still correct,
   * and a snooze is an extra beat inside it, not a replacement for it.
   */
  async snoozeReminder(minutes: number): Promise<number | null> {
    // A snooze that would end inside the sleep window returns at the next
    // valid awake time instead; an awake-time snooze is unchanged.
    const now = Date.now();
    const returnAt = await this.awakeReturnTime(now + minutes * 60 * 1000);
    const wakeAt = await ActiveReminder.snooze((returnAt - now) / 60000, now);
    if (wakeAt === null) return null;

    try {
      // Clear the notification being snoozed, so the shade does not show a
      // reminder the user has already dealt with.
      await this.clearDisplayedReminders();
      await this.queueSnoozeNudge(wakeAt);
      console.log(`[Reminders] Snoozed ${minutes}m, returning at ${new Date(wakeAt).toISOString()}.`);
    } catch (error) {
      console.error('[Reminders] Failed to queue snooze:', error);
    }
    return wakeAt;
  }

  /**
   * Move the outstanding reminder to a specific wall-clock time.
   *
   * Distinct from a snooze in intent rather than in mechanism: "remind me at
   * 4pm" is a decision about the day, "snooze 15 minutes" is a decision about
   * right now. A time already past, or one inside the sleep window, is refused
   * — silently accepting either would leave the user believing a reminder is
   * coming that never will.
   */
  async rescheduleReminderAt(timestamp: number): Promise<boolean> {
    const now = Date.now();
    if (!Number.isFinite(timestamp) || timestamp <= now) return false;
    if (await this.isSilentFor('regular_reminder', timestamp)) return false;

    const minutes = (timestamp - now) / 60000;
    return (await this.snoozeReminder(minutes)) !== null;
  }

  /**
   * `at` itself outside the silence window. Inside it (Good Night → next Good
   * Morning, sleep included), the next valid time by the rule the 2-hour
   * reminders already use for a slot moved out of the night: Good Morning
   * plus `REMINDER_RESUME_OFFSET_MS`, kept clear of the fixed slots and daily
   * messages. The reminder is moved, never dropped.
   */
  private async awakeReturnTime(at: number): Promise<number> {
    const schedule = await this.getSleepSchedule();
    if (!isInSilenceWindow(schedule, at)) return at;

    let moved = nextActiveAt(schedule, at) + REMINDER_RESUME_OFFSET_MS;
    for (let pass = 0; pass < 3; pass++) {
      const cleared = clearOfScheduledSlots(moved, schedule);
      if (cleared === moved) break;
      moved = cleared;
      const active = nextActiveAt(schedule, moved);
      if (active !== moved) moved = active + REMINDER_RESUME_OFFSET_MS;
    }
    console.log(
      `[Reminders] Return time ${new Date(at).toLocaleTimeString()} is inside the silence window; ` +
        `moved to ${new Date(moved).toLocaleString()}.`
    );
    return moved;
  }

  /**
   * The reminder the full-screen UI should show right now, or null.
   *
   * `ActiveReminder.due` knows nothing of the sleep window, so on its own it
   * would put the full-screen reminder back up at night once a snooze ran
   * out. Asleep, nothing is shown — the reminder stays stored and is due
   * again after wake-up.
   */
  async reminderDueNow(now: number = Date.now()): Promise<ActiveReminderRecord | null> {
    if (await this.isSilentFor('regular_reminder', now)) return null;
    return ActiveReminder.due(now);
  }

  /**
   * How long the app may stay over the lock screen with no reminder showing:
   * none at all in the sleep window, `graceMs` otherwise (a cold start from a
   * reminder may mount before the reminder is recorded).
   */
  async lockScreenReleaseDelayMs(graceMs: number): Promise<number> {
    return (await this.isSilentFor('regular_reminder', Date.now())) ? 0 : graceMs;
  }

  /** Queue the one-shot notification that re-raises a snoozed reminder. */
  private async queueSnoozeNudge(timestamp: number): Promise<void> {
    await this.createNotificationChannel();
    await this.cancelSnoozeNudge();
    // Belt and braces: whatever the caller asked for, never inside the night.
    timestamp = await this.awakeReturnTime(timestamp);

    await notifee.createTriggerNotification(
      reminderNotification({
        id: SNOOZE_ID,
        // A fresh event id: this is a new delivery the user has not seen, and
        // reusing the snoozed one would have the dedupe swallow it.
        eventId: `${SNOOZE_ID}@${timestamp}`,
      }),
      {
        type: TriggerType.TIMESTAMP,
        timestamp,
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      } satisfies TimestampTrigger
    );
  }

  /** Drop a queued snooze nudge — used when the reminder is answered instead. */
  async cancelSnoozeNudge(): Promise<void> {
    try {
      const queued = await notifee.getTriggerNotificationIds();
      if (queued.includes(SNOOZE_ID)) {
        await notifee.cancelTriggerNotifications([SNOOZE_ID]);
      }
    } catch (error) {
      console.error('[Reminders] Failed to cancel snooze nudge:', error);
    }
  }

  /**
   * The user answered: clear the outstanding reminder, the queued snooze and
   * anything still in the shade.
   *
   * Called after a successful log and after an explicit skip. The 2-hourly
   * cadence is *not* touched here — a hydration write resets it through
   * `HydrationService`, and a skip should leave it exactly as it was.
   */
  async resolveActiveReminder(amountMl?: number): Promise<void> {
    // Read the outstanding reminder before clearing it: its event id is what
    // ties the write to the row in the bell menu, and `resolve` drops it.
    //
    // This is the only path that marks a notification answered. Opening one
    // deliberately does not, because it used to: a tap turned the row green
    // and settled every earlier reminder, so a user who opened a nudge and
    // drank nothing saw a log claiming otherwise.
    if (amountMl !== undefined && amountMl > 0) {
      try {
        const outstanding = await ActiveReminder.current();
        if (outstanding) {
          await NotificationHistory.recordAnswered(outstanding.eventId, amountMl);
        }
      } catch (error) {
        console.error('[Reminders] Failed to record the answer:', error);
      }
    }

    await ActiveReminder.resolve();
    await this.cancelSnoozeNudge();
    await this.clearDisplayedReminders();
  }

  /**
   * Take hydration reminders out of the shade, leaving the queue alone —
   * every kind: the 2-hour cadence, its shifted copies, the snooze nudge and
   * the fixed 09:00 / 17:00 / 22:30 reminders. `keepId` is left in place.
   */
  private async clearDisplayedReminders(keepId?: string): Promise<void> {
    try {
      const displayed = await notifee.getDisplayedNotifications();
      const ids = displayed
        .filter(entry => entry.notification?.data?.type === HYDRATION_REMINDER_TYPE || isReminderTrayId(entry.id))
        .map(entry => entry.id)
        .filter((id): id is string => !!id && id !== keepId);
      if (ids.length) await notifee.cancelDisplayedNotifications(ids);
    } catch (error) {
      console.error('[Reminders] Failed to clear displayed reminders:', error);
    }
  }

  /* ------------------------------------------------------------------ *
   * Full-screen reminders
   * ------------------------------------------------------------------ */

  /**
   * Whether a reminder would actually take over the screen, or quietly fall
   * back to a banner.
   *
   * Three independent things can suppress it, and all belong to the user: the
   * Android 14+ full-screen-intent grant, the "Display over other apps" grant
   * that covers the unlocked-and-in-use case the first one does not, and the
   * channel's importance (a channel the user has turned down below HIGH loses
   * the full-screen behaviour). All three are reported here so the app can
   * explain the actual reason rather than guessing.
   */
  async fullScreenReminderStatus(): Promise<{
    granted: boolean;
    channelAllows: boolean;
    canLaunchOverApps: boolean;
    available: boolean;
    availableInUse: boolean;
  }> {
    if (Platform.OS !== 'android') {
      // iOS has no equivalent; the in-app prompt is the whole feature there.
      return {
        granted: false,
        channelAllows: false,
        canLaunchOverApps: false,
        available: false,
        availableInUse: false,
      };
    }

    // Only Android's own `true` counts. A missing module, a bridge that threw,
    // or a native side that could not read the state (it resolves `null`) is
    // "not verified", and the gate keeps the step up rather than guessing.
    let granted = false;
    try {
      const native = NativeModules.FullScreenReminderModule;
      if (native?.canUseFullScreenIntent) {
        granted = (await native.canUseFullScreenIntent()) === true;
      }
    } catch (error) {
      console.warn('[Reminders] Could not read full-screen intent state:', error);
    }

    let channelAllows = true;
    try {
      const channel = await notifee.getChannel(REMINDER_CHANNEL_ID);
      // A channel that does not exist yet has not been demoted by anyone.
      if (channel) {
        channelAllows = (channel.importance ?? AndroidImportance.HIGH) >= AndroidImportance.HIGH;
      }
    } catch (error) {
      console.warn('[Reminders] Could not read reminder channel:', error);
    }

    const { granted: canLaunchOverApps } = await this.backgroundLaunchStatus();

    return {
      granted,
      channelAllows,
      canLaunchOverApps,
      // Two different moments, two different permissions. `available` is the
      // locked or dark phone, which is all the full-screen *intent* ever
      // covers. `availableInUse` is the user awake with the phone in their
      // hand — Android downgrades the intent to a banner there, so it takes
      // the overlay grant instead. Reported apart because a reminder can
      // genuinely work in one case and not the other, and collapsing them
      // would have the app ask for a permission that changes nothing.
      available: granted && channelAllows,
      availableInUse: canLaunchOverApps && channelAllows,
    };
  }

  /** Sends the user to the setting that allows full-screen reminders. */
  async openFullScreenReminderSettings(): Promise<void> {
    try {
      const native = NativeModules.FullScreenReminderModule;
      if (native?.openFullScreenIntentSettings) {
        const opened = await native.openFullScreenIntentSettings();
        if (opened) return;
      }
      // No module, or the OEM has no such screen: the app's notification
      // settings are the nearest place the user can act.
      await notifee.openNotificationSettings(REMINDER_CHANNEL_ID);
    } catch (error) {
      console.error('[Reminders] Failed to open full-screen settings:', error);
    }
  }

  /* ------------------------------------------------------------------ *
   * What the reminder says, at the moment it says it
   * ------------------------------------------------------------------ */

  /**
   * Rewrite a delivered reminder with what is true right now.
   *
   * Reminders are queued as one-shot alarms up to `REMINDER_COVERAGE_MS` — a
   * full day — ahead of time, and `createTriggerNotification` bakes the text
   * in when it queues. So anything specific written at that point is stale by
   * the time it fires: a risk score from yesterday morning shown at nine
   * tonight is not a stale detail, it is a wrong number on a health
   * notification, which the user has no way to check.
   *
   * Android's only way to change a posted notification is to post it again
   * under the same id, so that is what this does. The re-post carries
   * `refreshed`, and the caller skips a delivery that already has it —
   * otherwise the refresh would trigger its own refresh without end. The
   * `eventId` is deliberately unchanged, so the second delivery collapses into
   * the first everywhere it is recorded: `ActiveReminder.raise` returns early
   * on a reminder it is already holding, and `NotificationHistory` drops a
   * duplicate id, so the bell menu shows one reminder and its "x minutes ago"
   * still counts from the original.
   *
   * The facts are passed in rather than read here. Gathering them needs the
   * profile, the hydration log and the telemetry history — all of which
   * already depend on this module, so reading them from inside it would close
   * an import cycle. `ReminderFactsService` does the gathering; this does the
   * wording and the posting.
   *
   * Never throws. A reminder that could not be personalised is still a
   * reminder, and it is already on the user's screen by the time this runs.
   */
  async refreshReminderContent(
    notification: Notification | null | undefined,
    _facts: ReminderFacts
  ): Promise<'refreshed' | 'skipped'> {
    // Excel copy is immutable. A delivery-time rewrite can create a second
    // DELIVERED event and, worse, append stale personal/risk details.
    return 'skipped';
  }

  /* ------------------------------------------------------------------ *
   * Raising the reminder while the phone is unlocked and in use
   * ------------------------------------------------------------------ */

  /**
   * Whether the app may open the reminder screen over another app.
   *
   * Separate from `fullScreenReminderStatus` because it is a different
   * permission covering a different moment. The full-screen *intent* only
   * ever fires on a screen that is off or locked — Android downgrades it to a
   * heads-up banner as soon as the user is actually holding the phone. The
   * unlocked-and-in-use case is the one the reminder most needs, and it needs
   * "Display over other apps" instead.
   */
  async backgroundLaunchStatus(): Promise<{ granted: boolean }> {
    if (Platform.OS !== 'android') return { granted: false };

    try {
      const native = NativeModules.FullScreenReminderModule;
      if (native?.canLaunchOverOtherApps) {
        return { granted: await native.canLaunchOverOtherApps() };
      }
    } catch (error) {
      console.warn('[Reminders] Could not read the background-launch grant:', error);
    }
    // An old build of the native module, or none at all. Reported as granted
    // so the app does not nag about a permission it cannot verify — the launch
    // itself still reports honestly when it is refused.
    return { granted: true };
  }

  /**
   * Whether the app may show over the lock screen right now.
   *
   * Native code turns this on when a reminder launches the app while the
   * phone is locked or its screen is off (`MainActivity`), so the reminder
   * wakes the screen and appears over the keyguard. It must not outlive the
   * reminder: once none is outstanding, HomeScreen turns it off again and the
   * lock screen returns, so the rest of the app is never reachable without
   * unlocking. Resolves false where there is nothing to change.
   */
  async setShowOverLockScreen(enabled: boolean): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      const native = NativeModules.FullScreenReminderModule;
      if (!native?.setShowOverLockScreen) return false;
      return await native.setShowOverLockScreen(enabled);
    } catch (error) {
      console.warn('[Reminders] Could not change the lock-screen setting:', error);
      return false;
    }
  }

  /** Sends the user to the "Display over other apps" screen. */
  async openBackgroundLaunchSettings(): Promise<void> {
    try {
      const native = NativeModules.FullScreenReminderModule;
      if (native?.openOverlaySettings) await native.openOverlaySettings();
    } catch (error) {
      console.error('[Reminders] Failed to open overlay settings:', error);
    }
  }

  /**
   * Put the reminder screen in front of the user, wherever they are.
   *
   * Called on every reminder delivery that reaches the background handler. It
   * is deliberately unconditional at the call site and selective here, because
   * only the native side can see the three things that decide the answer —
   * whether the screen is on, whether the keyguard is up, and whether this app
   * is already resumed. The states break down as:
   *
   *  - **App in the foreground** — nothing to do. `ReminderFullScreen` is
   *    driven by the outstanding reminder, which the delivery has already
   *    raised, so the prompt is on screen before this is even reached.
   *  - **Screen off, or locked** — the notification's own `fullScreenAction`
   *    is what fires; `MainActivity` sees the phone locked and lets the
   *    reminder wake the screen and show over the keyguard
   *    (`FullScreenReminderModule.showOverLockScreenIfLocked`). Launching again
   *    here would be a duplicate.
   *  - **Unlocked, user in another app** — this is the gap, and the only case
   *    that actually starts an activity. Android will not do it for us.
   *
   * Never throws: a reminder that cannot be raised full-screen is still in the
   * shade with its two inline actions, which is the fallback the whole feature
   * is built to degrade to.
   */
  async presentReminderFullScreen(notification?: Notification | null): Promise<string> {
    if (notification && notification.data?.type !== HYDRATION_REMINDER_TYPE) return 'not-a-reminder';
    if (Platform.OS !== 'android') return 'unsupported';

    try {
      const native = NativeModules.FullScreenReminderModule;
      if (!native?.presentReminder) return 'unsupported';

      const outcome: string = await native.presentReminder();
      if (outcome === 'not-permitted') {
        // Worth a line in the log: this is the one outcome the user can fix,
        // and the banner that asks them to is driven by the same grant.
        console.log('[Reminders] Cannot open over other apps — the grant is missing.');
      }
      return outcome;
    } catch (error) {
      console.error('[Reminders] Failed to raise the reminder screen:', error);
      return 'failed';
    }
  }

  /* ------------------------------------------------------------------ *
   * Fixed-time daily messages
   * ------------------------------------------------------------------ */

  /**
   * Queue the morning and night messages at their own clock times for the next
   * `DAILY_HORIZON_DAYS` days.
   *
   * Re-queued rather than topped up on every call, so a device that has been
   * asleep for a week still ends up with a correct week ahead, and a changed
   * sleep window is applied to slots that were already scheduled.
   */
  async scheduleDailyNotifications(fromMs: number = Date.now()): Promise<void> {
    return this.enqueue('daily', fromMs, at => this.rescheduleDaily(at));
  }

  private async rescheduleDaily(fromMs: number): Promise<void> {
    const isCurrent = this.beginRebuild('daily');
    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        console.warn('[Daily] Notification permission denied; skipping schedule.');
        return;
      }

      await this.createNotificationChannel();
      await this.getNotificationRecipient();
      const dailyTargetMl = await this.getDailyWaterTarget();

      const schedule = await this.getSleepSchedule();
      // Built first and applied in place (see `replaceInPlace`) — never
      // cancel-then-recreate, which left nothing queued if the app was frozen
      // or killed part-way through the rebuild.
      const entries: QueuedEntry[] = [];

      for (let day = 0; day < DAILY_HORIZON_DAYS; day++) {
        for (const message of DAILY_MESSAGES) {
          // Derived from the user's own window — an hour after their wake-up,
          // an hour before their bedtime — not from a fixed 07:00/22:00. For
          // anyone who does not keep office hours the fixed times inverted the
          // meaning of both messages.
          const minute = dailyMessageMinute(message, schedule);
          const at = new Date(fromMs);
          at.setDate(at.getDate() + day);
          at.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
          const timestamp = at.getTime();

          if (timestamp <= Date.now()) continue;
          // N14: routine notifications stay silent inside the quiet window.
          // These are dropped rather than shifted — a "good morning" delivered
          // at bedtime is worse than no greeting at all. With the times now
          // derived from the window itself this should not trigger, but a
          // window narrower than the two offsets can still fold one inside.
          if (isAsleepAt(schedule, timestamp)) continue;

          // The Daily Water Requirement has no content until a target is
          // known, and is queued by `setDailyWaterTarget` once one is.
          const content = buildNotificationContent(message.trigger, notificationRecipient, dailyTargetMl);
          if (!content) continue;
          const body = content.body;

          // Keyed by date, not by offset from today, so the same message for
          // the same day always has the same id and a rebuild replaces it.
          const id = `${DAILY_ID_PREFIX}${message.key}-${localDateKey(timestamp)}`;
          entries.push({
            id,
            notification: {
              id,
              title: content.title,
              body,
              data: {
                type: DAILY_MESSAGE_TYPE,
                key: message.key,
                notificationKey: message.trigger,
                eventId: `${id}@${timestamp}`,
                source: 'actual',
                reason:
                  message.key === 'morning'
                    ? `wake-up ${schedule.wakeUp} + 30 min`
                    : message.key === 'water'
                      ? `wake-up ${schedule.wakeUp} + 1h`
                      : `bedtime ${schedule.sleepStart} - 1h`,
              },
              android: androidOptions(REMINDER_CHANNEL_ID, body, {
                importance: AndroidImportance.DEFAULT,
                summary: content.title,
              }),
            },
            trigger: {
              type: TriggerType.TIMESTAMP,
              timestamp,
              alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
            },
          });
        }
      }

      const { queued, failed } = await this.replaceInPlace('Daily', DAILY_ID_PREFIX, entries, isCurrent);
      console.log(
        `[Daily] Queued ${queued} at-actual messages over ${DAILY_HORIZON_DAYS} days` +
          (failed ? `; ${failed} failed (see above).` : '.')
      );
      await this.logTodaySchedule('daily rebuild');
    } catch (error) {
      console.error('[Daily] Failed to schedule:', error);
    }
  }

  /**
   * Put `entries` into the OS queue without ever emptying it first.
   *
   * Each entry is created under its stable id, which Notifee treats as a
   * replace, so the previous copy stays valid until the new one lands — a
   * rebuild stopped part-way (the app frozen or killed in the background)
   * leaves the earlier schedule in place instead of nothing. Today's entries
   * come first in `entries`, so they are refreshed first.
   *
   * Each create is caught on its own: one failure is logged and the rest are
   * still queued. Only after that are ids under `prefix` that are no longer
   * wanted (a past day, a slot now inside the sleep window, an old id format)
   * cancelled.
   */
  private async replaceInPlace(
    label: string,
    prefix: string,
    entries: QueuedEntry[],
    isCurrent: () => boolean = () => true
  ): Promise<{ queued: number; failed: number }> {
    let queued = 0;
    let failed = 0;

    for (const entry of entries) {
      // A newer rebuild of this queue has started (see `beginRebuild`): its
      // entries are the right ones, and this run must not overwrite them or
      // go on to cancel what only it does not know about.
      if (!isCurrent()) {
        console.log(`[${label}] Superseded by a newer rebuild; stopping.`);
        return { queued, failed };
      }
      try {
        await notifee.createTriggerNotification(entry.notification, entry.trigger);
        queued++;
      } catch (error) {
        failed++;
        console.error(`[${label}] Could not queue ${entry.id}; the rest continue:`, error);
      }
    }

    try {
      const wanted = new Set(entries.map(entry => entry.id));
      const stale = (await notifee.getTriggerNotificationIds()).filter(
        id => id.startsWith(prefix) && !wanted.has(id)
      );
      if (!isCurrent()) {
        console.log(`[${label}] Superseded by a newer rebuild; nothing cancelled.`);
        return { queued, failed };
      }
      if (stale.length) {
        await notifee.cancelTriggerNotifications(stale);
        console.log(
          `[${label}] Cancelled ${stale.length} no longer in the schedule ` +
            `(past day, inside the sleep window, or an old id): ${stale.join(', ')}`
        );
      }
    } catch (error) {
      console.error(`[${label}] Could not remove stale entries:`, error);
    }

    return { queued, failed };
  }

  /**
   * Logs every notification still queued for the rest of today, one line
   * each: time, fixed or at-actual, type, id and why it was queued. Written
   * after each rebuild so a device log shows exactly what the OS holds.
   */
  async logTodaySchedule(context: string): Promise<void> {
    try {
      const now = Date.now();
      const endOfToday = new Date(now).setHours(23, 59, 59, 999);
      const rows = (await notifee.getTriggerNotifications())
        .map(({ notification, trigger }) => ({
          id: notification.id ?? '?',
          at: (trigger as TimestampTrigger).timestamp,
          key: String(notification.data?.notificationKey ?? notification.data?.type ?? '?'),
          source: String(notification.data?.source ?? 'actual'),
          reason: String(notification.data?.reason ?? ''),
        }))
        .filter(row => typeof row.at === 'number' && row.at > now && row.at <= endOfToday)
        .sort((a, b) => a.at - b.at);

      console.log(`[Schedule] Rest of today after ${context}: ${rows.length} queued`);
      for (const row of rows) {
        const at = new Date(row.at);
        const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
        console.log(
          `[Schedule]   ${clock}  ${row.source === 'simulation' ? 'FIXED ' : 'actual'}  ` +
            `${row.key.padEnd(16)}  ${row.id}  (${row.reason})`
        );
      }
    } catch (error) {
      console.warn('[Schedule] Could not read the trigger list:', error);
    }
  }

  /** Drop every queued fixed-time message, leaving reminders untouched. */
  async cancelDailyNotifications(): Promise<void> {
    try {
      const triggerIds = await notifee.getTriggerNotificationIds();
      const queued = triggerIds.filter(id => id.startsWith(DAILY_ID_PREFIX));
      if (queued.length) {
        await notifee.cancelTriggerNotifications(queued);
      }
    } catch (error) {
      console.error('[Daily] Failed to cancel:', error);
    }
  }

  /* ------------------------------------------------------------------ *
   * Excel Simulated Notifications
   * ------------------------------------------------------------------ */

  /**
   * Queue the simulated notifications for the next `DAILY_HORIZON_DAYS` days,
   * each at its exact clock time from `SIMULATED_SCHEDULE_SLOTS`.
   *
   * Slots inside the sleep window are never queued. Rescheduling cancels only
   * simulated ids. With `NOTIFICATION_SIMULATION.ENABLED` off, the queue is
   * cleared and nothing is queued.
   */
  async scheduleSimulatedNotifications(fromMs: number = Date.now()): Promise<void> {
    return this.enqueue('simulated', fromMs, at => this.rescheduleSimulated(at));
  }

  private async rescheduleSimulated(fromMs: number): Promise<void> {
    const isCurrent = this.beginRebuild('simulated');
    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        console.warn('[Simulated] Notification permission denied; skipping schedule.');
        return;
      }

      await this.createNotificationChannel();
      await this.getNotificationRecipient();

      if (!NOTIFICATION_SIMULATION.ENABLED) {
        await this.cancelSimulatedNotifications();
        console.log('[Simulated] Simulation disabled; queue cleared.');
        return;
      }

      const schedule = await this.getSleepSchedule();
      // Applied in place, today first; see `replaceInPlace`.
      const entries: QueuedEntry[] = [];

      for (let day = 0; day < DAILY_HORIZON_DAYS; day++) {
        const baseDate = new Date(fromMs);
        baseDate.setDate(baseDate.getDate() + day);

        const dailySlots = calculateDailySimulatedSchedule(schedule, baseDate);

        for (const slot of dailySlots) {
          const timestamp = slot.timestamp;
          if (timestamp <= Date.now()) continue;

          const content = buildNotificationContent(slot.trigger, notificationRecipient);
          if (!content) continue;
          const body = content.body;

          const at = new Date(timestamp);
          const clock = `${String(at.getHours()).padStart(2, '0')}${String(at.getMinutes()).padStart(2, '0')}`;
          const id = `${SIMULATED_ID_PREFIX}${localDateKey(timestamp)}-${clock}-${slot.trigger}`;
          const reason = `simulation slot ${clock.slice(0, 2)}:${clock.slice(2)}`;
          entries.push({
            id,
            // The fixed Hydration Reminders are built exactly like the 2-hour
            // ones — same full-screen intent, Log / Snooze actions, alarm
            // category and text — so they raise the same full-screen flow.
            // Everything else in the fixed schedule stays an ordinary
            // notification.
            notification:
              slot.trigger === 'regular_reminder'
                ? reminderNotification({ id, eventId: `${id}@${timestamp}`, source: 'simulation', reason })
                : {
                    id,
                    title: content.title,
                    body,
                    data: {
                      type: slot.type,
                      notificationKey: slot.trigger,
                      eventId: `${id}@${timestamp}`,
                      source: 'simulation',
                      reason,
                    },
                    android: androidOptions(REMINDER_CHANNEL_ID, body, {
                      importance: AndroidImportance.DEFAULT,
                      summary: content.title,
                    }),
                  },
            trigger: {
              type: TriggerType.TIMESTAMP,
              timestamp,
              alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
            },
          });
        }
      }

      const { queued, failed } = await this.replaceInPlace('Simulated', SIMULATED_ID_PREFIX, entries, isCurrent);
      console.log(
        `[Simulated] Queued ${queued} fixed-time notifications over ${DAILY_HORIZON_DAYS} days` +
          (failed ? `; ${failed} failed (see above).` : '.')
      );
      await this.logTodaySchedule('fixed-schedule rebuild');
    } catch (error) {
      console.error('[Simulated] Failed to schedule:', error);
    }
  }

  /**
   * Cancel only queued simulated notifications (`SIMULATED_ID_PREFIX`),
   * leaving Good Morning / Good Night and other notifications untouched.
   */
  async cancelSimulatedNotifications(): Promise<void> {
    try {
      const triggerIds = await notifee.getTriggerNotificationIds();
      const queued = triggerIds.filter(id => id.startsWith(SIMULATED_ID_PREFIX));
      if (queued.length) {
        await notifee.cancelTriggerNotifications(queued);
      }
    } catch (error) {
      console.error('[Simulated] Failed to cancel:', error);
    }
  }

  /* ------------------------------------------------------------------ *
   * Reminder press handling
   * ------------------------------------------------------------------ */

  /**
   * Listen for reminder presses while the app is in the foreground. The
   * listener receives the press's event id so repeats can be recognised.
   * Returns an unsubscribe function.
   */
  onForegroundReminderPress(listener: (eventId: string) => void): () => void {
    return notifee.onForegroundEvent(event => {
      if (event.type === EventType.PRESS && isHydrationReminder(event)) {
        listener(readReminderEventId(event.detail.notification));
      }
    });
  }

  /**
   * Whether Android will honour the reminder interval, or batch it.
   *
   * Notifee reports this from the older `SCHEDULE_EXACT_ALARM` permission. On
   * a device where only `USE_EXACT_ALARM` is granted the OS is in fact happy
   * to schedule exact alarms, but notifee's own native scheduling consults
   * the same outdated check and downgrades anyway — so this is the value that
   * decides whether reminders actually land on their interval, whatever the
   * platform thinks. `false` means Android is free to batch them onto a
   * ~5-minute grid, which is what makes a 2-minute cadence drift.
   */
  async hasExactAlarmPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const settings = await notifee.getNotificationSettings();
      return settings.android?.alarm !== AndroidNotificationSetting.DISABLED;
    } catch (error) {
      console.warn('[Reminders] Could not read alarm settings:', error);
      return true; // Don't nag on the strength of a failed check.
    }
  }

  /** Opens the system "Alarms & reminders" screen so the user can allow it. */
  async openExactAlarmSettings(): Promise<void> {
    try {
      await notifee.openAlarmPermissionSettings();
    } catch (error) {
      console.error('[Reminders] Failed to open alarm settings:', error);
    }
  }

  /* ------------------------------------------------------------------ *
   * Delivery log (the bell menu)
   * ------------------------------------------------------------------ */

  /**
   * A notification delivered while the app is in the background or closed,
   * from `index.js` — the same decisions the foreground path makes:
   *
   *  - withdrawn in the sleep window, or (a 2-hour reminder) right after a drink;
   *  - rejected by the delivery gate: **taken back out of the tray**, as the
   *    foreground path does (a shifted copy, if any, comes later);
   *  - otherwise recorded in the bell history. `recordDelivery` keeps one row
   *    per event id, so a repeat through another path adds nothing.
   *
   * Returns whether it was delivered.
   */
  async handleBackgroundDelivery(notification?: Notification | null): Promise<boolean> {
    if (!notification) return false;
    if (await this.suppressIfAsleep(notification)) return false;
    if (await this.suppressIfRecentlyHydrated(notification)) return false;

    if (notification.data?.deliveryAccepted !== '1') {
      if (!(await this.acceptScheduledDelivery(notification))) {
        if (notification.id) {
          await notifee.cancelDisplayedNotifications([notification.id]).catch(() => {});
        }
        return false;
      }
      notification.data = { ...(notification.data ?? {}), deliveryAccepted: '1' };
    }

    await NotificationHistory.recordDelivery(notification);
    return true;
  }

  /**
   * Record deliveries and presses for *every* notification while the app is
   * foregrounded. Separate from `onForegroundReminderPress` on purpose: the
   * log covers push messages and one-off notifications too, and notifee
   * allows any number of foreground listeners.
   *
   * Returns an unsubscribe function.
   */
  startHistoryTracking(): () => void {
    return notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.DELIVERED) {
        const notification = detail.notification;
        if (!notification) return;
        if (notification.data?.refreshed === '1') return;

        if (notification.data?.deliveryAccepted === '1') {
          void NotificationHistory.recordDelivery(notification);
          return;
        }
        void this.acceptScheduledDelivery(notification).then(accepted => {
          if (!accepted) {
            const id = notification.id;
            if (id) {
              void notifee.cancelDisplayedNotifications([id]).catch(() => {});
            }
            return;
          }
          notification.data = { ...(notification.data ?? {}), deliveryAccepted: '1' };
          void NotificationHistory.recordDelivery(notification);
        });
      } else if (type === EventType.PRESS) {
        NotificationHistory.recordPress(detail.notification);
      }
    });
  }

  /**
   * Fold anything still sitting in the notification tray into the log.
   *
   * Deliveries that happen while the app is killed reach JS through a headless
   * task, which Android is free to skip under memory pressure or on OEM builds
   * with aggressive background limits. Sweeping the tray on open recovers
   * those, using the system's own "shown at" time where it reports one.
   * `recordDelivery` ignores ids it already knows, so this never duplicates a
   * row or disturbs a recorded press.
   */
  async syncDeliveredFromTray(): Promise<void> {
    try {
      const displayed = await notifee.getDisplayedNotifications();
      const now = Date.now();
      const EXPIRY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

      for (const entry of displayed) {
        if (!entry.notification) continue;
        const eventId = readReminderEventId(entry.notification);
        if (await this.isEventAlreadyProcessed(eventId)) continue;

        const notificationKey = String(
          entry.notification.data?.notificationKey ??
            entry.notification.data?.key ??
            entry.notification.data?.type ??
            entry.notification.title ??
            'notification'
        );

        let scheduledAt = NaN;
        if (eventId.includes('@')) {
          const parts = eventId.split('@');
          scheduledAt = Number(parts[parts.length - 1]);
        }
        if (!Number.isFinite(scheduledAt) && entry.date) {
          scheduledAt = Date.parse(entry.date);
        }

        const ageMs = Number.isFinite(scheduledAt) ? now - scheduledAt : 0;

        if (ageMs > EXPIRY_THRESHOLD_MS) {
          // Stale / old missed notification: mark processed and clear from tray without prompt/burst
          console.log(`[Notifications] Clearing expired tray notification (${Math.round(ageMs / 60000)}m old): ${eventId}`);
          // It was on the phone, so it belongs in the bell — this is the one
          // record of a delivery whose background handler never ran (the app
          // could not start). Kept out when it fell in the sleep window.
          const deliveredAt = Number.isFinite(scheduledAt) ? scheduledAt : now;
          if (!isAsleepAt(await this.getSleepSchedule(), deliveredAt)) {
            await NotificationHistory.recordDelivery(entry.notification, deliveredAt);
          }
          await this.markEventProcessed(eventId);
          if (entry.notification.id) {
            await notifee.cancelDisplayedNotifications([entry.notification.id]).catch(() => {});
          }
          continue;
        }

        const deliveredAt = Number.isFinite(scheduledAt) ? scheduledAt : now;

        await this.markEventProcessed(eventId);
        await this.noteNotificationShown(deliveredAt);
        await this.noteDeliveredType(notificationKey, deliveredAt);
        if (categoryOf(notificationKey, entry.notification.data?.source) === 'dynamic') {
          await this.noteDynamicDelivered(deliveredAt);
        }
        await NotificationHistory.recordDelivery(entry.notification, deliveredAt);

        // A reminder still sitting in the tray is a reminder nobody has
        // answered. The delivery event that would have recorded it may never
        // have reached JS — a headless task Android skipped under memory
        // pressure, or a phone that was simply off — so the tray itself is the
        // last reliable place to notice it.
        if (entry.notification?.data?.type === HYDRATION_REMINDER_TYPE) {
          await ActiveReminder.raise(eventId, deliveredAt);
        }
      }
    } catch (error) {
      console.error('[Notifications] Failed to sync delivered notifications:', error);
    }
  }

  /**
   * Called from the background/quit-state event handler so the press can be
   * replayed once the React tree is mounted. Ids are queued rather than
   * overwritten, and the queue is deduped, so several background taps replay
   * as the events they actually were.
   */
  async markHydrationPromptPending(eventId: string): Promise<void> {
    try {
      const queued = await this.readPendingIds();
      if (queued.includes(eventId)) return;
      const next = [...queued, eventId].slice(-PENDING_PROMPT_LIMIT);
      await AsyncStorage.setItem(PENDING_PROMPT_KEY, JSON.stringify(next));
    } catch (error) {
      console.error('[Reminders] Failed to store pending prompt:', error);
    }
  }

  private async readPendingIds(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(PENDING_PROMPT_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      // Legacy format (a bare timestamp) — treat it as one unknown press.
      return [`${REMINDER_ID_PREFIX}unknown`];
    }
  }

  /**
   * True when this launch came from a reminder press, or one is queued for
   * replay. Unlike `consumePendingHydrationPrompts` it clears nothing, so the
   * splash screen can use it to shorten the intro without stealing the event
   * from the chat.
   *
   * The cold-start notification is moved into the replay queue on the way
   * past: `getInitialNotification()` is only guaranteed to answer once, and
   * the queue is deduped by event id, so this is safe to call repeatedly.
   */
  async hasPendingHydrationPrompt(): Promise<boolean> {
    try {
      const initial = await notifee.getInitialNotification();
      if (initial?.notification?.data?.type === HYDRATION_REMINDER_TYPE) {
        // A cold start *is* a press; record it here rather than adding another
        // `getInitialNotification()` caller, which is only guaranteed to
        // answer once.
        await NotificationHistory.recordPress(initial.notification);
        await this.markHydrationPromptPending(readReminderEventId(initial.notification));
        return true;
      }
    } catch (error) {
      console.error('[Reminders] Failed to read initial notification:', error);
    }

    return (await this.readPendingIds()).length > 0;
  }

  /**
   * Event ids for reminder presses waiting to be handled — from a cold start
   * and/or from presses received while backgrounded. Duplicate delivery of the
   * same press yields the same id, which the prompt session then collapses.
   */
  async consumePendingHydrationPrompts(): Promise<string[]> {
    const pending = new Set<string>();

    try {
      const initial = await notifee.getInitialNotification();
      if (initial?.notification?.data?.type === HYDRATION_REMINDER_TYPE) {
        await NotificationHistory.recordPress(initial.notification);
        pending.add(readReminderEventId(initial.notification));
      }
    } catch (error) {
      console.error('[Reminders] Failed to read initial notification:', error);
    }

    try {
      const queued = await this.readPendingIds();
      queued.forEach(id => pending.add(id));
      if (queued.length) await AsyncStorage.removeItem(PENDING_PROMPT_KEY);
    } catch (error) {
      console.error('[Reminders] Failed to read pending prompt:', error);
    }

    return [...pending];
  }

  async cancelAllNotifications() {
    await notifee.cancelAllNotifications();
  }
}

export default new NotificationService();
