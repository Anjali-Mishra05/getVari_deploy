import type { NotificationTrigger } from '../services/NotificationEngine';

export interface NotificationContent {
  title: string;
  body: string;
}

const displayName = (fullName?: string): string => {
  const name = fullName?.trim();
  return name ? name.split(/\s+/)[0] : 'there';
};

/** 3250 ml -> "3.25", 2500 ml -> "2.5", 3000 ml -> "3". */
const formatGoalLitres = (ml: number): string => String(Math.round(ml / 10) / 100);

/** The Excel specification is the sole source for notification copy. */
export const buildNotificationContent = (
  trigger: NotificationTrigger,
  fullName?: string,
  /** The user's Final Daily Target, for the Daily Water Requirement message. */
  dailyTargetMl?: number | null
): NotificationContent | null => {
  const name = displayName(fullName);
  const targetMl = Number(dailyTargetMl);
  const messages: Partial<Record<NotificationTrigger, NotificationContent>> = {
    // Only with a real target: a requirement with no number says nothing.
    ...(Number.isFinite(targetMl) && targetMl > 0
      ? {
          daily_water_requirement: {
            title: '💧 Daily Water Requirement',
            body: `Your water goal for today is ${formatGoalLitres(targetMl)} L (approximately ${Math.round(targetMl / 250)} glasses of 250 ml each). Keep sipping throughout the day to stay hydrated!`,
          },
        }
      : {}),
    welcome: { title: '💧 Welcome to GetVari', body: '💧 You’re all set! We’ll track your hydration and remind you when your body needs it. 💙' },
    morning_msg: { title: '🌅 Good Morning', body: '🌅 Good morning! Start your day with a glass of water 💧 and keep hydration on track throughout the day. 🔵' },
    night_msg: { title: '🌙 Good Night', body: `🌙 Almost bedtime, ${name}! Keep up your hydration 💧 before you call it a day. 💙` },
    regular_reminder: { title: '💧 Hydration Reminder', body: `💧 Time to hydrate, ${name}! No water for 2 hours? Let’s fix that. 🥤 Take a drink and refresh yourself! 💙` },
    low_intake_12pm: { title: '💧 Low Intake', body: `💧 You’re falling behind, ${name}! You’re below 50% of your daily hydration goal. Drink 250–300 mL of water now and get back on track. 💙` },
    goal_achieved: { title: '🎉 Goal Achieved', body: `🎉 Great job, ${name}! You’ve reached your daily hydration goal! 💧 Keep the streak going and stay hydrated. 💙🔥` },
    elevated_risk: { title: '⚠️ Elevated Risk', body: `⚠️ Your dehydration risk is elevated, ${name}. Time to hydrate 💧 Drink some water soon and help bring your hydration back on track. 💙` },
    risk_improved: { title: '🎉 Risk Reduced', body: `🎉 Great news, ${name}! Your dehydration risk has reduced. 💧 Keep sipping regularly to stay on track! 💙` },
    focus_alert: { title: '⚠️ Focus Alert', body: `⚠️ Focus may drop in the next 15 minutes, ${name}! 💧 Drink 250–500 mL of water now to stay refreshed and hydrated. 💙🧠` },
    priority_alert: { title: '🚨 Priority Alert', body: `🚨 Oh no, ${name}! Your thinking could be affected in the next 15 minutes. 🧠💧 Hydrate and cool down now! ❄️💙` },
    high_temp: { title: '☀️ High Temperature', body: `☀️ It’s hot out there, ${name}! You may need extra fluids today. 💧 Drink regularly and stay hydrated! 💙` },
    high_humidity: { title: '💦 High Humidity', body: `💦 It’s humid and sticky outside, ${name}! You may need extra fluids today. 💧 Drink regularly and stay hydrated! 💙🌤️` },
  };

  return messages[trigger] ?? null;
};

export default buildNotificationContent;
