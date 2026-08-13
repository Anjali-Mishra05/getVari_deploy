import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Owns the answer to "should this reminder tap start a logging conversation?".
 *
 * Two separate problems are handled here, and both used to cause duplicated
 * prompts:
 *
 *  1. **One press can be delivered several times.** A tap can arrive through
 *     the foreground listener, through the background handler's replay, and
 *     again from `getInitialNotification()` on the next cold start. Each
 *     delivery carries the same event id, and `claimEvent` only lets the first
 *     one through.
 *  2. **Several presses are still one conversation.** Reminders repeat every
 *     couple of minutes, so a user can tap five of them. The prompt latch
 *     means the chat asks "did you drink water?" once; later taps just reopen
 *     the chat on the conversation that is already running.
 *
 * The latch clears when an entry is logged (a new reminder cycle may ask
 * again) or after `REASK_COOLDOWN_MS`, so a user who ignored the prompt is not
 * locked out of it forever.
 */

const HANDLED_EVENTS_KEY = 'getvari_handled_reminder_events';
const SESSION_KEY = 'getvari_hydration_prompt_session';

/** How long to wait before re-asking a user who answered but never logged. */
export const REASK_COOLDOWN_MS = 30 * 60 * 1000;
/** Bounded history so the store cannot grow without limit. */
const HANDLED_LIMIT = 50;

export type PromptStatus =
  | 'idle' // nothing asked yet — the next reminder press may prompt
  | 'asked' // the question is on screen and awaiting an answer
  | 'resolved'; // the user answered; do not ask again until reset/cooldown

interface SessionState {
  status: PromptStatus;
  askedAt?: number;
  resolvedAt?: number;
}

let state: SessionState = { status: 'idle' };
let handled: string[] = [];
let hydration: Promise<void> | null = null;

const persistSession = () => {
  AsyncStorage.setItem(SESSION_KEY, JSON.stringify(state)).catch(error =>
    console.error('[PromptSession] Failed to persist session:', error)
  );
};

const persistHandled = () => {
  AsyncStorage.setItem(HANDLED_EVENTS_KEY, JSON.stringify(handled)).catch(error =>
    console.error('[PromptSession] Failed to persist handled events:', error)
  );
};

/** Loads persisted state once per app session. */
const hydrate = (): Promise<void> => {
  if (!hydration) {
    hydration = (async () => {
      try {
        const [rawHandled, rawSession] = await Promise.all([
          AsyncStorage.getItem(HANDLED_EVENTS_KEY),
          AsyncStorage.getItem(SESSION_KEY),
        ]);

        const parsedHandled = rawHandled ? JSON.parse(rawHandled) : [];
        if (Array.isArray(parsedHandled)) {
          handled = parsedHandled.filter((id): id is string => typeof id === 'string');
        }

        const parsedSession = rawSession ? JSON.parse(rawSession) : null;
        if (parsedSession && typeof parsedSession.status === 'string') {
          // A prompt left mid-question by a killed app should not block the
          // next reminder forever; only a resolved session survives a restart.
          state =
            parsedSession.status === 'resolved'
              ? parsedSession
              : { status: 'idle' };
        }
      } catch (error) {
        console.error('[PromptSession] Failed to restore state:', error);
      }
    })();
  }
  return hydration;
};

/**
 * Registers a reminder press. Returns false when this exact press has already
 * been seen, in which case the caller should do nothing at all.
 *
 * State is mutated synchronously after hydration so two presses arriving in
 * the same tick cannot both claim the same id.
 */
const claimEvent = async (eventId: string): Promise<boolean> => {
  await hydrate();

  if (handled.includes(eventId)) return false;

  handled.push(eventId);
  if (handled.length > HANDLED_LIMIT) handled = handled.slice(-HANDLED_LIMIT);
  persistHandled();
  return true;
};

/**
 * Returns true when the chat should actually ask the logging question.
 * False means a conversation is already open (or was just answered) and the
 * press should only bring the chat back to the front.
 */
const beginPrompt = async (now: number = Date.now()): Promise<boolean> => {
  await hydrate();

  if (state.status === 'asked') return false;
  if (state.status === 'resolved') {
    const since = now - (state.resolvedAt ?? 0);
    if (since < REASK_COOLDOWN_MS) return false;
  }

  state = { status: 'asked', askedAt: now };
  persistSession();
  return true;
};

/** The user answered the prompt (either branch) — stop re-asking. */
const markResolved = async (now: number = Date.now()): Promise<void> => {
  await hydrate();
  state = { status: 'resolved', askedAt: state.askedAt, resolvedAt: now };
  persistSession();
};

/** An entry was logged (or the chat was cleared): allow a fresh prompt. */
const reset = async (): Promise<void> => {
  await hydrate();
  state = { status: 'idle' };
  persistSession();
};

const getStatus = async (): Promise<PromptStatus> => {
  await hydrate();
  return state.status;
};

/** Test hook — clears in-memory state so runs stay independent. */
const __resetForTests = (): void => {
  state = { status: 'idle' };
  handled = [];
  hydration = null;
};

export const HydrationPromptSession = {
  claimEvent,
  beginPrompt,
  markResolved,
  reset,
  getStatus,
  __resetForTests,
};

export default HydrationPromptSession;
