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
    await NotificationHistory.recordDelivery(detail.notification);
  } else if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
    await NotificationHistory.recordPress(detail.notification);
  }

  const verdict = await NotificationService.handleReminderEvent(type, detail);

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
