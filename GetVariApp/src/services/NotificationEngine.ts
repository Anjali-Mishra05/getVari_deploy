  import AsyncStorage from '@react-native-async-storage/async-storage';
  import {
    SensorData,
    UserProfile,
    HydrationLog,
    HydrationRiskDetails
  } from '../types';
  import {
    DROP_INDEX_ALERT_THRESHOLD,
    HIGH_HUMIDITY_MIN_PCT,
    HIGH_TEMP_RANGE_C,
    NOTIFICATION_COOLDOWNS,
    NOTIFICATION_SIMULATION,
    RISK_THRESHOLDS,
    SIGNIFICANT_MOTION_ACTIVITY_LOAD
  } from '../config/edgeCaseConfig';

  import {
    isAsleepAt
  } from '../utils/sleepWindow';
  import { DEFAULT_SLEEP_SCHEDULE, awakeHoursPerDay, lastWakeUpAt } from '../utils/sleepWindow';
  import NotificationService from './NotificationService';
  import { calculateCDI, calculateFDI } from '../utils/focusCognitiveDrop';
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
    | 'daily_water_requirement'
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
    /**
     * Focus (FDI) and Cognitive (CDI) drop indices, when the caller has them.
     * Only read while simulation is off. CDI falls back to one derived from
     * the risk solve; FDI needs motion data and is skipped when absent
     * ("Missing != Zero").
     */
    indexScores?: { fdi?: number | null; cdi?: number | null };
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
    /** Set when a risk alert is delivered; Risk Improved may only follow it. */
    riskAlertActive: boolean;
    /**
     * Last reading with significant motion (activity load at or above
     * SIGNIFICANT_MOTION_ACTIVITY_LOAD); FDI's time-since-motion input.
     * Null until one is seen, which leaves FDI missing rather than zero.
     */
    lastSignificantMotionAt: number | null;
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
     * Called whenever the app is opened: after login, on a cold start, and on
     * a return to the foreground. For the next LOGIN_QUIET_MS nothing at all
     * is delivered — risk alerts included. Conditions that are still true
     * afterwards are sent later, one at a time, instead of as a burst.
     *
     * Also starts the same quiet period in `NotificationService`, which gates
     * the OS-scheduled notifications, so both paths keep one clock.
     */
    markSessionStart(now: number = Date.now()): void {
      this.sessionStartedAt = now;
      NotificationService.markAppOpened(now);
      // Stale pending triggers from an earlier session are not delivered as a
      // catch-up burst. Queued behind any running evaluation so the two never
      // overwrite each other's saved state.
      const run = this.evaluationQueue.then(async () => {
        const state = await this.getPersistentState();
        state.pendingTriggers = state.pendingTriggers.filter(
          t => t === 'high_risk' || t === 'elevated_risk'
        );
        await this.savePersistentState(state);
      });
      this.evaluationQueue = run.catch(() => undefined);
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

      if (sensorData.activityLoad !== null && sensorData.activityLoad >= SIGNIFICANT_MOTION_ACTIVITY_LOAD) {
        state.lastSignificantMotionAt = now;
      }

      const triggers: NotificationTrigger[] = [];
      /** Why each trigger was raised, for the delivery log. */
      const reasons: Partial<Record<NotificationTrigger, string>> = {};
      const raise = (trigger: NotificationTrigger, reason: string) => {
        triggers.push(trigger);
        reasons[trigger] = reason;
      };

      /**
       * While the temporary simulation is on, these four come from the fixed
       * daily timeline in `NotificationService` and must not also be raised
       * from live data here, or the user would get each twice.
       */
      const liveRiskAndIndexAlerts = !NOTIFICATION_SIMULATION.ENABLED;
      const score = solvedRisk.score;

      // --- Risk Notifications ---
      // Raised here even inside the sleep window so the outcome reports them,
      // but never delivered then: the sleep window has no exceptions.
      if (score !== null && score >= RISK_THRESHOLDS.HIGH) {
        if (this.canSend(now, lastAlerts, 'high_risk')) {
          raise('high_risk', `risk score ${score}`);
        }
      } else if (
        liveRiskAndIndexAlerts &&
        score !== null &&
        score >= RISK_THRESHOLDS.ELEVATED &&
        this.canSend(now, lastAlerts, 'elevated_risk')
      ) {
        raise('elevated_risk', `risk score ${score} (60-79)`);
      }

      // Risk Improved: only after a delivered risk alert, and only once the
      // score has actually fallen below 40.
      if (
        liveRiskAndIndexAlerts &&
        state.riskAlertActive &&
        score !== null &&
        score < RISK_THRESHOLDS.RECOVERY
      ) {
        raise('risk_improved', `risk score ${score} fell below ${RISK_THRESHOLDS.RECOVERY} after a risk alert`);
      }

      // --- Focus (FDI) and Priority (CDI) indices ---
      // From the existing formulas, with the risk score as the dehydration
      // load. Missing inputs leave an index missing, never zero.
      const fdi =
        evalData.indexScores?.fdi ??
        (score !== null && state.lastSignificantMotionAt !== null
          ? calculateFDI(score, (now - state.lastSignificantMotionAt) / 60000)
          : null);
      const cdi =
        evalData.indexScores?.cdi ??
        (score !== null
          ? calculateCDI(score, solvedRisk.temperatureLoad, solvedRisk.humidityLoad, new Date(now))
          : null);

      // Handed to the notification layer so the fixed-time Risk Improved,
      // Focus and Priority slots can check their condition when they fire.
      try {
        await NotificationService.noteConditionSnapshot({
          at: now,
          riskScore: score,
          fdi: typeof fdi === 'number' && Number.isFinite(fdi) ? fdi : null,
          cdi: typeof cdi === 'number' && Number.isFinite(cdi) ? cdi : null,
        });
      } catch (error) {
        console.error('[NotificationEngine] Could not record the condition snapshot:', error);
      }

      // --- Focus (FDI) and Priority (CDI) alerts ---
      if (liveRiskAndIndexAlerts) {
        if (typeof fdi === 'number' && Number.isFinite(fdi) && fdi >= DROP_INDEX_ALERT_THRESHOLD &&
            this.canSend(now, lastAlerts, 'focus_alert')) {
          raise('focus_alert', `FDI ${fdi}`);
        }
        if (typeof cdi === 'number' && Number.isFinite(cdi) && cdi >= DROP_INDEX_ALERT_THRESHOLD &&
            this.canSend(now, lastAlerts, 'priority_alert')) {
          raise('priority_alert', `CDI ${cdi}`);
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
        const sleepSchedule = profile.sleepSchedule ?? DEFAULT_SLEEP_SCHEDULE;
        /**
         * Once-daily notifications reset at the user's wake-up, not at
         * midnight. For someone who sleeps at 01:00 the calendar day turns
         * over while they are still up, and a midnight reset let the same
         * "once a day" alert fire again at 00:30.
         */
        const awakeDayStart = lastWakeUpAt(sleepSchedule, now);
        const midpointOfAwakeDay =
          awakeDayStart + (awakeHoursPerDay(sleepSchedule) / 2) * 60 * 60 * 1000;
        /**
         * `todayLogs` covers the calendar day, so it is the whole awake day's
         * intake only when the awake day began today. After midnight on a late
         * night the day's earlier drinks are missing from it, and "below 50%"
         * would be a false statement.
         */
        const logsCoverAwakeDay = awakeDayStart >= new Date(now).setHours(0, 0, 0, 0);

        // Goal achieved (once per day, whenever it is reached)
        if (goalMl !== null && totalMl >= goalMl && !this.sentSince(lastAlerts, 'goal_achieved', awakeDayStart)) {
          raise('goal_achieved', `intake ${totalMl} mL reached goal ${goalMl} mL`);
        }

        // Low intake: from the midpoint of the user's actual awake day, below
        // half the goal, once per day.
        if (
          goalMl !== null &&
          logsCoverAwakeDay &&
          now >= midpointOfAwakeDay &&
          totalMl < goalMl * 0.5 &&
          !this.sentSince(lastAlerts, 'low_intake_12pm', awakeDayStart)
        ) {
          raise('low_intake_12pm', `intake ${totalMl} mL < 50% of ${goalMl} mL at awake-day midpoint`);
        }

        // Environmental alerts: from the actual reading, once per day.
        if (
          sensorData.temperature !== null &&
          sensorData.temperature >= HIGH_TEMP_RANGE_C.min &&
          sensorData.temperature < HIGH_TEMP_RANGE_C.maxExclusive &&
          !this.sentSince(lastAlerts, 'high_temp', awakeDayStart)
        ) {
          raise('high_temp', `temperature ${sensorData.temperature}°C`);
        }

        if (
          sensorData.humidity !== null &&
          sensorData.humidity >= HIGH_HUMIDITY_MIN_PCT &&
          !this.sentSince(lastAlerts, 'high_humidity', awakeDayStart)
        ) {
          raise('high_humidity', `humidity ${sensorData.humidity}%`);
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

      const eligible = [...validPending, ...triggers];
      // The quiet period after opening holds everything back, risk alerts
      // included; what is held stays pending and is re-checked later. There is
      // no 30-minute gap between these alerts: a Dynamic notification goes out
      // at its own time, however recently another one did.
      const quietBlocked = now - this.sessionStartedAt < NOTIFICATION_COOLDOWNS.LOGIN_QUIET_MS;
      const toDeliver = quietBlocked ? [] : eligible;

      if (!asleep) {
        for (const trigger of toDeliver.slice(0, 1)) {
          // Only actually deliver if permission is granted
          if (hasPermission) {
            const didDeliver = await this.sendNotification(
              trigger,
              profile,
              reasons[trigger] ?? 'condition still true (pending)'
            );
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
          // Focus and Priority alerts are forecasts about the next 15 minutes;
          // they are re-raised from live data, never replayed later.
          if (trigger !== 'regular_reminder' && trigger !== 'focus_alert' && trigger !== 'priority_alert') {
            state.pendingTriggers.push(trigger);
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

    /** Whether `trigger` was delivered at or after `since` (the awake day's start). */
    private sentSince(lastAlerts: Record<string, number>, trigger: string, since: number): boolean {
      return (lastAlerts[trigger] || 0) >= since;
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
        return (
          sensorData.temperature !== null &&
          sensorData.temperature >= HIGH_TEMP_RANGE_C.min &&
          sensorData.temperature < HIGH_TEMP_RANGE_C.maxExclusive
        );
      }
      if (trigger === 'high_humidity') {
        return sensorData.humidity !== null && sensorData.humidity >= HIGH_HUMIDITY_MIN_PCT;
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
      reason: string
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
          source: 'event',
          reason,
        });
      }
      return false;
    }

    private async getPersistentState(): Promise<EnginePersistentState> {
      const raw = await AsyncStorage.getItem(ALERT_STATE_KEY);
      const stored = raw ? JSON.parse(raw) : {};
      // Spread over defaults so a state blob written by an older build — which
      // has no `activitySessionAlerts` — still loads with a usable shape.
      const { pendingSlotKeys: _legacySlotKeys, ...current } = stored;
      // Older builds wrote one `trigger:date:h:m` key per delivery into
      // `lastAlerts` and never removed them; drop them on load.
      const lastAlerts: Record<string, number> = {};
      for (const [key, at] of Object.entries(stored.lastAlerts ?? {})) {
        if (!key.includes(':') && typeof at === 'number') lastAlerts[key] = at;
      }
      return {
        activeStartTimestamp: null,
        inactiveStartTimestamp: null,
        lastDeliveredAt: 0,
        ...current,
        lastAlerts,
        activitySessionAlerts: Array.isArray(stored.activitySessionAlerts) ? stored.activitySessionAlerts : [],
        pendingTriggers: Array.isArray(stored.pendingTriggers)
          ? stored.pendingTriggers.filter((trigger: string) =>
              !['no_water_3h', 'extreme_heat', 'weekly_summary', 'focus_slipping', 'focus_lost',
                'cognitive_decline', 'cognitive_impairment', 'focus_steady', 'cognitive_steady'].includes(trigger)
            )
          : [],
        riskAlertActive: stored.riskAlertActive === true,
        lastSignificantMotionAt:
          typeof stored.lastSignificantMotionAt === 'number' ? stored.lastSignificantMotionAt : null,
        pendingDay: typeof stored.pendingDay === 'string' ? stored.pendingDay : new Date().toISOString().slice(0, 10),
      };
    }

    private async savePersistentState(state: EnginePersistentState): Promise<void> {
      await AsyncStorage.setItem(ALERT_STATE_KEY, JSON.stringify(state));
    }
  }

  export default new NotificationEngine();
