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
