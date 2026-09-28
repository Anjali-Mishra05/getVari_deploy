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

import ActiveReminder from './ActiveReminder';
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

export interface SimulatedSlot {
  hour: number;
  minute: number;
  trigger: NotificationTrigger;
  type: string;
}

export const SIMULATED_SCHEDULE_SLOTS: SimulatedSlot[] = [
  { hour: 9, minute: 0, trigger: 'regular_reminder', type: HYDRATION_REMINDER_TYPE },
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

/**
 * Single source of truth for Excel simulated clock-time notification schedule relative gaps.
 */
export const SIMULATED_TEMPLATE_GAPS = [
  60,  // GM -> Slot 1 (Hydration)
  120, // Slot 1 -> Slot 2 (Elevated Risk)
  30,  // Slot 2 -> Slot 3 (Risk Improved)
  60,  // Slot 3 -> Slot 4 (Focus Alert)
  120, // Slot 4 -> Slot 5 (Priority Alert)
  90,  // Slot 5 -> Slot 6 (Focus Alert)
  60,  // Slot 6 -> Slot 7 (Hydration)
  90,  // Slot 7 -> Slot 8 (Priority Alert)
  90,  // Slot 8 -> Slot 9 (Elevated Risk)
  30,  // Slot 9 -> Slot 10 (Risk Improved)
  120, // Slot 10 -> Slot 11 (Hydration)
];

export interface ScheduledSimulatedSlot {
  slotIndex: number;
  trigger: NotificationTrigger;
  type: string;
  timestamp: number;
}

/**
 * Dynamically calculates the 11 simulated notifications relative to user's GM (wake + 1h) and GN (sleep - 1h).
 * Ensures Slot 11 <= GN - 30 minutes so GN is at least 30m after Slot 11.
 * Detects impossible short windows (< 360m) rather than violating spacing rules.
 */
export function calculateDailySimulatedSchedule(
  sleepSchedule: SleepSchedule = DEFAULT_SLEEP_SCHEDULE,
  date: Date = new Date()
): ScheduledSimulatedSlot[] {
  const wakeAnchor = parseClock(sleepSchedule.wakeUp) ?? parseClock(DEFAULT_SLEEP_SCHEDULE.wakeUp)!;
  const sleepAnchor = parseClock(sleepSchedule.sleepStart) ?? parseClock(DEFAULT_SLEEP_SCHEDULE.sleepStart)!;

  const gmMinute = ((wakeAnchor + DAILY_MESSAGE_OFFSET_MIN) % 1440 + 1440) % 1440;
  const gnMinute = ((sleepAnchor - DAILY_MESSAGE_OFFSET_MIN) % 1440 + 1440) % 1440;

  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  const gmDate = new Date(year, month, day, Math.floor(gmMinute / 60), gmMinute % 60, 0, 0);
  let gnDate = new Date(year, month, day, Math.floor(gnMinute / 60), gnMinute % 60, 0, 0);

  if (gnDate.getTime() <= gmDate.getTime()) {
    gnDate.setDate(gnDate.getDate() + 1);
  }

  const windowDurationMins = (gnDate.getTime() - gmDate.getTime()) / 60000;

  // Impossible window check: 12 gaps of 30m require at least 360 minutes
  if (windowDurationMins < 360) {
    console.error(
      `[Simulated] Impossible window: GM->GN duration (${windowDurationMins}m) < 360m minimum requirement for 30m spacing.`
    );
    return [];
  }

  // Target maximum duration for the 11 simulated gaps is W - 30m (so GN is >= 30m after Slot 11)
  const targetMaxDurationMins = windowDurationMins - 30;
  let gaps = [...SIMULATED_TEMPLATE_GAPS];
  const templateTotalMins = gaps.reduce((a, b) => a + b, 0); // 870

  if (targetMaxDurationMins < templateTotalMins) {
    const k = targetMaxDurationMins / templateTotalMins;
    gaps = gaps.map(g => Math.max(30, Math.floor(g * k)));
    let sum = gaps.reduce((a, b) => a + b, 0);
    let i = gaps.length - 1;
    while (sum > targetMaxDurationMins && i >= 0) {
      const excess = sum - targetMaxDurationMins;
      const reducible = gaps[i] - 30;
      if (reducible > 0) {
        const delta = Math.min(excess, reducible);
        gaps[i] -= delta;
        sum -= delta;
      }
      i--;
    }
  }

  let currentMs = gmDate.getTime();
  const scheduled: ScheduledSimulatedSlot[] = [];

  for (let idx = 0; idx < SIMULATED_SCHEDULE_SLOTS.length; idx++) {
    currentMs += gaps[idx] * 60000;
    scheduled.push({
      slotIndex: idx + 1,
      trigger: SIMULATED_SCHEDULE_SLOTS[idx].trigger,
      type: SIMULATED_SCHEDULE_SLOTS[idx].type,
      timestamp: currentMs,
    });
  }

  return scheduled;
}

/**
 * How far the daily messages sit from the edges of the user's sleep window.
 *
 * The greeting lands an hour *after* wake-up and the wind-down an hour
 * *before* bedtime, so neither is the first or last thing that happens to the
 * user — a "good morning" at the moment the alarm goes off is noise, and a
 * "keep up your hydration" as someone is falling asleep is worse.
 */
const DAILY_MESSAGE_OFFSET_MIN = 60;

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
    /** Offset from wake-up, in minutes. Positive is after. */
    anchor: 'wake' as const,
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
    key: 'night',
    /** Offset from bedtime, in minutes. Positive is before. */
    anchor: 'sleep' as const,
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
  const shifted = message.anchor === 'wake' ? base + DAILY_MESSAGE_OFFSET_MIN : base - DAILY_MESSAGE_OFFSET_MIN;
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
  // A white-on-transparent silhouette of the logo. Without one Android falls
  // back to the launcher icon, which is now an adaptive icon — not a valid
  // notification icon — and some phones draw a warning "!" in its place.
  smallIcon: 'ic_stat_notification',
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
}: {
  id: string;
  eventId: string;
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

  /** Whether the user has already been shown the prompt this session. */
  private permissionAsked = false;

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
   * Cache the recipient used by the Excel copy before one-shot alarms are
   * built. Alarm payloads are immutable, so this is intentionally done at
   * scheduling time rather than by rewriting a notification after delivery.
   */
  async setNotificationRecipient(fullName?: string | null): Promise<void> {
    const next = fullName?.trim() || undefined;
    notificationRecipient = next;
    try {
      if (next) await AsyncStorage.setItem(NOTIFICATION_RECIPIENT_KEY, next);
      else await AsyncStorage.removeItem(NOTIFICATION_RECIPIENT_KEY);
    } catch (error) {
      console.error('[Notifications] Failed to persist notification recipient:', error);
    }
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
    const normalised = schedule ? normaliseSleepSchedule(schedule) : null;
    if (!normalised) {
      console.log('[Reminders] No sleep window in this profile; keeping the stored one.');
      return;
    }

    const changed = JSON.stringify(normalised) !== JSON.stringify(this.sleepSchedule ?? null);
    this.sleepSchedule = normalised;

    try {
      await AsyncStorage.setItem(SLEEP_SCHEDULE_KEY, JSON.stringify(normalised));
    } catch (error) {
      console.error('[Reminders] Failed to persist sleep window:', error);
    }

    if (!changed) return;
    console.log('[Reminders] Sleep window set to', describeSleepWindow(normalised));
    // The queue in the OS was built against the previous window.
    await this.scheduleHydrationReminders();
    await this.scheduleDailyNotifications();
    await this.scheduleSimulatedNotifications();
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
    const events = await this.getProcessedEvents();
    const baseId = eventId.includes('@') ? eventId.split('@')[0] : '';
    return events.has(eventId) || (baseId ? events.has(baseId) : false);
  }

  async markEventProcessed(eventId: string): Promise<void> {
    if (!eventId || eventId.includes('unknown')) return;
    const events = await this.getProcessedEvents();
    events.add(eventId);
    if (eventId.includes('@')) {
      const baseId = eventId.split('@')[0];
      if (baseId) events.add(baseId);
    }
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
   * Whether the app may post notifications, asking the user at most once.
   *
   * This used to call `notifee.requestPermission()` every time — and it is
   * called from the engine's evaluation, which runs on every telemetry tick.
   * On Android each of those spins up the system `GrantPermissionsActivity`;
   * with the permission already granted it closes again without drawing
   * anything, but it still takes focus for a moment. Twice a second that is
   * enough to restart the keyboard mid-word, blank the screen between frames
   * and fire an app-state change — the "unstable keyboard" in the chat, and a
   * flood of foreground events behind it.
   *
   * So: read the current setting, which is a plain query with no dialog, and
   * only ever put the prompt in front of the user once per session.
   */
  async requestPermission(): Promise<boolean> {
    try {
      const current = await notifee.getNotificationSettings();
      if (current.authorizationStatus >= AuthorizationStatus.AUTHORIZED) return true;
    } catch (error) {
      console.warn('[Notifications] Could not read permission state:', error);
    }

    // Not granted. Ask — but only the first time, so a user who has said no is
    // not asked again on every tick for the rest of the session.
    if (this.permissionAsked) return false;
    this.permissionAsked = true;

    const settings = await notifee.requestPermission();
    return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
  }

  /**
   * Whether notifications are allowed, without ever showing the dialog.
   *
   * `requestPermission` prompts, and prompts exactly once per session, so it
   * cannot answer "is this still granted?" — which is the question the
   * permission gate asks on every resume, including after the user revoked
   * the permission from App info and came back.
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
   * Shows the system permission dialog, however many times it is called.
   *
   * The session-once rule in `requestPermission` exists to stop a per-tick
   * caller re-prompting; on the gate the prompt is the user pressing a button
   * that says "Allow", and swallowing it would leave the button doing nothing.
   * Android still only shows the dialog while it is willing to — after two
   * refusals it returns immediately, which is why the gate always offers the
   * settings page as well.
   */
  async promptForNotificationPermission(): Promise<boolean> {
    try {
      const settings = await notifee.requestPermission();
      this.permissionAsked = true;
      return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
    } catch (error) {
      console.error('[Notifications] Permission request failed:', error);
      return false;
    }
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
    options: { ignoreSleepWindow?: boolean; allowRepeat?: boolean; notificationKey?: string } = {}
  ): Promise<boolean> {
    return this.withDeliveryLock(async () => {
      // The whole app goes quiet during the user's sleep window, push messages
      // included — a nudge that wakes someone up costs more than it earns.
      if (!options.ignoreSleepWindow && (await this.isSleeping())) {
        console.log('[Notifications] Suppressed during sleep window:', title);
        return false;
      }

      const hasPermission = await this.requestPermission();
      if (!hasPermission) return false;

      const notificationKey = normalizeNotificationKey(options.notificationKey ?? title);
      // `allowRepeat` is for a newly earned welcome. It skips only the
      // same-type hour gate; the cross-notification 30-minute interruption
      // gap remains mandatory.
      if (!(await this.canDeliverNow(notificationKey, options.allowRepeat === true))) {
        console.log('[Notifications] Suppressed by delivery spacing:', title);
        return false;
      }

      await this.createNotificationChannel();
      const eventId = `${kind}:${Date.now()}:${(displayCounter++).toString(36)}`;
      await notifee.displayNotification({
        id: `shown:${notificationKey}:${eventId}`,
        title,
        body,
        data: { type: kind, notificationKey, deliveryAccepted: '1', eventId },
        android: androidOptions(channelId, body),
      });

      // Recorded only after the native post succeeds, while the lock is held.
      await this.markEventProcessed(eventId);
      await this.noteNotificationShown();
      await this.noteDeliveredType(notificationKey);
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
      const delivered = await this.showWelcomeNotification();
      if (delivered) await AsyncStorage.removeItem(PENDING_WELCOME_KEY);
    } catch (error) {
      console.error('[Notifications] Pending welcome failed:', error);
    }
  }

  /**
   * The welcome greeting itself. Goes through `displayNotification`, so it
   * respects the sleep window and the notification permission (asking for it
   * if needed).
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
        // quick log out and back in was swallowed as a "duplicate".
        { allowRepeat: true, notificationKey: 'welcome' }
      );
    } catch (error) {
      console.error('[Notifications] Welcome notification failed:', error);
      return false;
    }
  }

  private async canDeliverNow(rawKey: string, allowSameTypeRepeat = false): Promise<boolean> {
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
      if (lastGlobalAt > 0 && now - lastGlobalAt < GLOBAL_DELIVERY_GAP_MS) {
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

  async acceptScheduledDelivery(notification: Notification): Promise<boolean> {
    return this.withDeliveryLock(async () => {
      const rawKey = String(
        notification.data?.notificationKey ??
          notification.data?.key ??
          notification.data?.type ??
          notification.title ??
          'notification'
      );
      const notificationKey = normalizeNotificationKey(rawKey);
      const eventId = readReminderEventId(notification);

      if (await this.isEventAlreadyProcessed(eventId)) return true;
      if (await this.isSleeping()) return false;

      const canDeliver = await this.canDeliverNow(notificationKey);
      if (!canDeliver) {
        // Do NOT drop scheduled notifications blocked by gap limits.
        // Reschedule to the next valid available time within GM->GN.
        await this.rescheduleBlockedNotification(notification);
        return false;
      }

      await this.markEventProcessed(eventId);
      await this.noteNotificationShown();
      await this.noteDeliveredType(notificationKey);
      return true;
    });
  }

  private async rescheduleBlockedNotification(notification: Notification): Promise<boolean> {
    try {
      const rawKey = String(
        notification.data?.notificationKey ??
          notification.data?.key ??
          notification.data?.type ??
          notification.title ??
          'notification'
      );
      const notificationKey = normalizeNotificationKey(rawKey);
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
      let nextAvailableMs = Math.max(
        now + GLOBAL_DELIVERY_GAP_MS,
        lastGlobalAt + GLOBAL_DELIVERY_GAP_MS,
        typeLastAt + SAME_TYPE_DELIVERY_GAP_MS
      );

      const schedule = await this.getSleepSchedule();
      const wakeAnchor = parseClock(schedule.wakeUp) ?? parseClock(DEFAULT_SLEEP_SCHEDULE.wakeUp)!;
      const sleepAnchor = parseClock(schedule.sleepStart) ?? parseClock(DEFAULT_SLEEP_SCHEDULE.sleepStart)!;

      const gnMinute = ((sleepAnchor - DAILY_MESSAGE_OFFSET_MIN) % 1440 + 1440) % 1440;
      const targetDate = new Date(nextAvailableMs);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      const day = targetDate.getDate();

      let gnDate = new Date(year, month, day, Math.floor(gnMinute / 60), gnMinute % 60, 0, 0);
      const gmMinute = ((wakeAnchor + DAILY_MESSAGE_OFFSET_MIN) % 1440 + 1440) % 1440;
      const gmDate = new Date(year, month, day, Math.floor(gmMinute / 60), gmMinute % 60, 0, 0);

      if (gnDate.getTime() <= gmDate.getTime()) {
        gnDate.setDate(gnDate.getDate() + 1);
      }

      const gnLimitMs = gnDate.getTime() - 30 * 60 * 1000;

      if (nextAvailableMs > gnLimitMs) {
        console.warn(`[Notifications] Cannot reschedule blocked notification ${notificationKey}: exceeds GN limit. Marking missed.`);
        const eventId = readReminderEventId(notification);
        await this.markEventProcessed(eventId);
        return false;
      }

      const sleepStartMinute = parseClock(schedule.sleepStart) ?? 23 * 60;
      const wakeUpMinute = parseClock(schedule.wakeUp) ?? 7 * 60;
      const currentMin = targetDate.getHours() * 60 + targetDate.getMinutes();
      const isAsleep = sleepStartMinute > wakeUpMinute
        ? currentMin >= sleepStartMinute || currentMin < wakeUpMinute
        : currentMin >= sleepStartMinute && currentMin < wakeUpMinute;

      if (isAsleep) {
        console.warn(`[Notifications] Cannot reschedule blocked notification ${notificationKey}: falls in sleep window. Marking missed.`);
        const eventId = readReminderEventId(notification);
        await this.markEventProcessed(eventId);
        return false;
      }

      const rawEventId = readReminderEventId(notification);
      const originalEventId = rawEventId.includes('@') ? rawEventId.split('@')[0] : rawEventId;
      const nextId = `${notification.id ?? 'rescheduled'}-shift-${Date.now()}`;
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
          },
          android: notification.android,
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: nextAvailableMs,
          alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
        } satisfies TimestampTrigger
      );

      console.log(`[Notifications] Rescheduled blocked notification ${notificationKey} to ${new Date(nextAvailableMs).toLocaleTimeString()}`);
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
  async scheduleHydrationReminders(fromMs: number = Date.now()): Promise<void> {
    return this.enqueue('reminders', fromMs, at => this.rescheduleReminders(at));
  }

  private async rescheduleReminders(fromMs: number): Promise<void> {
    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        console.warn('[Reminders] Notification permission denied; skipping schedule.');
        return;
      }

      await this.createNotificationChannel();
      await this.getNotificationRecipient();
      // Log whatever is in the tray *before* clearing it. Reminders delivered
      // while the app was killed may never have reached JS as an event, and
      // the cancel below is the last moment they can still be observed.
      await this.syncDeliveredFromTray();
      await this.cancelHydrationReminders();

      const schedule = await this.getSleepSchedule();

      // Slots are walked with a cursor rather than computed from `fromMs`,
      // because a slot landing inside the sleep window is *moved to the
      // wake-up time*, not dropped. That matters more than it sounds: the
      // queue only covers a couple of hours, so simply skipping the night
      // would leave nothing queued at all by the time the user woke up, and
      // reminders would stay dead until they next opened the app.
      let cursor = fromMs;
      let sleepShifted = false;

      for (let slot = 1; slot <= REMINDER_SLOTS; slot++) {
        cursor += REMINDER_INTERVAL_MS;
        const awakeAt = nextAwakeAt(schedule, cursor);
        if (awakeAt !== cursor) {
          sleepShifted = true;
          cursor = awakeAt + REMINDER_RESUME_OFFSET_MS;
        } else {
          cursor = awakeAt;
        }

        /**
         * Keep the cadence off the fixed-time messages.
         *
         * Applied after the sleep shift and re-checked against the window
         * afterwards, because the push is forward in time and could in
         * principle walk a slot into the evening quiet hours — at which point
         * the shift has to run again to move it to morning. Two passes settle
         * it: the second shift lands at wake-up, and wake-up is already clear
         * of a message by `REMINDER_RESUME_OFFSET_MS`.
         */
        const clearOfMessages = clearOfDailyMessages(cursor, schedule);
        if (clearOfMessages !== cursor) {
          cursor = clearOfMessages;
          const reAwakeAt = nextAwakeAt(schedule, cursor);
          if (reAwakeAt !== cursor) {
            sleepShifted = true;
            cursor = reAwakeAt + REMINDER_RESUME_OFFSET_MS;
          }
        }

        const timestamp = cursor;
        if (timestamp <= Date.now()) continue;

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

        await notifee.createTriggerNotification(
          reminderNotification({
            id: `${REMINDER_ID_PREFIX}${slot}`,
            // The scheduled timestamp makes the id unique per reminder while
            // staying identical across every delivery of the same press.
            eventId: `${REMINDER_ID_PREFIX}${slot}@${timestamp}`,
            // Varied by slot, so a day of reminders that all fall back to the
            // generic line does not repeat one sentence twelve times. Indexed
            // by slot rather than picked at random because this queue is
            // rebuilt on every app open and every logged drink — a random pick
            // would rewrite a pending reminder's text repeatedly.
            body: buildNotificationContent('regular_reminder', notificationRecipient)?.body,
          }),
          trigger
        );
      }

      console.log(
        `[Reminders] Queued ${REMINDER_SLOTS} reminders, ${REMINDER_INTERVAL_MS / 3600000}h apart` +
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
      const queued = triggerIds.filter(id => id.startsWith(REMINDER_ID_PREFIX));
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
      const wakeAt = await ActiveReminder.dismissWithoutAnswer();
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
    const wakeAt = await ActiveReminder.snooze(minutes);
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
    if (await this.isSleeping(timestamp)) return false;

    const minutes = (timestamp - now) / 60000;
    return (await this.snoozeReminder(minutes)) !== null;
  }

  /** Queue the one-shot notification that re-raises a snoozed reminder. */
  private async queueSnoozeNudge(timestamp: number): Promise<void> {
    await this.createNotificationChannel();
    await this.cancelSnoozeNudge();

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

  /** Take reminder notifications out of the shade, leaving the queue alone. */
  private async clearDisplayedReminders(): Promise<void> {
    try {
      const displayed = await notifee.getDisplayedNotifications();
      const ids = displayed
        .map(entry => entry.id)
        .filter((id): id is string => !!id && (id.startsWith(REMINDER_ID_PREFIX) || id === SNOOZE_ID));
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

    let granted = true;
    try {
      const native = NativeModules.FullScreenReminderModule;
      if (native?.canUseFullScreenIntent) {
        granted = await native.canUseFullScreenIntent();
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
   *    is what fires, and `MainActivity.showOverLockScreen` brings it up over
   *    the keyguard. Launching again here would be a duplicate.
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
    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        console.warn('[Daily] Notification permission denied; skipping schedule.');
        return;
      }

      await this.createNotificationChannel();
      await this.getNotificationRecipient();
      await this.cancelDailyNotifications();

      const schedule = await this.getSleepSchedule();
      let queued = 0;

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

          const content = buildNotificationContent(
            message.key === 'morning' ? 'morning_msg' : 'night_msg',
            notificationRecipient
          );
          if (!content) continue;
          const body = content.body;

          const id = `${DAILY_ID_PREFIX}${message.key}-${day}`;
          await notifee.createTriggerNotification(
            {
              id,
              title: content.title,
              body,
              data: {
                type: DAILY_MESSAGE_TYPE,
                key: message.key,
                notificationKey: message.key === 'morning' ? 'morning_msg' : 'night_msg',
                eventId: `${id}@${timestamp}`,
              },
              android: androidOptions(REMINDER_CHANNEL_ID, body, {
                importance: AndroidImportance.DEFAULT,
                summary: content.title,
              }),
            },
            {
              type: TriggerType.TIMESTAMP,
              timestamp,
              alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
            } satisfies TimestampTrigger
          );
          queued++;
        }
      }

      console.log(`[Daily] Queued ${queued} fixed-time messages over ${DAILY_HORIZON_DAYS} days.`);
    } catch (error) {
      console.error('[Daily] Failed to schedule:', error);
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
   * Queue the 11 Excel simulated notifications for the next `DAILY_HORIZON_DAYS` days.
   *
   * Simulated notifications are placed within the user's awake window (between GM = wakeUp + 1h
   * and GN = sleepStart - 1h) using dynamic relative-gap compression. Rescheduling cancels
   * strictly simulated notification IDs.
   */
  async scheduleSimulatedNotifications(fromMs: number = Date.now()): Promise<void> {
    return this.enqueue('simulated', fromMs, at => this.rescheduleSimulated(at));
  }

  private async rescheduleSimulated(fromMs: number): Promise<void> {
    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        console.warn('[Simulated] Notification permission denied; skipping schedule.');
        return;
      }

      await this.createNotificationChannel();
      await this.getNotificationRecipient();
      await this.cancelSimulatedNotifications();

      const schedule = await this.getSleepSchedule();
      let queued = 0;

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

          const id = `${SIMULATED_ID_PREFIX}${slot.trigger}-${day}-${slot.slotIndex}`;
          await notifee.createTriggerNotification(
            {
              id,
              title: content.title,
              body,
              data: {
                type: slot.type,
                notificationKey: slot.trigger,
                eventId: `${id}@${timestamp}`,
              },
              android: androidOptions(REMINDER_CHANNEL_ID, body, {
                importance: slot.trigger === 'regular_reminder' ? AndroidImportance.HIGH : AndroidImportance.DEFAULT,
                summary: content.title,
              }),
            },
            {
              type: TriggerType.TIMESTAMP,
              timestamp,
              alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
            } satisfies TimestampTrigger
          );
          queued++;
        }
      }

      console.log(`[Simulated] Queued ${queued} simulated notifications over ${DAILY_HORIZON_DAYS} days.`);
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
