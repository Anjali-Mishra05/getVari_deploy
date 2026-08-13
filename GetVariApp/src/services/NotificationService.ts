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
/** Cap on replayable background presses, so the queue cannot grow unbounded. */
const PENDING_PROMPT_LIMIT = 10;

/** Reminders repeat every 2 minutes while the user has nothing logged. */
export const REMINDER_INTERVAL_MS = 2 * 60 * 1000;

/**
 * How far ahead reminders are queued.
 *
 * Notifee has no sub-15-minute repeating trigger, so the cadence is built from
 * one-shot alarms and the queue is only as long as this window. Rescheduling
 * happens when the app is foregrounded or an entry is logged — neither of
 * which is guaranteed to happen for hours — so the window has to outlast a
 * long absence or reminders simply stop. Two hours of coverage is well inside
 * Android's 500-alarm-per-app ceiling.
 */
export const REMINDER_COVERAGE_MS = 2 * 60 * 60 * 1000;
const REMINDER_SLOTS = Math.floor(REMINDER_COVERAGE_MS / REMINDER_INTERVAL_MS);

/** Marks a notification as the "you haven't logged water" nudge. */
export const HYDRATION_REMINDER_TYPE = 'hydration_reminder';

const REMINDER_TITLE = '💧 Log your water';
const REMINDER_BODIES = [
  'No water logged yet. Tap to log.',
  'Still nothing logged. Tap to add it.',
  'Missed an entry? Tap to log it.',
];

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

  /**
   * Request permission for Android 13+ and iOS.
   */
  async requestPermission(): Promise<boolean> {
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
    kind: NotificationKind = 'local'
  ) {
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

  /**
   * Specific helper for the welcome notification.
   */
  async showWelcomeNotification() {
    await this.displayNotification(
      '🎉 Welcome to GetVari!',
      "We're happy to have you here! 💙\nRemember to stay hydrated and don't forget to drink water throughout your day."
    );
  }

  /* ------------------------------------------------------------------ *
   * Repeating "why haven't you logged?" reminders
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
   */
  async scheduleHydrationReminders(fromMs: number = Date.now()): Promise<void> {
    this.schedulingQueue = this.schedulingQueue.then(() => this.rescheduleReminders(fromMs));
    return this.schedulingQueue;
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

      for (let slot = 1; slot <= REMINDER_SLOTS; slot++) {
        const timestamp = fromMs + slot * REMINDER_INTERVAL_MS;
        if (timestamp <= Date.now()) continue;

        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp,
          // `SET_ALARM_CLOCK` is the only alarm type that actually holds a
          // 2-minute cadence here.
          //
          // This was `SET_EXACT_AND_ALLOW_WHILE_IDLE`, which is the textbook
          // choice and which the OS confirms this app is entitled to
          // (`dumpsys alarm` reports `exactAllowReason=policy_permission` via
          // the `USE_EXACT_ALARM` permission). The alarms still came back
          // without `FLAG_STANDALONE` and carrying a batching window that grew
          // to minutes, so every reminder landed on Android's ~5-minute
          // inexact grid with two or three collapsed onto the same instant.
          // Exempting the app from Doze changed nothing.
          //
          // `setAlarmClock` is the API alarm-clock apps use. It is treated as
          // user-visible and is not deferred or batched, which is what makes
          // an interval this short survive. The cost is that Android may show
          // a "next alarm" indicator — the trade the cadence is worth.
          alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
        };

        await notifee.createTriggerNotification(
          {
            id: `${REMINDER_ID_PREFIX}${slot}`,
            title: REMINDER_TITLE,
            body: REMINDER_BODIES[(slot - 1) % REMINDER_BODIES.length],
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
        `[Reminders] Queued ${REMINDER_SLOTS} reminders, ${REMINDER_INTERVAL_MS / 60000} min apart.`
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
