import { DeviceEventEmitter, EmitterSubscription } from 'react-native';
import type { HydrationLogResult } from '../types';

/**
 * Lightweight bridge between the parts of the app that live outside the React
 * tree (notification handlers, the hydration writer) and the mounted UI.
 */
const HYDRATION_PROMPT_EVENT = 'getvari:open-hydration-prompt';
const HYDRATION_LOGGED_EVENT = 'getvari:hydration-logged';

export interface HydrationPromptEvent {
  /**
   * Identifies the reminder press that produced this request. Every delivery
   * path (foreground press, background replay, cold start) carries the same id
   * for the same press, which is what keeps repeated taps from starting extra
   * logging flows.
   */
  eventId: string;
  /**
   * Set when the user opened this from inside the app (the bell menu) rather
   * than from a notification.
   *
   * Dedupe by event id exists to stop *one* press being delivered three times
   * by the OS. A deliberate tap in the list is not that, and must open the
   * chat even for a reminder that was already handled — otherwise tapping an
   * old row appears to do nothing at all.
   */
  force?: boolean;
}

export const ChatBus = {
  /** Open the chat and — if nothing is in flight — start the logging prompt. */
  openHydrationPrompt(eventId: string, options: { force?: boolean } = {}) {
    DeviceEventEmitter.emit(HYDRATION_PROMPT_EVENT, {
      eventId,
      force: options.force,
    } satisfies HydrationPromptEvent);
  },

  onOpenHydrationPrompt(listener: (event: HydrationPromptEvent) => void): EmitterSubscription {
    return DeviceEventEmitter.addListener(HYDRATION_PROMPT_EVENT, listener);
  },

  /** Announce a successful intake write so any mounted screen can refresh. */
  emitHydrationLogged(result: HydrationLogResult) {
    DeviceEventEmitter.emit(HYDRATION_LOGGED_EVENT, result);
  },

  onHydrationLogged(listener: (result: HydrationLogResult) => void): EmitterSubscription {
    return DeviceEventEmitter.addListener(HYDRATION_LOGGED_EVENT, listener);
  },
};

export default ChatBus;
