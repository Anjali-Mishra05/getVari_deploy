import type { NotificationTrigger } from '../services/NotificationEngine';

export interface NotificationContent {
  title: string;
  body: string;
}

const displayName = (fullName?: string): string => {
  const name = fullName?.trim();
  return name ? name.split(/\s+/)[0] : 'there';
};

/** The Excel specification is the sole source for notification copy. */
export const buildNotificationContent = (
  trigger: NotificationTrigger,
  fullName?: string
): NotificationContent | null => {
  const name = displayName(fullName);
  const messages: Partial<Record<NotificationTrigger, NotificationContent>> = {
    welcome: { title: '💧 Welcome to GetVari', body: '💧 You’re all set! We’ll track your hydration and remind you when your body needs it. 💙' },
    morning_msg: { title: '🌅 Good Morning', body: '🌅 Good morning! Start your day with a glass of water 💧 and keep hydration on track throughout the day. 🔵' },
    night_msg: { title: '🌙 Good Night', body: `🌙 Almost bedtime, ${name}! Keep up your hydration 💧 before you call it a day. 💙` },
    regular_reminder: { title: '💧 Hydration Reminder', body: `💧 Time to hydrate, ${name}! No water for 2 hours? Let’s fix that. 🥤 Take a drink and refresh yourself! 💙` },
    low_intake_12pm: { title: '💧 Low Intake', body: `💧 You’re falling behind, ${name}! You’re below 50% of your daily hydration goal. Drink 250–300 mL of water now and get back on track. 💙` },
    goal_achieved: { title: '🎉 Goal Achieved', body: `🎉 Great job, ${name}! You’ve reached your daily hydration goal! 💧 Keep the streak going and stay hydrated. 💙🔥` },
    elevated_risk: { title: '⚠️ Elevated Risk', body: `⚠️ Your hydration risk is elevated, ${name}. Time to hydrate 💧 Drink some water soon and help bring your hydration back on track. 💙` },
    risk_improved: { title: '🎉 Risk Improved', body: `🎉 Great news, ${name}! Your hydration risk has improved. 💧 Keep sipping regularly to stay on track! 💙` },
    focus_alert: { title: '⚠️ Focus Alert', body: `⚠️ Focus may drop in the next 15 minutes, ${name}! 💧 Drink 250–500 mL of water now to stay refreshed and hydrated. 💙🧠` },
    priority_alert: { title: '🚨 Priority Alert', body: `🚨 Oh no, ${name}! Your thinking could be affected in the next 15 minutes. 🧠💧 Hydrate and cool down now! ❄️💙` },
    high_temp: { title: '☀️ High Temperature', body: `☀️ It’s hot out there, ${name}! You may need extra fluids today. 💧 Drink regularly and stay hydrated! 💙` },
    high_humidity: { title: '💦 High Humidity', body: `💦 It’s humid and sticky outside, ${name}! You may need extra fluids today. 💧 Drink regularly and stay hydrated! 💙🌤️` },
  };

  return messages[trigger] ?? null;
};

export default buildNotificationContent;
