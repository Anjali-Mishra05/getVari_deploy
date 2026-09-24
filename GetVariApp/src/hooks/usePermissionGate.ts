import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { AuthService } from '../services/AuthService';
import NotificationService from '../services/NotificationService';
import type { PermissionSnapshot } from '../utils/permissionRequirements';

/**
 * The live state of the grants the app requires.
 *
 * ## Why it re-reads rather than remembering
 *
 * A permission is not a step the user completes; it is a setting they can
 * change at any time from App info, and the app is not running when they do.
 * Anything cached — a "we already asked" flag, a stored snapshot — is a claim
 * about the phone's current configuration that the app has no right to make.
 * So nothing is remembered: every resume re-reads, and the gate follows what
 * it finds.
 *
 * That is the whole of the reported requirement. Revoke the permission from
 * App info, come back, and the gate is there again, because the only thing
 * deciding is the answer Android gives right now.
 *
 * ## Why AppState is the trigger
 *
 * Three of the four grants live in system settings pages, not dialogs. The app
 * is backgrounded for the whole of the interaction and the only signal that
 * anything changed is the user returning. Polling while in the foreground
 * would cost a native round trip per tick and still be slower than the event.
 */
export const usePermissionGate = () => {
  const [snapshot, setSnapshot] = useState<PermissionSnapshot | null>(null);
  /** True until the first read lands, so the gate does not flash on launch. */
  const [checking, setChecking] = useState(true);
  /**
   * Whether the gate is allowed to show at all yet.
   *
   * The grants are asked for immediately after the wizard's last step — the
   * BLE pairing screen — and never before it. Splash, login, OTP and the
   * seven onboarding steps all run with the gate disarmed, so a new user sees
   * what the app is for before being asked to let it interrupt them.
   */
  const [armed, setArmed] = useState(false);

  /**
   * Guards against a state update on an unmounted hook, and against an
   * in-flight read from before a resume overwriting a fresher one after it.
   */
  const mounted = useRef(true);
  const readId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++readId.current;

    try {
      /**
       * Re-read on every refresh rather than once at mount: the wizard
       * finishes *during* the app's lifetime, and the gate has to arm at that
       * moment rather than on the next cold start. `OnboardingScreen` calls
       * `markOnboardingComplete()` and then navigates, and the navigation is
       * what brings this round again.
       */
      const onboarded = await AuthService.hasCompletedOnboarding();
      if (mounted.current && id === readId.current) setArmed(onboarded);
      /**
       * iOS has no equivalent of the three Android grants, so requiring them
       * would gate the app on settings that do not exist. The notification
       * permission is the whole of the requirement there.
       */
      if (Platform.OS !== 'android') {
        const notifications = await NotificationService.hasNotificationPermission();
        if (mounted.current && id === readId.current) {
          setSnapshot({
            notifications,
            channelAllows: true,
            fullScreenIntent: true,
            displayOverApps: true,
          });
        }
        return;
      }

      // Read together: four sequential native round trips would let the gate
      // render against a half-updated picture and re-arrange under the user.
      const [notifications, reminderStatus] = await Promise.all([
        NotificationService.hasNotificationPermission(),
        NotificationService.fullScreenReminderStatus(),
      ]);

      if (!mounted.current || id !== readId.current) return;

      setSnapshot({
        notifications,
        channelAllows: reminderStatus.channelAllows,
        fullScreenIntent: reminderStatus.granted,
        displayOverApps: reminderStatus.canLaunchOverApps,
      });
    } catch (error) {
      console.error('[Permissions] Could not read the grant state:', error);
      /**
       * A failed read leaves the previous snapshot standing rather than
       * assuming the worst. Treating an error as "nothing is granted" would
       * throw the gate up over a working app because one native call
       * happened to fail.
       */
    } finally {
      if (mounted.current && id === readId.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });

    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [refresh]);

  return { snapshot, checking, armed, refresh };
};

export default usePermissionGate;
