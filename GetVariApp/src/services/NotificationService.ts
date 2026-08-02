import notifee, { AndroidImportance, AuthorizationStatus } from '@notifee/react-native';

class NotificationService {
  /**
   * Request permission for Android 13+ and iOS.
   */
  async requestPermission(): Promise<boolean> {
    const settings = await notifee.requestPermission();
    return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
  }

  /**
   * Create the default notification channel for hydration reminders.
   */
  async createNotificationChannel() {
    return await notifee.createChannel({
      id: 'hydration-reminders',
      name: 'Hydration Reminders',
      importance: AndroidImportance.HIGH,
      vibration: true,
    });
  }

  /**
   * Display a generic notification.
   */
  async displayNotification(title: string, body: string, channelId: string = 'hydration-reminders') {
    // Ensure permission is granted
    const hasPermission = await this.requestPermission();
    if (!hasPermission) return;

    // Ensure channel exists
    await this.createNotificationChannel();

    // Display the notification
    await notifee.displayNotification({
      title,
      body,
      android: {
        channelId,
        // Using the default app icon or a specific one if provided
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

  /**
   * Placeholder for future implementations (AI, weather, etc.)
   */
  async cancelAllNotifications() {
    await notifee.cancelAllNotifications();
  }
}

export default new NotificationService();
