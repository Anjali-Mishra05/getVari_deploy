import { AuthService } from './AuthService';
import HydrationService from './HydrationService';
import ProfileService from './ProfileService';
import TelemetryHistoryService from './TelemetryHistoryService';
import { HydrationRiskEngine } from '../utils/hydrationRiskEngine';
import type { ReminderFacts } from '../utils/reminderContent';

/**
 * What is true about the user at the moment a reminder fires.
 *
 * ## Why this is its own module
 *
 * `NotificationService` is what posts the reminder, and it is where this
 * naturally wanted to live — but the profile, the hydration log and the
 * telemetry history all already import `NotificationService`, so reading them
 * from inside it closes an import cycle. Under Metro a cycle hands one side a
 * half-initialised module, and the side that would have lost is the background
 * event handler: a silent `undefined is not a function` in a context with no
 * screen to report it on. The dependency points one way instead, and the facts
 * are handed to the notification layer rather than fetched by it.
 *
 * ## Why it is gathered at delivery and not at scheduling
 *
 * Reminders are queued as one-shot alarms a full day ahead, and Notifee bakes
 * the notification's text in when it queues. Anything specific written then is
 * stale when it fires — and a risk score from yesterday morning shown at nine
 * tonight is not a stale detail but a wrong number on a health notification,
 * which the user has no way to check.
 */

/**
 * Every source is caught on its own.
 *
 * A reminder is already on the user's screen by the time this runs, so nothing
 * here may throw. Just as important, one failure must not take the others with
 * it: a Supabase read that times out should cost the reminder its progress
 * line, not its risk line. Each field stays absent rather than wrong, and
 * `buildReminderContent` omits the line for anything absent.
 */
export const gatherReminderFacts = async (userId?: string | null): Promise<ReminderFacts> => {
  const facts: ReminderFacts = {};

  const id = userId ?? (await AuthService.getCurrentUserId().catch(() => null));
  if (!id) return facts;

  try {
    const totals = await HydrationService.getTodayTotals(id);
    facts.totalMl = totals.totalMl;
    // `null` here is a fluid-restricted profile with no physician limit on
    // file. It is carried through as null so the reminder states the total
    // without measuring it against a goal the app refuses to invent.
    facts.targetMl = totals.targetMl;
  } catch (error) {
    console.warn('[Reminders] Could not read today’s totals:', error);
  }

  let hoursSinceDrink: number | null = null;
  try {
    const logs = await HydrationService.fetchTodayLogs(id);
    // `reportedAt` is when the user says they drank, which is the gap that
    // matters physiologically; `timestamp` is only when the row was written.
    // They differ whenever someone logs a glass they had an hour ago.
    const lastAt = logs
      .map(log => Date.parse(log.reportedAt ?? log.timestamp))
      .filter(at => Number.isFinite(at))
      .reduce((latest, at) => Math.max(latest, at), 0);

    if (lastAt > 0) {
      hoursSinceDrink = Math.max(0, (Date.now() - lastAt) / 3600000);
      facts.hoursSinceDrink = hoursSinceDrink;
    }
  } catch (error) {
    console.warn('[Reminders] Could not read the last drink time:', error);
  }

  /**
   * The risk score, through the same "Missing != Zero" path the dashboard uses
   * when the wearable is quiet.
   *
   * A background handler has no live sensor stream — the BLE link is down and
   * the telemetry hook only runs in the foreground — so the engine is given
   * nulls for the four device channels and falls back to its own 7-day
   * averages. The time channel, the one with no fallback and the one a
   * hydration reminder is actually about, is computed fresh above.
   *
   * Where that is not enough the engine returns a null score as "Insufficient
   * Data", and a null score prints nothing at all. That is the whole guard
   * against putting an invented number on a health notification.
   */
  try {
    const profile = await ProfileService.fetchProfile(id);
    if (profile) {
      const averages = await TelemetryHistoryService.getAverages(7, id, profile);
      const risk = HydrationRiskEngine.solveRisk(
        {
          heartRate: null,
          activityLoad: null,
          temperature: null,
          humidity: null,
          timeSinceWaterIntake: hoursSinceDrink,
        },
        profile,
        averages
      );
      if (typeof risk.score === 'number' && Number.isFinite(risk.score)) {
        facts.riskScore = risk.score;
        facts.riskStatus = risk.status;
      }
    }
  } catch (error) {
    console.warn('[Reminders] Could not solve risk for the reminder:', error);
  }

  return facts;
};

export const ReminderFactsService = { gatherReminderFacts };

export default ReminderFactsService;
