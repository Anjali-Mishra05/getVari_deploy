import notifee, {
  AlarmType,
  AndroidImportance,
  AndroidNotificationSetting,
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
import { Platform } from 'react-native';

import NotificationHistory from './NotificationHistory';
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
const REMINDER_CHANNEL_ID = 'hydration-reminders-v2';
/** Retired ids, deleted on startup so they don't linger in system settings. */
const LEGACY_CHANNEL_IDS = ['hydration-reminders'];
const REMINDER_ID_PREFIX = 'hydration-reminder-';
const PENDING_PROMPT_KEY = 'getvari_pending_hydration_prompt';
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
      importance: AndroidImportance.HIGH,
      // A reminder the user cannot hear is not a reminder. Without these the
      // channel is created silent, which is how every nudge so far arrived.
      sound: 'default',
      vibration: true,
      vibrationPattern: [300, 500],
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
      android: {
        channelId,
        pressAction: {
          id: 'default',
        },
      },
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
          // At a 2-hour cadence Android's ~5-minute batching grid is noise, so
          // the ordinary exact-and-allow-while-idle alarm is enough — it still
          // fires in Doze, and it does not put the system "next alarm" icon in
          // the status bar the way `SET_ALARM_CLOCK` does. (That heavier alarm
          // type was here because the interval used to be 2 minutes, which
          // nothing weaker could hold.)
          alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
        };

        await notifee.createTriggerNotification(
          {
            id: `${REMINDER_ID_PREFIX}${slot}`,
            title: REMINDER_TITLE,
            body: REMINDER_BODY,
            // The scheduled timestamp makes the id unique per reminder while
            // staying identical across every delivery of the same press.
            data: {
              type: HYDRATION_REMINDER_TYPE,
              eventId: `${REMINDER_ID_PREFIX}${slot}@${timestamp}`,
            },
            android: {
              channelId: REMINDER_CHANNEL_ID,
              importance: AndroidImportance.HIGH,
              pressAction: { id: 'open-hydration-chat', launchActivity: 'default' },
            },
          },
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
              android: {
                channelId: REMINDER_CHANNEL_ID,
                importance: AndroidImportance.DEFAULT,
                pressAction: { id: 'default', launchActivity: 'default' },
              },
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
        await NotificationHistory.recordDelivery(
          entry.notification,
          Number.isFinite(shownAt) ? shownAt : Date.now()
        );
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
