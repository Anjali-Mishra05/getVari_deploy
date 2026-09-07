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
import {
  DEFAULT_SLEEP_SCHEDULE,
  SleepSchedule,
  isAsleepAt,
  nextAwakeAt,
  normaliseSleepSchedule,
  describeSleepWindow,
} from '../utils/sleepWindow';
import type { NotificationKind } from '../types';

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
/** Cap on replayable background presses, so the queue cannot grow unbounded. */
const PENDING_PROMPT_LIMIT = 10;

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

/** Marks one of the fixed-time daily messages (N22 in the spec). */
export const DAILY_MESSAGE_TYPE = 'daily_message';
const DAILY_ID_PREFIX = 'getvari-daily-';

/**
 * The notifications the spec pins to a wall-clock time rather than to a
 * condition: "Morning: 7 AM / Night: 10 PM".
 *
 * These are queued with the OS, not raised by `NotificationEngine`. The engine
 * only runs while the dashboard is mounted, so a greeting it owned arrived
 * whenever the app was next opened — which is exactly how every notification
 * ended up landing in one clump on launch.
 */
const DAILY_MESSAGES = [
  {
    key: 'morning',
    hour: 7,
    minute: 0,
    title: '🌅 Good Morning',
    body: 'Good morning! Start your day with a glass of water and stay hydrated throughout the day.',
  },
  {
    key: 'night',
    hour: 22,
    minute: 0,
    title: '🌙 Bedtime',
    body: 'It’s almost bedtime. Keep up your hydration.',
  },
] as const;

/** How many days of fixed-time messages are queued ahead. */
export const DAILY_HORIZON_DAYS = 7;

/**
 * N1's title and message, verbatim from the notification spec.
 *
 * The earlier "Log your water / Still nothing logged / Missed an entry?"
 * variations were a testing nudge rather than a notification the spec asks
 * for, and are gone with the 2-minute cadence they were written for. Tapping
 * this still opens the logging conversation — that is the press action, not a
 * second kind of notification.
 */
const REMINDER_TITLE = '💧 Hydration';
const REMINDER_BODY = 'Time to hydrate! Please drink some water to stay hydrated.';

/** Makes each locally displayed notification's event id unique. */
let displayCounter = 0;

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
const reminderNotification = ({ id, eventId }: { id: string; eventId: string }): Notification => {
  const primary = primaryQuickAmount();

  return {
    id,
    title: REMINDER_TITLE,
    body: REMINDER_BODY,
    data: {
      type: HYDRATION_REMINDER_TYPE,
      eventId,
      // Carried on the notification so a background action press knows what
      // "Log" meant without having to read the config it may not have loaded.
      primaryMl: String(primary.ml),
    },
    android: {
      ...androidOptions(REMINDER_CHANNEL_ID, REMINDER_BODY, {
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
  private pending: Record<'reminders' | 'daily', { run: Promise<void>; fromMs: number } | null> = {
    reminders: null,
    daily: null,
  };

  /**
   * Queue `task`, collapsing it into an identical one that is already waiting.
   */
  private enqueue(
    kind: 'reminders' | 'daily',
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
   */
  async setSleepSchedule(schedule: SleepSchedule | null | undefined): Promise<void> {
    const normalised = schedule ? normaliseSleepSchedule(schedule) : null;
    const changed = JSON.stringify(normalised) !== JSON.stringify(this.sleepSchedule ?? null);
    this.sleepSchedule = normalised;

    try {
      if (normalised) {
        await AsyncStorage.setItem(SLEEP_SCHEDULE_KEY, JSON.stringify(normalised));
      } else {
        await AsyncStorage.removeItem(SLEEP_SCHEDULE_KEY);
      }
    } catch (error) {
      console.error('[Reminders] Failed to persist sleep window:', error);
    }

    if (!changed) return;
    console.log(
      '[Reminders] Sleep window set to',
      normalised ? describeSleepWindow(normalised) : 'none'
    );
    // The queue in the OS was built against the previous window.
    await this.scheduleHydrationReminders();
    await this.scheduleDailyNotifications();
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
    const messaging = getMessaging();

    // 1. Handle background messages
    setBackgroundMessageHandler(messaging, async remoteMessage => {
      console.log('Message handled in the background!', remoteMessage);
    });

    // 2. Handle foreground messages
    onMessage(messaging, async remoteMessage => {
      console.log('A new FCM message arrived!', JSON.stringify(remoteMessage));

      // Display a local notification using Notifee
      if (remoteMessage.notification) {
        await this.displayNotification(
          remoteMessage.notification.title || 'Notification',
          remoteMessage.notification.body || '',
          REMINDER_CHANNEL_ID,
          'push'
        );
      }
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
    options: { ignoreSleepWindow?: boolean } = {}
  ) {
    // The whole app goes quiet during the user's sleep window, push messages
    // included — a nudge that wakes someone up costs more than it earns. Only
    // a caller that explicitly opts out gets through.
    if (!options.ignoreSleepWindow && (await this.isSleeping())) {
      console.log('[Notifications] Suppressed during sleep window:', title);
      return;
    }

    // Ensure permission is granted
    const hasPermission = await this.requestPermission();
    if (!hasPermission) return;

    // Ensure channel exists
    await this.createNotificationChannel();

    // Display the notification
    await notifee.displayNotification({
      title,
      body,
      data: {
        type: kind,
        eventId: `${kind}:${Date.now()}:${(displayCounter++).toString(36)}`,
      },
      android: androidOptions(channelId, body),
    });
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
      await this.cancelDailyNotifications();

      const schedule = await this.getSleepSchedule();
      let queued = 0;

      for (let day = 0; day < DAILY_HORIZON_DAYS; day++) {
        for (const message of DAILY_MESSAGES) {
          const at = new Date(fromMs);
          at.setDate(at.getDate() + day);
          at.setHours(message.hour, message.minute, 0, 0);
          const timestamp = at.getTime();

          if (timestamp <= Date.now()) continue;
          // N14: routine notifications stay silent inside the quiet window.
          // These are dropped rather than shifted — a "good morning" delivered
          // at bedtime is worse than no greeting at all.
          if (isAsleepAt(schedule, timestamp)) continue;

          const id = `${DAILY_ID_PREFIX}${message.key}-${day}`;
          await notifee.createTriggerNotification(
            {
              id,
              title: message.title,
              body: message.body,
              data: {
                type: DAILY_MESSAGE_TYPE,
                key: message.key,
                eventId: `${id}@${timestamp}`,
              },
              android: androidOptions(REMINDER_CHANNEL_ID, message.body, {
                importance: AndroidImportance.DEFAULT,
                summary: message.title,
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
        NotificationHistory.recordDelivery(detail.notification);
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
      for (const entry of displayed) {
        const shownAt = entry.date ? Date.parse(entry.date) : NaN;
        const deliveredAt = Number.isFinite(shownAt) ? shownAt : Date.now();
        await NotificationHistory.recordDelivery(entry.notification, deliveredAt);

        // A reminder still sitting in the tray is a reminder nobody has
        // answered. The delivery event that would have recorded it may never
        // have reached JS — a headless task Android skipped under memory
        // pressure, or a phone that was simply off — so the tray itself is the
        // last reliable place to notice it.
        if (entry.notification?.data?.type === HYDRATION_REMINDER_TYPE) {
          await ActiveReminder.raise(readReminderEventId(entry.notification), deliveredAt);
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
