import { ActivityEvent } from '../types';
import { supabase } from '../../services/SupabaseClient';
import { steadyStateRisk } from '../../utils/appRiskModel';
import { clockForProfile, startOfUserDay, wallClockShiftMs } from '../utils/userClock';

/** PostgREST answers at most 1000 rows per request by default. */
const PAGE_SIZE = 1000;

const readAll = async (build: () => any): Promise<any[]> => {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message ?? String(error));
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
};

/**
 * A user's journey, built only from rows that exist.
 *
 * Every event is a database row the app or the panel wrote: the profile row's
 * creation and last save, each `getvari_hydration_logs` entry (corrections
 * included, shown as corrections), devices and admin messages. The app
 * persists no risk history, telemetry stream or AI recommendations, so none
 * are shown — the generated "Telemetry received" points this used to add were
 * computed from invented readings.
 *
 * Throws when the profile or the entries cannot be read, so the journey shows
 * an error instead of an empty history.
 */
export const fetchEventsForUser = async (userId: string): Promise<ActivityEvent[]> => {
  const events: ActivityEvent[] = [];

  const { data: profileRow, error: profileError } = await supabase
    .from('getvari_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  if (profileRow) {
    events.push({
      eventId: `profile_created_${userId}`,
      userId,
      eventType: 'account_created',
      category: 'Auth',
      actor: 'System',
      title: 'Account created',
      description: 'Profile row created in Supabase.',
      timestamp: profileRow.created_at,
      status: 'success',
    });
    if (profileRow.updated_at) {
      events.push({
        eventId: `profile_saved_${userId}`,
        userId,
        eventType: 'profile_set',
        category: 'Profile',
        actor: 'User',
        title: 'Profile last saved',
        description: 'The most recent save of the profile. Earlier saves are not recorded.',
        timestamp: profileRow.updated_at,
        status: 'success',
      });
    }
  }

  const logs = await readAll(() =>
    supabase
      .from('getvari_hydration_logs')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: true })
  );

  // The risk each drink answered, for the journey's "Water Intake vs Risk
  // Score" chart: the app's own solve (as the Users list and its hourly trend
  // use) at the moment of the entry, over the entries already logged that day
  // on the user's clock. Recomputed, as the app keeps no history of its score.
  const profile = profileRow?.profile ?? undefined;
  const clock = clockForProfile(profile);
  const riskBefore = (index: number): number | undefined => {
    const at = new Date(logs[index].timestamp).getTime();
    if (!Number.isFinite(at)) return undefined;
    const dayStart = startOfUserDay(clock, at);
    const earlierToday = logs.slice(0, index).filter(l => {
      const t = new Date(l.timestamp).getTime();
      return t >= dayStart && t < at;
    });
    const score = steadyStateRisk(profile, earlierToday, at, wallClockShiftMs(clock, at)).output.score;
    // "Insufficient Data" has no place on the risk axis.
    return typeof score === 'number' && Number.isFinite(score) ? score : undefined;
  };

  let cumulativeMl = 0;
  /**
   * The day's running total after each entry, on the user's clock and with
   * corrections taken off, as the app's daily total counts them. This, not the
   * all-time `cumulativeMl`, is the intake the chart plots a drink against.
   */
  let dayStartMs: number | null = null;
  let dailyTotalMl = 0;
  for (const [index, log] of logs.entries()) {
    const amount = Number(log.amount_ml) || 0;
    cumulativeMl += amount;
    const at = new Date(log.timestamp).getTime();
    const dayStart: number | null = Number.isFinite(at) ? startOfUserDay(clock, at) : dayStartMs;
    if (dayStart !== dayStartMs) {
      dayStartMs = dayStart;
      dailyTotalMl = 0;
    }
    dailyTotalMl += amount;
    const isCorrection = log.source === 'correction' || amount < 0;
    const riskSnapshot = isCorrection ? undefined : riskBefore(index);
    events.push({
      eventId: String(log.id),
      userId,
      eventType: isCorrection ? 'water_intake_corrected' : 'water_intake_added',
      category: 'Intake',
      actor: 'User',
      title: isCorrection ? 'Intake corrected' : 'Water intake recorded',
      description: isCorrection
        ? `Took back ${Math.abs(amount)} ml.`
        : `Logged ${amount} ml via ${log.source}.`,
      // The write time, which is what the app's feed and daily total use.
      timestamp: log.timestamp,
      status: 'success',
      metadata: {
        amount,
        cumulativeAmount: cumulativeMl,
        dailyTotalMl,
        source: log.source,
        reportedAt: log.reported_at ?? log.timestamp,
        verificationSource: log.verification_source,
        ...(riskSnapshot !== undefined ? { riskSnapshot } : {}),
      },
    });
  }

  // Only the web demo writes devices; a missing table is not a broken journey.
  const { data: devices, error: deviceError } = await supabase
    .from('getvari_devices')
    .select('*')
    .eq('user_id', userId);
  if (deviceError) console.warn('[ActivityService] Devices not read:', deviceError.message);
  (devices ?? []).forEach((dev: any) => {
    events.push({
      eventId: `device_${dev.device_id ?? dev.id ?? dev.created_at}`,
      userId,
      eventType: 'ble_connected',
      category: 'Device',
      actor: 'User',
      title: 'Device paired',
      description: `Linked ${dev.name || 'GetVari Node'}.`,
      timestamp: dev.created_at || dev.last_synced,
      status: 'success',
    });
  });

  const { data: alerts, error: alertError } = await supabase
    .from('getvari_admin_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('sent_at', { ascending: true });
  if (alertError) console.warn('[ActivityService] Admin messages not read:', alertError.message);
  (alerts ?? []).forEach((alert: any) => {
    const critical = alert.severity === 'critical';
    events.push({
      eventId: String(alert.id),
      userId,
      eventType: critical ? 'critical_alert_sent' : 'admin_message_sent',
      category: 'Notification',
      actor: 'Admin',
      title: alert.title || (critical ? 'Critical hydration alert sent' : 'Admin notification sent'),
      description: alert.message || '',
      timestamp: alert.sent_at,
      // "sent" is recorded when the row is written; the app does not report
      // delivery back.
      status: alert.status === 'sent' ? 'success' : 'failed',
      metadata: { severity: alert.severity, alertStatus: alert.status, delivery: 'not reported by the app' },
    });
  });

  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return events;
};

export default {
  fetchEventsForUser,
};
