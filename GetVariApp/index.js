import '@react-native-firebase/app';
import '@react-native-firebase/auth';
import 'react-native-url-polyfill/auto';
import 'react-native-gesture-handler';
import './global.css';
import { AppRegistry } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';
import NotificationService, {
  HYDRATION_REMINDER_TYPE,
  readReminderEventId,
} from './src/services/NotificationService';
import NotificationHistory from './src/services/NotificationHistory';
import HydrationService from './src/services/HydrationService';

/**
 * Events that reach the app while it is backgrounded or not running at all.
 *
 * The reminder's whole point is that it can be answered from here — pressing
 * "Log 500 ml" in the shade must write the entry without ever bringing the app
 * to the front, and swiping the reminder away must postpone it rather than
 * silently end it. `NotificationService.handleReminderEvent` owns those
 * decisions so the foreground listener reaches the identical conclusions; this
 * handler only carries out the part that needs a network write.
 */
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.DELIVERED) {
    // Before anything else looks at it: a notification that fired inside the
    // user's sleep window is withdrawn, not logged, not turned into an
    // outstanding reminder, and above all not allowed to raise the full-screen
    // prompt below. Slots are shifted out of the night when they are queued,
    // but reminders are handed to AlarmManager up to a day ahead and the app
    // is not running to re-queue them when the window changes — so this is the
    // one place a 2 AM delivery can still be caught.
    if (await NotificationService.suppressIfAsleep(detail.notification)) return;

    // And the same for a reminder that lands right after a drink. Logging an
    // entry re-queues the cadence from that moment, but the re-queue is not
    // awaited and an alarm already lodged with AlarmManager fires anyway — so
    // a reminder can still arrive asking for water the user has just had.
    // Caught here for the same reason as the sleep window: this is the only
    // point where the delivery itself is observable, before it is recorded or
    // turned into a full-screen prompt.
    if (await NotificationService.suppressIfRecentlyHydrated(detail.notification)) return;

    if (detail.notification?.data?.deliveryAccepted !== '1') {
      if (!(await NotificationService.acceptScheduledDelivery(detail.notification))) return;
      detail.notification.data = {
        ...(detail.notification.data || {}),
        deliveryAccepted: '1',
      };
    }

    await NotificationHistory.recordDelivery(detail.notification);

    // Anything that survives the two gates above has reached the user, so it
    // starts the gap the notification engine spaces its own alerts by. Stamped
    // here rather than per-type because the engine's question is "has the user
    // just been interrupted?", and a "Good Morning" message interrupts exactly
    // as much as a reminder does.
  } else if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
    await NotificationHistory.recordPress(detail.notification);
  }

  const verdict = await NotificationService.handleReminderEvent(type, detail);

  // The refresh below re-posts the reminder so Android will update its text,
  // and that re-post arrives here as a second DELIVERED carrying `refreshed`.
  // Everything in this branch has already run for it — `recordDelivery` and
  // `ActiveReminder.raise` above both collapse the repeat on the unchanged
  // event id, and doing the work twice would mean a second launch attempt.
  const isFirstDelivery =
    type === EventType.DELIVERED &&
    detail.notification?.data?.type === HYDRATION_REMINDER_TYPE &&
    detail.notification?.data?.refreshed !== '1';

  if (isFirstDelivery) {
    // Bring the reminder screen up over whatever the user is doing.
    //
    // The notification already carries a `fullScreenAction`, but Android only
    // honours that while the screen is off or locked — with the phone unlocked
    // and in the user's hand the platform downgrades it to a heads-up banner
    // on purpose. So the one case the reminder exists for, someone awake and
    // using their phone who has not had water in hours, was the one case that
    // never got the full-screen prompt.
    //
    // `presentReminderFullScreen` is the other half: it starts the activity
    // itself, and only in that case — it stays out of the way when the OS is
    // already raising the screen, and when the app is in front, where the
    // prompt comes up from the outstanding reminder anyway. It also filters
    // out non-reminder notifications, so this stays a single unconditional
    // call rather than a condition repeated at the call site.
    //
    // Ordered after `handleReminderEvent` on purpose: that is what records the
    // delivery as an outstanding reminder, and the outstanding reminder is
    // what `ReminderFullScreen` reads. Launching first would race the screen
    // against the state it renders from.
    await NotificationService.presentReminderFullScreen(detail.notification);
  }

  if (verdict === 'log-primary') {
    // Written straight from the background handler — the RN JS context is
    // fully alive here, so the Supabase client and its stored session are
    // both available. `logWater` is idempotent on its request id, so a press
    // Android decides to redeliver cannot double-count the drink.
    const amountMl = NotificationService.readPrimaryAmountMl(detail.notification);
    try {
      const result = await HydrationService.logWater({
        amountMl,
        source: 'manual',
        requestId: `notif_${readReminderEventId(detail.notification)}`,
        confirmed: true,
      });

      // A successful write clears the reminder from inside `logWater`, which
      // is the one place every logging path goes through. Only the failures
      // need handling here: the reminder is deliberately left standing, so the
      // app asks again rather than quietly losing a drink the user believes
      // they recorded.
      if (result.status !== 'logged' && result.status !== 'duplicate') {
        console.warn('[Reminders] Background log did not complete:', result.status);
      }
    } catch (error) {
      console.error('[Reminders] Background log failed:', error);
    }
    return;
  }

  if (verdict === 'open-prompt' && detail.notification?.data?.type === HYDRATION_REMINDER_TYPE) {
    // Replayed by HomeScreen once the React tree is mounted.
    await NotificationService.markHydrationPromptPending(
      readReminderEventId(detail.notification)
    );
  }
});

AppRegistry.registerComponent(appName, () => App);
