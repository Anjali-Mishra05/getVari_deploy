import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SensorData,
  UserProfile,
  HydrationLog,
  HydrationRiskDetails
} from '../types';
import {
  NOTIFICATION_COOLDOWNS,
  RISK_THRESHOLDS
} from '../config/edgeCaseConfig';
import {
  isAsleepAt
} from '../utils/sleepWindow';
import NotificationService from './NotificationService';
import TelemetryHistoryService from './TelemetryHistoryService';

const ALERT_STATE_KEY = 'getvari_notification_engine_state';

export type NotificationTrigger =
  | 'regular_reminder'
  | 'low_intake_12pm'
  | 'below_target_4pm'
  | 'no_water_3h'
  | 'goal_achieved'
  | 'elevated_risk'
  | 'high_risk'
  | 'risk_improved'
  | 'post_activity'
  | 'long_activity'
  | 'high_temp'
  | 'extreme_heat'
  | 'high_humidity'
  | 'inactivity'
  | 'low_battery'
  | 'fully_charged'
  | 'morning_msg'
  | 'night_msg'
  | 'weekly_summary'
  | 'ai_reminder'
  | 'ai_insight'
  | 'ai_activity'
  | 'ai_risk'
  | 'ai_progress'
  | 'ai_generic';

export interface NotificationEvaluation {
  sensorData: SensorData;
  profile: UserProfile;
  todayLogs: HydrationLog[];
  solvedRisk: HydrationRiskDetails;
}

interface EnginePersistentState {
  lastAlerts: Record<string, number>;
  activeStartTimestamp: number | null;
  inactiveStartTimestamp: number | null;
}

class NotificationEngine {
  /**
   * Evaluates all notification conditions and triggers them if allowed.
   * Respects "Missing != Zero", per-type cooldowns, hysteresis, and sleep windows.
   */
  async evaluate(evalData: NotificationEvaluation): Promise<void> {
    const { sensorData, profile, todayLogs, solvedRisk } = evalData;
    const now = Date.now();
    const state = await this.getPersistentState();
    const { lastAlerts } = state;

    // 1. Determine priority and quiet hours
    const sleepSchedule = profile.sleepSchedule;
    const asleep = sleepSchedule ? isAsleepAt(sleepSchedule, now) : false;

    const triggers: NotificationTrigger[] = [];

    // --- Risk Notifications (Hysteresis + 30m Cooldown) ---
    // Rule: Critical alerts bypass quiet hours (per spec).
    if (solvedRisk.score !== null) {
      if (solvedRisk.score >= RISK_THRESHOLDS.HIGH) {
        if (this.canSend(now, lastAlerts, 'high_risk')) {
          triggers.push('high_risk');
        }
      } else if (solvedRisk.score >= RISK_THRESHOLDS.ELEVATED) {
        if (this.canSend(now, lastAlerts, 'elevated_risk')) {
          triggers.push('elevated_risk');
        }
      } else if (solvedRisk.score < RISK_THRESHOLDS.RECOVERY) {
        // Recovery logic: only if we previously had a risk alert and cooled down
        const lastRiskTime = Math.max(lastAlerts['high_risk'] || 0, lastAlerts['elevated_risk'] || 0);
        if (lastRiskTime > (lastAlerts['risk_improved'] || 0)) {
           triggers.push('risk_improved');
        }
      }
    }

    // --- Activity Tracking ---
    if (sensorData.activityLoad !== null) {
      if (sensorData.activityLoad >= 50) {
        if (!state.activeStartTimestamp) state.activeStartTimestamp = now;
        state.inactiveStartTimestamp = null;
      } else if (sensorData.activityLoad < 10) {
        if (!state.inactiveStartTimestamp) state.inactiveStartTimestamp = now;
        state.activeStartTimestamp = null;
      } else {
        // Transitional - we pause the active timer if it was running?
        // Spec says >= 30m activity. If they drop below 50, we reset the timer for now.
        state.activeStartTimestamp = null;
        state.inactiveStartTimestamp = null;
      }
    }

    // --- Routine Notifications (Muted during sleep) ---
    if (!asleep) {
      const totalMl = todayLogs.reduce((acc, log) => acc + log.amountMl, 0);
      const targetMl = profile.targetDailyMl;
      const date = new Date();
      const hour = date.getHours();

      // Goal achieved (Once per day)
      if (totalMl >= targetMl && !this.wasSentToday(lastAlerts, 'goal_achieved')) {
        triggers.push('goal_achieved');
      }

      // No water for 3 hours (Cooldown: 3h)
      if (todayLogs.length > 0) {
        const newest = todayLogs.reduce((a, b) => new Date(a.reportedAt || a.timestamp) > new Date(b.reportedAt || b.timestamp) ? a : b);
        const hoursSince = (now - new Date(newest.reportedAt || newest.timestamp).getTime()) / 3600000;
        if (hoursSince >= 3 && this.canSend(now, lastAlerts, 'no_water_3h')) {
          triggers.push('no_water_3h');
        }
      }

      // Activity Alerts
      if (state.activeStartTimestamp) {
        const activeMins = (now - state.activeStartTimestamp) / 60000;
        if (activeMins >= 60 && this.canSend(now, lastAlerts, 'long_activity')) {
          triggers.push('long_activity');
        } else if (activeMins >= 30 && this.canSend(now, lastAlerts, 'post_activity')) {
          triggers.push('post_activity');
        }
      }

      // Inactivity Alert
      if (state.inactiveStartTimestamp) {
        const inactiveHours = (now - state.inactiveStartTimestamp) / 3600000;
        if (inactiveHours >= 3 && this.canSend(now, lastAlerts, 'inactivity')) {
          triggers.push('inactivity');
        }
      }

      // 12 PM Low intake (< 50%) - Check only once
      if (hour === 12 && totalMl < targetMl * 0.5 && !this.wasSentToday(lastAlerts, 'low_intake_12pm')) {
         triggers.push('low_intake_12pm');
      }

      // 4 PM Below target (< 70%) - Check only once
      if (hour === 16 && totalMl < targetMl * 0.7 && !this.wasSentToday(lastAlerts, 'below_target_4pm')) {
         triggers.push('below_target_4pm');
      }

      // Environmental Alerts (3h cooldown)
      if (sensorData.temperature !== null) {
        if (sensorData.temperature >= 35 && this.canSend(now, lastAlerts, 'extreme_heat')) {
          triggers.push('extreme_heat');
        } else if (sensorData.temperature >= 30 && this.canSend(now, lastAlerts, 'high_temp')) {
          triggers.push('high_temp');
        }
      }

      if (sensorData.humidity !== null && sensorData.humidity >= 70 && this.canSend(now, lastAlerts, 'high_humidity')) {
        triggers.push('high_humidity');
      }

      // Morning / Night (Once per day)
      const currentTimeStr = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
      if (currentTimeStr === '07:00' && !this.wasSentToday(lastAlerts, 'morning_msg')) {
        triggers.push('morning_msg');
      }
      if (currentTimeStr === '22:00' && !this.wasSentToday(lastAlerts, 'night_msg')) {
        triggers.push('night_msg');
      }

      // --- Weekly Summary (Mon 8 AM) ---
      if (date.getDay() === 1 && hour === 8 && !this.wasSentToday(lastAlerts, 'weekly_summary')) {
         triggers.push('weekly_summary');
      }

      // --- AI Triggers (Patterns and deviations) ---
      // Spam Protection: One AI nudge every 12 hours max
      const lastAI = lastAlerts['ai_generic'] || 0;
      const aiCooldown = 12 * 60 * 60 * 1000;
      const canSendAI = now - lastAI >= aiCooldown;

      if (canSendAI) {
        // 20. AI Reminder (Pattern-based need)
        if (todayLogs.length === 0 && hour > 10 && this.canSend(now, lastAlerts, 'ai_reminder')) {
          triggers.push('ai_reminder');
        }

        // 21. AI Low Intake (Deviation from pattern)
        else if (totalMl < targetMl * 0.3 && hour > 14 && this.canSend(now, lastAlerts, 'ai_insight')) {
          triggers.push('ai_insight');
        }

        // 22. AI Activity Note (Exertion increase)
        else if (sensorData.activityLoad !== null && sensorData.activityLoad > 70 && this.canSend(now, lastAlerts, 'ai_activity')) {
          triggers.push('ai_activity');
        }

        // 23. AI Risk (Pattern risk)
        else if (solvedRisk.score !== null && solvedRisk.score > 50 && this.canSend(now, lastAlerts, 'ai_risk')) {
          triggers.push('ai_risk');
        }

        // 24. AI Progress (Improvement trend)
        else if (totalMl >= targetMl * 0.9 && solvedRisk.score !== null && solvedRisk.score < 20 && this.canSend(now, lastAlerts, 'ai_progress')) {
          triggers.push('ai_progress');
        }
      }
    }

    // --- Device Notifications (Always evaluated) ---
    if (sensorData.batteryLevel !== null) {
      if (sensorData.batteryLevel <= 20 && this.canSend(now, lastAlerts, 'low_battery')) {
        triggers.push('low_battery');
      } else if (sensorData.batteryLevel === 100 && !this.wasSentToday(lastAlerts, 'fully_charged')) {
        triggers.push('fully_charged');
      }
    }

    // Process triggers
    const hasPermission = await NotificationService.requestPermission();

    for (const trigger of triggers) {
      // Always update state that we "sent" it (to maintain cooldowns)
      state.lastAlerts[trigger] = now;
      if (trigger.startsWith('ai_')) {
        state.lastAlerts['ai_generic'] = now;
      }

      // Only actually deliver if permission is granted
      if (hasPermission) {
        await this.sendNotification(trigger, profile);
      } else {
        console.log(`[NotificationEngine] Suppressed ${trigger} - Permission Denied`);
      }
    }

    await this.savePersistentState(state);
  }

  /**
   * Triggers AI-driven notifications if credits are available,
   * else falls back to Rule-Based Mode.
   */
  async triggerAI(type: 'reminder' | 'insight' | 'activity' | 'risk' | 'progress', profile: UserProfile): Promise<void> {
    const now = Date.now();
    const state = await this.getPersistentState();

    // 1. Spam Protection - Prevent AI alerts more than once every 12 hours
    const lastAI = state.lastAlerts['ai_generic'] || 0;
    if (now - lastAI < 12 * 60 * 60 * 1000) {
       console.log('[AI] Suppressing AI trigger - Spam protection active.');
       return;
    }

    // 2. Check AI Quota/Credits (Simulated 429/Error)
    const aiQuotaExhausted = false; // Mock state

    if (aiQuotaExhausted) {
      console.log(`[AI] Credits exhausted (429). Switching to Rule-Based Mode for ${type}.`);
      return;
    }

    // 3. Logic to decide specific AI trigger types
    const triggerMap: Record<string, NotificationTrigger> = {
      'reminder': 'ai_reminder',
      'insight': 'ai_insight',
      'activity': 'ai_activity',
      'risk': 'ai_risk',
      'progress': 'ai_progress'
    };

    const trigger = triggerMap[type];
    if (trigger) {
       const hasPermission = await NotificationService.requestPermission();
       if (hasPermission) {
         await this.sendNotification(trigger, profile);
       }
       state.lastAlerts[trigger] = now;
       state.lastAlerts['ai_generic'] = now;
       await this.savePersistentState(state);
    }
  }

  private canSend(now: number, lastAlerts: Record<string, number>, trigger: NotificationTrigger): boolean {
    const cooldown = this.getCooldownFor(trigger);
    const lastSent = lastAlerts[trigger] || 0;
    return now - lastSent >= cooldown;
  }

  private wasSentToday(lastAlerts: Record<string, number>, trigger: NotificationTrigger): boolean {
    const lastSent = lastAlerts[trigger] || 0;
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    return lastSent >= startOfToday;
  }

  private getCooldownFor(trigger: NotificationTrigger): number {
    switch (trigger) {
      case 'high_risk':
      case 'elevated_risk':
        return NOTIFICATION_COOLDOWNS.RISK_ALERT;
      case 'low_battery':
        return NOTIFICATION_COOLDOWNS.LOW_BATTERY;
      case 'high_temp':
      case 'extreme_heat':
      case 'high_humidity':
        return NOTIFICATION_COOLDOWNS.ENVIRONMENTAL_ALERT;
      case 'no_water_3h':
      case 'inactivity':
        return NOTIFICATION_COOLDOWNS.INACTIVITY_REMINDER;
      default:
        return 0;
    }
  }

  private async sendNotification(trigger: NotificationTrigger, profile: UserProfile): Promise<void> {
    const messages: Record<string, { title: string; body: string }> = {
      regular_reminder: { title: '💧 Hydration', body: 'Time to hydrate! Please drink some water to stay hydrated.' },
      low_intake_12pm: { title: '⚠️ Low Intake', body: 'Your water intake is below 50% of your daily goal. Please drink 250-300 mL of water now.' },
      below_target_4pm: { title: '⚠️ Below Target', body: 'You’re below 70% of your daily hydration goal. Please drink 250-300 mL of water to stay on track.' },
      no_water_3h: { title: '🕒 Hydration Gap', body: 'You haven’t logged any water for 3 hours. Please take a moment to hydrate.' },
      goal_achieved: { title: '🎉 Goal Achieved', body: 'Great job! You’ve reached your daily hydration goal. Keep staying hydrated!' },
      elevated_risk: { title: '📈 Elevated Risk', body: 'Your hydration risk is elevated. Please drink water soon to improve your hydration level.' },
      high_risk: { title: '🚨 High Risk', body: 'High hydration risk detected. Please hydrate immediately and follow the recommended water intake.' },
      risk_improved: { title: '✅ Risk Improved', body: 'Good news! Your hydration risk has improved. Keep drinking water regularly to maintain your hydration.' },
      extreme_heat: { title: '🔥 Extreme Heat', body: 'Extreme heat detected. Increase your fluid intake and drink water regularly to reduce dehydration risk.' },
      high_temp: { title: '☀️ High Temperature', body: 'It’s hot outside. You may need additional fluids today. Please drink water regularly and stay hydrated.' },
      high_humidity: { title: '💧 High Humidity', body: 'It’s humid outside. You may need additional fluids today. Please drink water regularly and stay hydrated.' },
      inactivity: { title: '🚶 Inactivity', body: 'You’ve been inactive for 3 hours. Take a short break, move around, and drink some water.' },
      post_activity: { title: '💪 Post-Activity', body: 'You’ve completed 30+ minutes of activity. Please drink 250–500 mL of water to replenish fluids.' },
      long_activity: { title: '🏃 Long Activity', body: 'You’ve completed a long activity session. Your body may need extra water, so please increase your water intake.' },
      low_battery: { title: '🔋 Low Battery', body: 'Your battery is low. Please charge your device to keep hydration tracking and reminders active.' },
      fully_charged: { title: '⚡ Fully Charged', body: 'Your device is fully charged. You’re all set to continue your hydration tracking.' },
      morning_msg: { title: '🌅 Good Morning', body: 'Good morning! Start your day with a glass of water and stay hydrated throughout the day.' },
      night_msg: { title: '🌙 Bedtime', body: 'It’s almost bedtime. Keep up your hydration.' },
      ai_reminder: { title: '🤖 Smart Nudge', body: 'Based on your hydration pattern, it may be a good time to drink some water. Stay ahead of dehydration!' },
      ai_insight: { title: '🤖 Intake Insight', body: 'Your water intake is lower than your usual pattern. Consider drinking some water to get back on track.' },
      ai_activity: { title: '🤖 Activity Note', body: 'Your recent activity may have increased your hydration needs. Drink water to replenish the fluids you lost.' },
      ai_risk: { title: '🤖 Smart Risk', body: 'Your hydration pattern and activity indicate increased risk. Please follow the recommended guidance.' },
      ai_progress: { title: '🤖 Pattern Alert', body: 'Your hydration pattern is improving! Keep up the good work and continue drinking water regularly.' },
    };

    let body = messages[trigger]?.body;
    let title = messages[trigger]?.title;

    if (trigger === 'weekly_summary') {
       const report = await this.calculateWeeklyReport(profile);
       title = '📊 Weekly Progress';
       body = report;
    }

    if (title && body) {
      await NotificationService.displayNotification(title, body, undefined, 'local', {
         ignoreSleepWindow: trigger === 'high_risk' || trigger === 'elevated_risk' // Critical alerts bypass
      });
    }
  }

  private async calculateWeeklyReport(profile: UserProfile): Promise<string> {
    const history = await TelemetryHistoryService.getHistory(); // Note: needs profile/userId if we had them here
    if (history.length < 5) {
       return "Insufficient data: We don't have enough hydration data for this week. Keep logging your water intake to track your progress.";
    }

    // Simplified logic for prototype
    const score = 85;
    if (score >= 90) return "Great job! You stayed well hydrated this week and achieved your daily goal on most days. Keep it up!";
    if (score >= 70) return "You're making good progress! You met your hydration goal on several days this week. Try to stay more consistent next week.";
    if (score >= 50) return "Your hydration was below your target this week. Try drinking water more regularly to improve your hydration.";
    return "Your hydration was lower than recommended this week. Make an effort to drink water regularly and stay closer to your daily goal.";
  }

  private async getPersistentState(): Promise<EnginePersistentState> {
    const raw = await AsyncStorage.getItem(ALERT_STATE_KEY);
    return raw ? JSON.parse(raw) : { lastAlerts: {}, activeStartTimestamp: null, inactiveStartTimestamp: null };
  }

  private async savePersistentState(state: EnginePersistentState): Promise<void> {
    await AsyncStorage.setItem(ALERT_STATE_KEY, JSON.stringify(state));
  }
}

export default new NotificationEngine();
