import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter, EmitterSubscription } from 'react-native';
import type { Notification } from '@notifee/react-native';

import type { NotificationKind, NotificationRecord } from '../types';

/**
 * The delivery log behind the bell icon.
 *
 * Notifications are recorded from wherever they are observed — the foreground
 * listener, the background/headless handler, or a sweep of the tray — and each
 * event carries the id that was baked into the notification when it was
 * created. Because every delivery path reports the *same* id for the same
 * notification, a press recorded minutes later (or in a different JS context,
 * after the app was killed) still lands on the row it belongs to instead of
 * creating a second one.
 *
 * Reads and writes go through a queue: a reminder firing while another is
 * being pressed would otherwise interleave two read-modify-write cycles over
 * one AsyncStorage key and lose an entry.
 */

const HISTORY_KEY = 'getvari_notification_history';
const SEEN_KEY = 'getvari_notification_history_seen_at';
const HISTORY_CHANGED_EVENT = 'getvari:notification-history-changed';

/** Entries kept, newest first. Older deliveries fall off the end. */
export const HISTORY_LIMIT = 100;

/** Serialises read-modify-write cycles within this JS context. */
let writeQueue: Promise<unknown> = Promise.resolve();

const serialise = <T>(task: () => Promise<T>): Promise<T> => {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => undefined);
  return run;
};

const isRecord = (value: any): boolean =>
  !!value &&
  typeof value.id === 'string' &&
  typeof value.deliveredAt === 'number' &&
  (value.pressedAt === null || typeof value.pressedAt === 'number');

/** Fills in fields added after a row was first written. */
const normalise = (value: any): NotificationRecord => ({
  ...value,
  supersededAt: typeof value.supersededAt === 'number' ? value.supersededAt : null,
});

const readAll = async (): Promise<NotificationRecord[]> => {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord).map(normalise) : [];
  } catch (error) {
    console.error('[Notifications] Failed to read history:', error);
    return [];
  }
};

/** Newest first, capped, then persisted. */
const writeAll = async (entries: NotificationRecord[]): Promise<NotificationRecord[]> => {
  const ordered = [...entries]
    .sort((a, b) => b.deliveredAt - a.deliveredAt)
    .slice(0, HISTORY_LIMIT);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(ordered));
  DeviceEventEmitter.emit(HISTORY_CHANGED_EVENT);
  return ordered;
};

const KNOWN_KINDS: NotificationKind[] = ['hydration_reminder', 'push', 'local'];

const readKind = (notification?: Notification | null): NotificationKind => {
  const type = notification?.data?.type;
  return KNOWN_KINDS.includes(type as NotificationKind) ? (type as NotificationKind) : 'local';
};

/**
 * Identity for one delivery.
 *
 * `eventId` is stamped onto every notification this app creates, so it is
 * almost always present. The fallbacks collapse rather than invent: a repeat
 * of the same notification id is folded into the existing row, which under-
 * counts deliveries but never shows a press against the wrong notification.
 */
export const readNotificationEventId = (notification?: Notification | null): string => {
  const fromData = notification?.data?.eventId;
  if (typeof fromData === 'string' && fromData) return fromData;
  if (notification?.id) return `notification:${notification.id}`;
  return 'notification:unknown';
};

/**
 * Reminder event ids end in `@<epoch ms>` — the instant the reminder was
 * scheduled for. When a press is seen for a delivery that was never recorded
 * (the app was killed and the headless handler did not run), that timestamp is
 * a far better "delivered at" than the moment the user happened to tap.
 */
const deliveredAtFromEventId = (eventId: string): number | null => {
  const at = eventId.lastIndexOf('@');
  if (at === -1) return null;
  const parsed = Number(eventId.slice(at + 1));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toRecord = (
  notification: Notification | null | undefined,
  deliveredAt: number
): NotificationRecord => ({
  id: readNotificationEventId(notification),
  title: notification?.title ?? 'Notification',
  body: notification?.body ?? '',
  kind: readKind(notification),
  deliveredAt,
  pressedAt: null,
  supersededAt: null,
});

/**
 * Opening one nudge answers every earlier nudge asking the same thing, so
 * those stop offering an action.
 *
 * Scoped to the same `kind`: tapping a hydration reminder says nothing about
 * an unrelated push notification sitting above it in the list. Entries
 * delivered at the same instant are left alone — only strictly older ones are
 * answered by this press.
 */
const supersedeOlder = (
  entries: NotificationRecord[],
  pivot: NotificationRecord,
  at: number
): NotificationRecord[] =>
  entries.map(entry =>
    entry.id !== pivot.id &&
    entry.kind === pivot.kind &&
    entry.deliveredAt < pivot.deliveredAt &&
    entry.pressedAt === null &&
    entry.supersededAt === null
      ? { ...entry, supersededAt: at }
      : entry
  );

/** True while the notification still has an action the user can take. */
export const isActionable = (record: NotificationRecord): boolean =>
  record.pressedAt === null && record.supersededAt === null;

export const NotificationHistory = {
  /**
   * Record that a notification was shown. Safe to call repeatedly for the same
   * delivery — the first record wins, so a tray sweep cannot overwrite a press
   * that was already captured.
   */
  async recordDelivery(
    notification: Notification | null | undefined,
    deliveredAt: number = Date.now()
  ): Promise<void> {
    return serialise(async () => {
      try {
        const entries = await readAll();
        const id = readNotificationEventId(notification);
        if (entries.some(entry => entry.id === id)) return;
        await writeAll([toRecord(notification, deliveredAt), ...entries]);
      } catch (error) {
        console.error('[Notifications] Failed to record delivery:', error);
      }
    });
  },

  /**
   * Record that the user tapped a notification. If the delivery was never
   * seen, the row is created here so the press is still visible in the log.
   */
  async recordPress(
    notification: Notification | null | undefined,
    pressedAt: number = Date.now()
  ): Promise<void> {
    return serialise(async () => {
      try {
        const entries = await readAll();
        const id = readNotificationEventId(notification);
        const existing = entries.find(entry => entry.id === id);

        if (existing) {
          // First tap wins: re-delivery of the same press through another
          // path must not move the recorded time.
          if (existing.pressedAt !== null) return;
          const opened = { ...existing, pressedAt };
          await writeAll(
            supersedeOlder(
              entries.map(entry => (entry.id === id ? opened : entry)),
              opened,
              pressedAt
            )
          );
          return;
        }

        const delivered = deliveredAtFromEventId(id) ?? pressedAt;
        const opened = { ...toRecord(notification, delivered), pressedAt };
        await writeAll(supersedeOlder([opened, ...entries], opened, pressedAt));
      } catch (error) {
        console.error('[Notifications] Failed to record press:', error);
      }
    });
  },

  /**
   * Records a tap made inside the bell menu rather than on the notification
   * itself. Unlike `recordPress` this never invents a row — the user can only
   * tap something already in the list.
   */
  async recordPressById(id: string, pressedAt: number = Date.now()): Promise<void> {
    return serialise(async () => {
      try {
        const entries = await readAll();
        const existing = entries.find(entry => entry.id === id);
        if (!existing || existing.pressedAt !== null) return;

        const opened = { ...existing, pressedAt };
        await writeAll(
          supersedeOlder(
            entries.map(entry => (entry.id === id ? opened : entry)),
            opened,
            pressedAt
          )
        );
      } catch (error) {
        console.error('[Notifications] Failed to record in-app press:', error);
      }
    });
  },

  /** Every recorded delivery, newest first. */
  async list(): Promise<NotificationRecord[]> {
    const entries = await readAll();
    return [...entries].sort((a, b) => b.deliveredAt - a.deliveredAt);
  },

  /**
   * How many notifications arrived since the bell was last opened. This is
   * deliberately *not* "how many are unopened": a reminder the user read in
   * the tray and dismissed is still old news, and would otherwise leave a
   * badge that nothing can clear.
   */
  async unseenCount(): Promise<number> {
    try {
      const [entries, raw] = await Promise.all([
        readAll(),
        AsyncStorage.getItem(SEEN_KEY),
      ]);
      const seenAt = Number(raw);
      if (!Number.isFinite(seenAt) || seenAt <= 0) return entries.length;
      return entries.filter(entry => entry.deliveredAt > seenAt).length;
    } catch (error) {
      console.error('[Notifications] Failed to count unseen:', error);
      return 0;
    }
  },

  /** Called when the bell menu is opened; clears the badge. */
  async markAllSeen(seenAt: number = Date.now()): Promise<void> {
    try {
      await AsyncStorage.setItem(SEEN_KEY, String(seenAt));
      DeviceEventEmitter.emit(HISTORY_CHANGED_EVENT);
    } catch (error) {
      console.error('[Notifications] Failed to mark history seen:', error);
    }
  },

  async clear(): Promise<void> {
    return serialise(async () => {
      try {
        await AsyncStorage.removeItem(HISTORY_KEY);
        DeviceEventEmitter.emit(HISTORY_CHANGED_EVENT);
      } catch (error) {
        console.error('[Notifications] Failed to clear history:', error);
      }
    });
  },

  /** Fires whenever the log changes, so an open list can re-read it. */
  onChange(listener: () => void): EmitterSubscription {
    return DeviceEventEmitter.addListener(HISTORY_CHANGED_EVENT, listener);
  },
};

export default NotificationHistory;
