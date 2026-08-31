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

/**
 * What one evaluation decided.
 *
 * `raised` is every trigger whose condition held and whose own cooldown had
 * expired; `delivered` is the subset that actually went to the user this tick,
 * after burst control and the permission check. They differ whenever several
 * conditions come true at once — which, on a phone, is most of the time.
 */
export interface NotificationOutcome {
  raised: NotificationTrigger[];
  delivered: NotificationTrigger[];
}

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
  /**
   * Activity alerts already raised for the *current* active session.
   *
   * A time-based cooldown is the wrong tool here: the condition ("active for
   * 30+ minutes") stays true for the whole session, and the engine is
   * re-evaluated on every telemetry tick, so without a per-session record the
   * same alert is re-sent every couple of seconds until the user stops moving.
   * The list is cleared whenever a session ends or a new one begins.
   */
  activitySessionAlerts: NotificationTrigger[];
  /**
   * When the engine last delivered anything, used to keep simultaneous
   * conditions from arriving as one clump. See `MIN_GAP_BETWEEN_ALERTS`.
   */
  lastDeliveredAt: number;
}

/** Alerts scoped to one activity session rather than to a cooldown window. */
const ACTIVITY_SESSION_TRIGGERS: NotificationTrigger[] = ['post_activity', 'long_activity'];

/**
 * Delivery order when several conditions come true in the same evaluation.
 *
 * Only the first still-deliverable trigger goes out per tick (see
 * `selectDeliverable`), so this is what decides *which* of a clump the user
 * hears about first. Anything unlisted sorts last.
 */
const TRIGGER_PRIORITY: NotificationTrigger[] = [
  'high_risk',
  'elevated_risk',
  'extreme_heat',
  'no_water_3h',
  'low_intake_12pm',
  'below_target_4pm',
  'high_temp',
  'high_humidity',
  'long_activity',
  'post_activity',
  'inactivity',
  'low_battery',
  'goal_achieved',
  'risk_improved',
  'fully_charged',
  'weekly_summary',
];

/**
 * A high-risk alert is the one notification that must not wait its turn: it
 * already bypasses the quiet window, so it bypasses the spacing floor too.
 */
const BYPASSES_SPACING: NotificationTrigger[] = ['high_risk'];

type AiNudge = 'reminder' | 'insight' | 'activity' | 'risk' | 'progress';

const AI_TRIGGERS: Record<AiNudge, NotificationTrigger> = {
  reminder: 'ai_reminder',
  insight: 'ai_insight',
  activity: 'ai_activity',
  risk: 'ai_risk',
  progress: 'ai_progress',
};

/**
 * What each AI nudge degrades to when the provider is out of credit.
 *
 * Four of the five have a plain-language equivalent already in the message
 * table. `progress` is congratulatory rather than actionable, so with no AI
 * text to send there is nothing worth waking the user for — it is dropped.
 */
const AI_RULE_BASED_FALLBACK: Record<AiNudge, NotificationTrigger | null> = {
  reminder: 'regular_reminder',
  insight: 'below_target_4pm',
  activity: 'post_activity',
  risk: 'elevated_risk',
  progress: null,
};

class NotificationEngine {
  /** Set when the AI provider reports it is out of credit (a 429). */
  private aiQuotaExhausted = false;

  /**
   * Evaluates all notification conditions and triggers them if allowed.
   * Respects "Missing != Zero", per-type cooldowns, hysteresis, and sleep windows.
   */
  async evaluate(evalData: NotificationEvaluation): Promise<NotificationOutcome> {
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
        if (!state.activeStartTimestamp) {
          // A new session starts here, so last session's alerts are spent.
          state.activeStartTimestamp = now;
          state.activitySessionAlerts = [];
        }
        state.inactiveStartTimestamp = null;
      } else if (sensorData.activityLoad < 10) {
        if (!state.inactiveStartTimestamp) state.inactiveStartTimestamp = now;
        if (state.activeStartTimestamp) state.activitySessionAlerts = [];
        state.activeStartTimestamp = null;
      } else {
        // Transitional - we pause the active timer if it was running?
        // Spec says >= 30m activity. If they drop below 50, we reset the timer for now.
        if (state.activeStartTimestamp) state.activitySessionAlerts = [];
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

      // Activity Alerts (once per session, not once per cooldown window)
      if (state.activeStartTimestamp) {
        const activeMins = (now - state.activeStartTimestamp) / 60000;
        const sessionAlerts = state.activitySessionAlerts;
        if (activeMins >= 60 && !sessionAlerts.includes('long_activity')) {
          triggers.push('long_activity');
        } else if (activeMins >= 30 && !sessionAlerts.includes('post_activity')) {
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

      // 12 PM low intake (< 50%) and 4 PM below target (< 70%), once each.
      //
      // Checked over a window rather than on the exact hour. The engine only
      // runs while the dashboard is mounted, so `hour === 12` meant a user who
      // did not open the app between 12:00 and 12:59 never heard about being
      // half a day behind on water. The window closes where the next check
      // takes over, and `wasSentToday` still holds it to one delivery.
      if (
        hour >= 12 && hour < 16 &&
        totalMl < targetMl * 0.5 &&
        !this.wasSentToday(lastAlerts, 'low_intake_12pm')
      ) {
         triggers.push('low_intake_12pm');
      }

      if (
        hour >= 16 && hour < 20 &&
        totalMl < targetMl * 0.7 &&
        !this.wasSentToday(lastAlerts, 'below_target_4pm')
      ) {
         triggers.push('below_target_4pm');
      }

      // Environmental Alerts (3h cooldown)
      // The band is chosen by temperature first and only then checked against
      // its cooldown — the same shape as the risk bands above. Folding the
      // cooldown into the first condition meant that while the 3-hourly
      // extreme-heat alert was cooling down, 38 °C fell through to the milder
      // "it's hot outside" message, so the user got one or the other every
      // three hours instead of the extreme-heat alert alone.
      if (sensorData.temperature !== null) {
        if (sensorData.temperature >= 35) {
          if (this.canSend(now, lastAlerts, 'extreme_heat')) {
            triggers.push('extreme_heat');
          }
        } else if (sensorData.temperature >= 30) {
          if (this.canSend(now, lastAlerts, 'high_temp')) {
            triggers.push('high_temp');
          }
        }
      }

      if (sensorData.humidity !== null && sensorData.humidity >= 70 && this.canSend(now, lastAlerts, 'high_humidity')) {
        triggers.push('high_humidity');
      }

      // The morning (07:00) and night (22:00) messages are *not* raised here.
      // They carry fixed text at a fixed time, so they are queued with the OS
      // in `NotificationService.scheduleDailyNotifications` and arrive whether
      // or not the app is open — which is the whole point of a 7 AM greeting.

      // --- Weekly Summary (Monday, from 8 AM) ---
      //
      // Stays in the engine because its body is computed from the week's data
      // at delivery time, which a pre-queued notification cannot do. From 08:00
      // rather than at 08:00, so it survives the app being shut at that hour.
      if (date.getDay() === 1 && hour >= 8 && !this.wasSentToday(lastAlerts, 'weekly_summary')) {
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
    //
    // At most one goes out per evaluation, and no two are less than
    // MIN_GAP_BETWEEN_ALERTS apart. Anything held back keeps its cooldown
    // untouched, so a condition that is still true is simply raised again on a
    // later tick rather than being lost.
    const hasPermission = await NotificationService.requestPermission();
    const deliverable = this.selectDeliverable(triggers, now, state);

    if (deliverable.length) {
      state.lastDeliveredAt = now;
    }

    for (const trigger of deliverable) {
      // Always update state that we "sent" it (to maintain cooldowns)
      state.lastAlerts[trigger] = now;
      if (trigger.startsWith('ai_')) {
        state.lastAlerts['ai_generic'] = now;
      }
      if (ACTIVITY_SESSION_TRIGGERS.includes(trigger)) {
        state.activitySessionAlerts.push(trigger);
      }

      // Only actually deliver if permission is granted
      if (hasPermission) {
        await this.sendNotification(trigger, profile);
      } else {
        console.log(`[NotificationEngine] Suppressed ${trigger} - Permission Denied`);
      }
    }

    await this.savePersistentState(state);

    return { raised: triggers, delivered: hasPermission ? deliverable : [] };
  }

  /**
   * Triggers AI-driven notifications if credits are available,
   * else falls back to Rule-Based Mode.
   */
  async triggerAI(type: AiNudge, profile: UserProfile): Promise<void> {
    const now = Date.now();
    const state = await this.getPersistentState();

    // 1. Spam Protection - Prevent AI alerts more than once every 12 hours
    const lastAI = state.lastAlerts['ai_generic'] || 0;
    if (now - lastAI < 12 * 60 * 60 * 1000) {
       console.log('[AI] Suppressing AI trigger - Spam protection active.');
       return;
    }

    // 2. Check AI Quota/Credits. When the provider is out of credit the nudge
    //    is not dropped — it degrades to the plain rule-based reminder, so the
    //    user still hears about their hydration, just without the AI phrasing.
    const trigger = this.aiQuotaExhausted
      ? AI_RULE_BASED_FALLBACK[type]
      : AI_TRIGGERS[type];

    if (this.aiQuotaExhausted) {
      console.log(`[AI] Credits exhausted (429). Rule-Based Mode for ${type}.`);
    }

    if (!trigger) return;

    const hasPermission = await NotificationService.requestPermission();
    if (hasPermission) {
      await this.sendNotification(trigger, profile);
    }
    state.lastAlerts[trigger] = now;
    // The spam gate covers the fallback too: a rule-based substitute is still
    // the one nudge this 12-hour window is allowed.
    state.lastAlerts['ai_generic'] = now;
    await this.savePersistentState(state);
  }

  /**
   * Marks the AI provider as out of credit, or back in credit.
   *
   * Called by whatever talks to the provider when it sees a 429, so the
   * fallback is driven by a real signal rather than a constant.
   */
  setAiQuotaExhausted(exhausted: boolean): void {
    this.aiQuotaExhausted = exhausted;
  }

  isAiQuotaExhausted(): boolean {
    return this.aiQuotaExhausted;
  }

  /**
   * The subset of this tick's triggers that may be delivered now.
   *
   * Returns at most one, the most urgent, and nothing at all while the spacing
   * floor is still running — except for the alerts in `BYPASSES_SPACING`,
   * which are urgent enough to interrupt.
   */
  private selectDeliverable(
    triggers: NotificationTrigger[],
    now: number,
    state: EnginePersistentState
  ): NotificationTrigger[] {
    if (!triggers.length) return [];

    const [top, ...held] = [...triggers].sort(
      (a, b) => this.priorityOf(a) - this.priorityOf(b)
    );

    const sinceLast = now - (state.lastDeliveredAt || 0);
    if (!BYPASSES_SPACING.includes(top) && sinceLast < NOTIFICATION_COOLDOWNS.MIN_GAP_BETWEEN_ALERTS) {
      console.log(
        `[NotificationEngine] Holding ${[top, ...held].join(', ')} — ` +
          `${Math.round(sinceLast / 60000)} min since the last notification.`
      );
      return [];
    }

    if (held.length) {
      console.log(`[NotificationEngine] Deferring ${held.join(', ')} behind ${top}.`);
    }
    return [top];
  }

  private priorityOf(trigger: NotificationTrigger): number {
    const index = TRIGGER_PRIORITY.indexOf(trigger);
    return index === -1 ? TRIGGER_PRIORITY.length : index;
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
      // morning_msg / night_msg live in NotificationService.DAILY_MESSAGES —
      // they are queued with the OS at 07:00 and 22:00, not raised from here.
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
    const stored = raw ? JSON.parse(raw) : {};
    // Spread over defaults so a state blob written by an older build — which
    // has no `activitySessionAlerts` — still loads with a usable shape.
    return {
      lastAlerts: {},
      activeStartTimestamp: null,
      inactiveStartTimestamp: null,
      lastDeliveredAt: 0,
      ...stored,
      activitySessionAlerts: Array.isArray(stored.activitySessionAlerts) ? stored.activitySessionAlerts : [],
    };
  }

  private async savePersistentState(state: EnginePersistentState): Promise<void> {
    await AsyncStorage.setItem(ALERT_STATE_KEY, JSON.stringify(state));
  }
}

export default new NotificationEngine();
