import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The one reminder the user still owes an answer to.
 *
 * ## Why this exists
 *
 * A tray notification is a *moment*, and the app was treating it as one: the
 * press was replayed once, `HydrationPromptSession` latched to "resolved", and
 * the reminder was gone. Two everyday things fell through that:
 *
 *  1. **Open it, do nothing, come back later.** The press had already been
 *     consumed by the replay, so returning to the reminder found nothing to
 *     act on — the notification had gone "inactive".
 *  2. **Swipe it out of the shade.** Nothing recorded that a reminder had ever
 *     fired, so the only trace was the next one two hours later.
 *
 * So the outstanding reminder is state, not an event. It is written when a
 * reminder fires, it survives an app kill, and it is cleared by exactly one
 * thing: the user answering it (logging, or explicitly skipping). Snoozing
 * moves it, it does not clear it.
 *
 * ## Relationship to `HydrationPromptSession`
 *
 * That module answers "has this *press* already been delivered to me three
 * times by the OS?" — deduplication of one event. This one answers "is there
 * still something the user has not dealt with?" — a state that outlives every
 * delivery of it.
 */

const ACTIVE_REMINDER_KEY = 'getvari_active_reminder';

/** How long a swiped-away reminder waits before nudging again. */
export const DISMISS_SNOOZE_MS = 30 * 60 * 1000;

/** The snooze durations offered in the full-screen prompt, in minutes. */
export const SNOOZE_OPTIONS_MIN = [15, 30, 60] as const;

/**
 * A reminder stops being worth re-presenting once it is this old.
 *
 * Without a ceiling, a phone left in a drawer over a weekend would greet the
 * user with a popup about Friday lunchtime. The reminder cadence will have
 * produced a fresher one by then; this one is stale and is dropped silently.
 */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export type ReminderState = 'open' | 'snoozed';

export interface ActiveReminderRecord {
  /** The press/delivery id of the reminder that raised this. */
  eventId: string;
  /** Epoch ms the reminder was delivered. */
  firedAt: number;
  state: ReminderState;
  /** Epoch ms to re-present at. Only meaningful while `state` is 'snoozed'. */
  wakeAt?: number;
  /** How many times the user has pushed this same reminder back. */
  snoozeCount: number;
}

type Listener = (record: ActiveReminderRecord | null) => void;

let record: ActiveReminderRecord | null = null;
let hydration: Promise<void> | null = null;
const listeners = new Set<Listener>();

const notify = () => {
  for (const listener of listeners) {
    try {
      listener(record);
    } catch (error) {
      console.error('[ActiveReminder] Listener threw:', error);
    }
  }
};

const persist = async (): Promise<void> => {
  try {
    if (record) {
      await AsyncStorage.setItem(ACTIVE_REMINDER_KEY, JSON.stringify(record));
    } else {
      await AsyncStorage.removeItem(ACTIVE_REMINDER_KEY);
    }
  } catch (error) {
    console.error('[ActiveReminder] Failed to persist:', error);
  }
};

const isRecord = (value: any): value is ActiveReminderRecord =>
  !!value &&
  typeof value.eventId === 'string' &&
  Number.isFinite(value.firedAt) &&
  (value.state === 'open' || value.state === 'snoozed');

/** Reads the stored reminder once per app session. */
const hydrate = (): Promise<void> => {
  if (!hydration) {
    hydration = (async () => {
      try {
        const raw = await AsyncStorage.getItem(ACTIVE_REMINDER_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        // `snoozeCount` post-dates the first version of this record, so a
        // value stored before it existed reads back as undefined.
        record = isRecord(parsed) ? { ...parsed, snoozeCount: parsed.snoozeCount ?? 0 } : null;
      } catch (error) {
        console.error('[ActiveReminder] Failed to restore:', error);
        record = null;
      }
    })();
  }
  return hydration;
};

/**
 * Record that a reminder has fired and is awaiting an answer.
 *
 * A reminder that arrives while an older one is still outstanding *replaces*
 * it rather than queueing behind it: they ask the same question, and a user
 * who ignored three nudges should be shown one prompt, not three. The fired
 * time moves forward with the newest one, which is what keeps the staleness
 * check honest.
 */
const raise = async (eventId: string, firedAt: number = Date.now()): Promise<void> => {
  await hydrate();
  // A repeat delivery of the press we are already holding changes nothing.
  if (record?.eventId === eventId && record.state === 'open') return;

  record = { eventId, firedAt, state: 'open', snoozeCount: 0 };
  await persist();
  notify();
};

/**
 * Push the outstanding reminder back by `minutes`.
 *
 * Returns the wake-up time so the caller can queue the OS-level nudge to match.
 * Snoozing with nothing outstanding is a no-op that returns null — it can
 * happen when a snooze action is pressed on a notification whose state was
 * already cleared on another surface.
 */
const snooze = async (minutes: number, now: number = Date.now()): Promise<number | null> => {
  await hydrate();
  if (!record) return null;

  const wakeAt = now + minutes * 60 * 1000;
  record = { ...record, state: 'snoozed', wakeAt, snoozeCount: record.snoozeCount + 1 };
  await persist();
  notify();
  return wakeAt;
};

/**
 * The user swiped the notification out of the shade without answering.
 *
 * Deliberately *not* treated as an answer. Clearing the shade is how people
 * tidy their phone, not how they say "I have drunk water" — so it becomes a
 * short snooze, and the prompt is still there the next time the app opens.
 */
const dismissWithoutAnswer = async (now: number = Date.now()): Promise<number | null> =>
  snooze(DISMISS_SNOOZE_MS / 60000, now);

/** The user answered — logged an amount, or explicitly skipped this round. */
const resolve = async (): Promise<void> => {
  await hydrate();
  if (!record) return;
  record = null;
  await persist();
  notify();
};

/** The outstanding reminder, whatever its state. */
const current = async (): Promise<ActiveReminderRecord | null> => {
  await hydrate();
  return record;
};

/** Synchronous read of the last known value, for render paths. */
const peek = (): ActiveReminderRecord | null => record;

/**
 * The reminder that should be put in front of the user *right now*, or null.
 *
 * Null covers three different situations on purpose — nothing outstanding, a
 * snooze that has not expired, and a reminder too old to be worth raising —
 * because every caller does the same thing with all three: show no prompt.
 * A stale reminder is dropped here rather than lingering as state nothing
 * will ever clear.
 */
const due = async (now: number = Date.now()): Promise<ActiveReminderRecord | null> => {
  await hydrate();
  if (!record) return null;

  if (now - record.firedAt > STALE_AFTER_MS) {
    await resolve();
    return null;
  }

  if (record.state === 'snoozed' && (record.wakeAt ?? 0) > now) return null;
  return record;
};

const subscribe = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Test hook — clears in-memory state so runs stay independent. */
const __resetForTests = (): void => {
  record = null;
  hydration = null;
  listeners.clear();
};

export const ActiveReminder = {
  raise,
  snooze,
  dismissWithoutAnswer,
  resolve,
  current,
  peek,
  due,
  subscribe,
  __resetForTests,
};

export default ActiveReminder;
