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

// Notifee supports exactly one background handler, so every background concern
// is dispatched from here.
//
//  - Deliveries and taps are appended to the log behind the bell icon. This is
//    the only place a notification that arrives while the app is backgrounded
//    or quit can be observed as it happens.
//  - Reminder taps are additionally queued for replay; HomeScreen picks them up
//    once the chat widget is mounted. The press's event id is stored with it so
//    a replayed tap is recognised as the same event and never opens a second
//    logging flow.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.DELIVERED) {
    await NotificationHistory.recordDelivery(detail.notification);
    return;
  }

  if (type === EventType.PRESS) {
    await NotificationHistory.recordPress(detail.notification);

    if (detail.notification?.data?.type === HYDRATION_REMINDER_TYPE) {
      await NotificationService.markHydrationPromptPending(readReminderEventId(detail.notification));
    }
  }
});

AppRegistry.registerComponent(appName, () => App);
