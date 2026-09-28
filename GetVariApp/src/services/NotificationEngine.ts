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
  import { DEFAULT_SLEEP_SCHEDULE, awakeHoursPerDay, lastWakeUpAt } from '../utils/sleepWindow';
  import NotificationService from './NotificationService';
  import {
    calculateCDI,
    calculateFDI,
  } from '../utils/focusCognitiveDrop';
  import buildNotificationContent from '../utils/notificationContent';

  const ALERT_STATE_KEY = 'getvari_notification_engine_state';

  export type NotificationTrigger =
    | 'welcome'
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
    | 'focus_slipping'
    | 'focus_lost'
    | 'cognitive_decline'
    | 'cognitive_impairment'
    | 'focus_steady'
    | 'cognitive_steady'
    | 'focus_alert'
    | 'priority_alert'
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
    pendingTriggers: NotificationTrigger[];
    /** Exact FDI/CDI slot associated with a deferred scheduled alert. */
    pendingSlotKeys: Partial<Record<NotificationTrigger, string>>;
    riskAlertActive: boolean;
    pendingDay: string;
  }

  /**
   * What `sendNotification` knows about the moment it is writing for.
   *
   * The engine already holds all of it while it is evaluating; passing it down
   * is what lets the message state numbers instead of generalities. Every field
   * is optional because every one of them can legitimately be missing — an
   * "Insufficient Data" risk solve, a focus alert raised on a tick where the
   * cognitive index never crossed anything.
   */
  interface NotificationContext {
    riskScore?: number | null;
    riskStatus?: string | null;
    /** The FDI/CDI readings behind a focus or cognitive trigger. */
    indexScores?: { focus?: number; cognitive?: number };
  }

  /**
   * The triggers whose text is a forecast built from an index, and which index.
   *
   * `severity` is the band, not the wording: 'early' is the first crossing
   * ("Focus Slipping", "Cognitive Decline Risk") and 'severe' is the top one.
   */
  const DROP_TRIGGERS: Partial<
    Record<NotificationTrigger, { kind: 'focus' | 'cognitive'; severity: 'early' | 'severe' }>
  > = {
    focus_slipping: { kind: 'focus', severity: 'early' },
    focus_lost: { kind: 'focus', severity: 'severe' },
    cognitive_decline: { kind: 'cognitive', severity: 'early' },
    cognitive_impairment: { kind: 'cognitive', severity: 'severe' },
  };

  /**
   * Notifications that do not carry the hydration risk score.
   *
   * The two device messages are about the wearable's battery and have nothing
   * to do with the user's body; the weekly summary reports a week, and a
   * reading taken this second would be the one number in it that is not about
   * the period it covers.
   */
  const RISK_FREE_TRIGGERS: NotificationTrigger[] = [
    'low_battery',
    'fully_charged',
    'weekly_summary',
  ];

  /** Alerts scoped to one activity session rather than to a cooldown window. */
  const ACTIVITY_SESSION_TRIGGERS: NotificationTrigger[] = ['post_activity', 'long_activity'];

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
      // One evaluation at a time. The dashboard calls this on every telemetry
      // tick, and at login several ticks land together: run concurrently, each
      // would read the same saved state and deliver the same alerts before any
      // of them saved, which is how a login produced a burst of notifications.
      const run = this.evaluationQueue.then(() => this.evaluateNow(evalData));
      this.evaluationQueue = run.catch(() => undefined);
      return run;
    }

    /** Serialises `evaluate` calls; see there. */
    private evaluationQueue: Promise<unknown> = Promise.resolve();

    /** When the current signed-in session's dashboard opened; see `markSessionStart`. */
    private sessionStartedAt = 0;

    /**
     * Called when the dashboard opens after login or a cold start. For the
     * next LOGIN_QUIET_MS nothing but a high risk alert is delivered: the
     * dashboard is on screen, and conditions that are still true are sent
     * later, one at a time, instead of greeting the user with a burst.
     */
    markSessionStart(now: number = Date.now()): void {
      this.sessionStartedAt = now;
      // Clear stale pending triggers from previous sessions to prevent catch-up bursts on app open
      void this.getPersistentState().then(state => {
        state.pendingTriggers = state.pendingTriggers.filter(
          t => t === 'high_risk' || t === 'elevated_risk'
        );
        return this.savePersistentState(state);
      });
    }

    private async evaluateNow(evalData: NotificationEvaluation): Promise<NotificationOutcome> {
      const { sensorData, profile, todayLogs, solvedRisk } = evalData;
      const now = Date.now();
      const state = await this.getPersistentState();
      const { lastAlerts } = state;
      const todayKey = new Date(now).toISOString().slice(0, 10);
      if (state.pendingDay !== todayKey) {
        state.pendingTriggers = [];
        state.pendingDay = todayKey;
      }

      // 1. Determine priority and quiet hours
      //
      // Read through `NotificationService`, which owns the schedule the *rest*
      // of the app is quiet by: the persisted copy, falling back to the default
      // window when the user has never answered. Deciding it from
      // `profile.sleepSchedule` alone — as this did — meant a profile that
      // simply does not carry the field (an older row, a partial load) was read
      // as "never asleep", and every condition below became deliverable at
      // 3 AM. The two places that decide whether the app is quiet now cannot
      // disagree, because there is only one of them.
      const asleep = await this.isUserAsleep(profile, now);

      const triggers: NotificationTrigger[] = [];
      const triggerSlotKeys: Partial<Record<NotificationTrigger, string>> = {};

      /**
       * The FDI and CDI readings behind whichever focus/cognitive triggers fired.
       *
       * Kept so the message can state the forecast those indices imply rather
       * than the fixed sentence the table used to carry. Only written when the
       * matching trigger is raised, so a score that crossed nothing is never
       * used to time a warning the user is not being sent.
       */
      const indexScores: { focus?: number; cognitive?: number } = {};

      // --- Risk Notifications ---
      // Rule: Critical high_risk alerts bypass quiet hours (per spec).
      if (solvedRisk.score !== null && solvedRisk.score >= RISK_THRESHOLDS.HIGH) {
        if (this.canSend(now, lastAlerts, 'high_risk')) {
          triggers.push('high_risk');
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
        /**
         * The goal, when there is one to measure against.
         *
         * `null` means a fluid-restricted profile with no physician limit on
         * file, and every notification below this point is a statement about
         * progress towards a goal — "you have had half of it", "you have
         * reached it". None of them can be said honestly without one, and the
         * bare `profile.targetDailyMl` this replaced coerced null to 0, which
         * made `totalMl >= targetMl` true from the first sip: the user was
         * congratulated on reaching a goal the app had refused to set.
         */
        const goalMl =
          typeof profile.targetDailyMl === 'number' && profile.targetDailyMl > 0
            ? profile.targetDailyMl
            : null;
        const date = new Date();
        const hour = date.getHours();
        const sleepSchedule = profile.sleepSchedule ?? DEFAULT_SLEEP_SCHEDULE;
        const midpointOfAwakeDay =
          lastWakeUpAt(sleepSchedule, now) + (awakeHoursPerDay(sleepSchedule) / 2) * 60 * 60 * 1000;

        // Goal achieved (Once per day)
        if (goalMl !== null && totalMl >= goalMl && !this.wasSentToday(lastAlerts, 'goal_achieved')) {
          triggers.push('goal_achieved');
        }

        // Low intake is evaluated from the midpoint of the user's awake day,
        // not from a fixed wall-clock hour. The once-per-day state lets a later
        // telemetry tick deliver it if the app was not open at the exact point.
        if (
          goalMl !== null &&
          now >= midpointOfAwakeDay &&
          totalMl < goalMl * 0.5 &&
          !this.wasSentToday(lastAlerts, 'low_intake_12pm')
        ) {
          triggers.push('low_intake_12pm');
        }

        // Environmental alerts are once per hydration day.
        if (sensorData.temperature !== null) {
          if (sensorData.temperature >= 30 && sensorData.temperature < 35 &&
              !this.wasSentToday(lastAlerts, 'high_temp')) {
            triggers.push('high_temp');
          }
        }

        if (sensorData.humidity !== null && sensorData.humidity >= 70 &&
            !this.wasSentToday(lastAlerts, 'high_humidity')) {
          triggers.push('high_humidity');
        }
      }

      // Process triggers
      //
      // At most one notification per evaluation, and none within
      // MIN_GAP_BETWEEN_ALERTS of the last one (a high risk alert excepted).
      // Triggers are raised in priority order, so the first is the one sent;
      // conditions that stay true are raised again on a later tick. The sleep
      // window is an absolute block: if the user is asleep, nothing is
      // delivered and cooldown state is not updated.
      const hasPermission = await NotificationService.requestPermission();
      const delivered: NotificationTrigger[] = [];

      const validPending = state.pendingTriggers.filter(trigger => {
        if (triggers.includes(trigger)) return false;
        const valid = this.isPendingTriggerStillValid(trigger, evalData, state);
        if (!valid) {
          console.log(`[NotificationEngine] Dropping stale pending trigger: ${trigger}`);
        }
        return valid;
      });

      state.pendingTriggers = state.pendingTriggers.filter(
        trigger => triggers.includes(trigger) || validPending.includes(trigger)
      );
      for (const trigger of Object.keys(state.pendingSlotKeys) as NotificationTrigger[]) {
        if (!state.pendingTriggers.includes(trigger)) delete state.pendingSlotKeys[trigger];
      }

      const eligible = [...validPending, ...triggers];
      const quietBlocked = now - this.sessionStartedAt < NOTIFICATION_COOLDOWNS.LOGIN_QUIET_MS;
      const sinceAnyNotification = Math.min(
        await NotificationService.msSinceLastNotification(),
        now - (state.lastDeliveredAt || 0)
      );
      const gapBlocked = sinceAnyNotification < NOTIFICATION_COOLDOWNS.MIN_GAP_BETWEEN_ALERTS;
      const toDeliver = eligible.filter(trigger => (!gapBlocked || trigger === 'high_risk') && (!quietBlocked || trigger === 'high_risk'));

      if (!asleep) {
        for (const trigger of toDeliver.slice(0, 1)) {
          // Only actually deliver if permission is granted
          if (hasPermission) {
            const didDeliver = await this.sendNotification(trigger, profile, {
              riskScore: solvedRisk.score,
              riskStatus: solvedRisk.status,
              indexScores,
            });
            if (didDeliver === false) continue;
            delivered.push(trigger);
            state.pendingTriggers = state.pendingTriggers.filter(item => item !== trigger);

            // Update state ONLY if actually delivered
            state.lastAlerts[trigger] = now;
            if (trigger.startsWith('ai_')) {
              state.lastAlerts['ai_generic'] = now;
            }
            if (ACTIVITY_SESSION_TRIGGERS.includes(trigger)) {
              state.activitySessionAlerts.push(trigger);
            }
            if (trigger === 'high_risk' || trigger === 'elevated_risk') state.riskAlertActive = true;
            if (trigger === 'risk_improved') state.riskAlertActive = false;
            const slotKey = state.pendingSlotKeys[trigger] ?? triggerSlotKeys[trigger] ?? this.scheduledSlotKey(trigger, now);
            if (slotKey) state.lastAlerts[slotKey] = now;
            delete state.pendingSlotKeys[trigger];
          } else {
            console.log(`[NotificationEngine] Suppressed ${trigger} - Permission Denied`);
          }
        }

        if (delivered.length) {
          state.lastDeliveredAt = now;
        }
      } else {
        console.log(`[NotificationEngine] Suppressed ${triggers.join(', ')} - User is asleep`);
      }

      for (const trigger of eligible) {
        if (!delivered.includes(trigger) && !state.pendingTriggers.includes(trigger)) {
          // Do NOT store simulated/routine fixed-time notifications in pendingTriggers.
          // Those are managed as native AlarmManager scheduled notifications.
          if (trigger !== 'regular_reminder' && trigger !== 'focus_alert' && trigger !== 'priority_alert') {
            state.pendingTriggers.push(trigger);
            if (triggerSlotKeys[trigger]) state.pendingSlotKeys[trigger] = triggerSlotKeys[trigger];
          }
        }
      }

      await this.savePersistentState(state);

      return { raised: triggers, delivered };
    }

    /**
     * Triggers AI-driven notifications if credits are available,
     * else falls back to Rule-Based Mode.
     */
    async triggerAI(type: AiNudge, profile: UserProfile): Promise<void> {
      // AI nudges are not part of the Excel notification specification. Keeping
      // this public no-op avoids breaking callers while ensuring it cannot
      // create a competing notification path.
      console.log(`[AI] Suppressed obsolete AI notification: ${type}`);
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

    private canSend(now: number, lastAlerts: Record<string, number>, trigger: NotificationTrigger): boolean {
      const cooldown = this.getCooldownFor(trigger);
      const lastSent = lastAlerts[trigger] || 0;
      return now - lastSent >= cooldown;
    }

    /**
     * Whether the 3-hourly focus/cognitive check is due: none of those
     * notifications in the last FOCUS_COGNITIVE_ALERT window.
     */
    private wasSentToday(lastAlerts: Record<string, number>, trigger: string): boolean {
      const lastSent = lastAlerts[trigger] || 0;
      const startOfToday = new Date().setHours(0, 0, 0, 0);
      return lastSent >= startOfToday;
    }

    private getCooldownFor(trigger: NotificationTrigger): number {
      switch (trigger) {
        case 'high_risk':
        case 'elevated_risk':
        case 'focus_alert':
        case 'priority_alert':
          return NOTIFICATION_COOLDOWNS.RISK_ALERT;
        case 'low_battery':
          return NOTIFICATION_COOLDOWNS.LOW_BATTERY;
        case 'high_temp':
        case 'high_humidity':
          return NOTIFICATION_COOLDOWNS.ENVIRONMENTAL_ALERT;
        case 'inactivity':
          return NOTIFICATION_COOLDOWNS.INACTIVITY_REMINDER;
        default:
          return 0;
      }
    }

    private scheduledSlotKey(trigger: NotificationTrigger, at: number): string | null {
      const d = new Date(at);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const h = d.getHours();
      const m = d.getMinutes();

      if (trigger === 'focus_alert') {
        if (h > 16 || (h === 16 && m >= 0)) {
          return `focus_alert:${dateStr}:16:0`;
        }
        if (h > 12 || (h === 12 && m >= 30)) {
          return `focus_alert:${dateStr}:12:30`;
        }
        return null;
      }
      if (trigger === 'priority_alert') {
        if (h > 18 || (h === 18 && m >= 30)) {
          return `priority_alert:${dateStr}:18:30`;
        }
        if (h > 14 || (h === 14 && m >= 30)) {
          return `priority_alert:${dateStr}:14:30`;
        }
        return null;
      }
      return `${trigger}:${dateStr}:${h}:${m}`;
    }

    private isPendingTriggerStillValid(
      trigger: NotificationTrigger,
      evalData: NotificationEvaluation,
      state: EnginePersistentState
    ): boolean {
      const { solvedRisk, todayLogs, profile, sensorData } = evalData;
      const goalMl = typeof profile.targetDailyMl === 'number' && profile.targetDailyMl > 0 ? profile.targetDailyMl : null;
      const totalMl = todayLogs.reduce((acc, log) => acc + log.amountMl, 0);

      if (trigger === 'risk_improved') {
        return solvedRisk.score !== null && solvedRisk.score < RISK_THRESHOLDS.RECOVERY && state.riskAlertActive;
      }
      if (trigger === 'elevated_risk') {
        return solvedRisk.score !== null && solvedRisk.score >= RISK_THRESHOLDS.ELEVATED && solvedRisk.score < RISK_THRESHOLDS.HIGH;
      }
      if (trigger === 'high_risk') {
        return solvedRisk.score !== null && solvedRisk.score >= RISK_THRESHOLDS.HIGH;
      }
      if (trigger === 'low_intake_12pm') {
        return goalMl !== null && totalMl < goalMl * 0.5;
      }
      if (trigger === 'goal_achieved') {
        return goalMl !== null && totalMl >= goalMl;
      }
      if (trigger === 'high_temp') {
        return sensorData.temperature !== null && sensorData.temperature >= 30 && sensorData.temperature < 35;
      }
      if (trigger === 'high_humidity') {
        return sensorData.humidity !== null && sensorData.humidity >= 70;
      }
      if (trigger === 'focus_alert') {
        const fdiSlotKey = state.pendingSlotKeys.focus_alert ?? this.scheduledSlotKey('focus_alert', Date.now());
        return fdiSlotKey !== null && !this.wasSentToday(state.lastAlerts, fdiSlotKey);
      }
      if (trigger === 'priority_alert') {
        const cdiSlotKey = state.pendingSlotKeys.priority_alert ?? this.scheduledSlotKey('priority_alert', Date.now());
        return cdiSlotKey !== null && !this.wasSentToday(state.lastAlerts, cdiSlotKey);
      }
      return false;
    }

    /**
     * Whether the app is in its quiet window right now.
     *
     * Two sources, and either one saying "asleep" wins. `NotificationService`
     * holds the schedule the scheduler and the display path are already quiet
     * by — persisted on the device, defaulting to 23:00-07:00 when the user has
     * never answered — while the profile carries whatever the last load read.
     * They normally agree; when they do not, one of them is stale, and a missed
     * nudge costs the user far less than one that wakes them at 3 AM.
     */
    private async isUserAsleep(profile: UserProfile, now: number): Promise<boolean> {
      const schedule = profile.sleepSchedule;
      if (schedule && isAsleepAt(schedule, now)) return true;

      try {
        return await NotificationService.isSleeping(now);
      } catch (error) {
        console.error('[NotificationEngine] Could not read the sleep window:', error);
        // Unreadable, and the profile did not say asleep. Staying audible is the
        // only option that does not silence the app indefinitely on a bad read.
        return false;
      }
    }

    private async sendNotification(
      trigger: NotificationTrigger,
      profile: UserProfile,
      context: NotificationContext = {}
    ): Promise<boolean> {
      const centralContent = buildNotificationContent(trigger, profile.fullName);
      // High risk is the sole non-Excel emergency path retained for the
      // explicitly requested login-quiet exception. It never carries a score.
      const messages: Partial<Record<NotificationTrigger, { title: string; body: string }>> = {
        high_risk: {
          title: '🚨 High Risk',
          body: 'High hydration risk detected. Please hydrate immediately and follow the recommended water intake.',
        },
      };

      let body = messages[trigger]?.body;
      let title = messages[trigger]?.title;

      if (centralContent) {
        title = centralContent.title;
        body = centralContent.body;
      }

      if (title && body) {
        return NotificationService.displayNotification(title, body, undefined, 'local', {
          notificationKey: trigger,
        });
      }
      return false;
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
        pendingTriggers: Array.isArray(stored.pendingTriggers)
          ? stored.pendingTriggers.filter((trigger: string) =>
              !['no_water_3h', 'extreme_heat', 'weekly_summary', 'focus_slipping', 'focus_lost',
                'cognitive_decline', 'cognitive_impairment', 'focus_steady', 'cognitive_steady'].includes(trigger)
            )
          : [],
        pendingSlotKeys:
          stored.pendingSlotKeys && typeof stored.pendingSlotKeys === 'object'
            ? stored.pendingSlotKeys
            : {},
        riskAlertActive: stored.riskAlertActive === true,
        pendingDay: typeof stored.pendingDay === 'string' ? stored.pendingDay : new Date().toISOString().slice(0, 10),
      };
    }

    private async savePersistentState(state: EnginePersistentState): Promise<void> {
      await AsyncStorage.setItem(ALERT_STATE_KEY, JSON.stringify(state));
    }
  }

  export default new NotificationEngine();
