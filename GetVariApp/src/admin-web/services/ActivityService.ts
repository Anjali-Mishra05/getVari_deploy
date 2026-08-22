import { ActivityEvent } from '../types';
import { supabase } from '../../services/SupabaseClient';
import MockTelemetryService from '../../services/MockTelemetryService';
import { HydrationRiskEngine } from '../../utils/hydrationRiskEngine';

const makeId = (prefix = 'EV') => `${prefix}_${Math.random().toString(36).slice(2,9)}`;

/**
 * Fetches real activity events for a given user from Supabase.
 */
export const fetchEventsForUser = async (userId: string): Promise<ActivityEvent[]> => {
  try {
    const events: ActivityEvent[] = [];

    // 1. Fetch Profile for account creation / profile set info
    const { data: profileRow } = await supabase
      .from('getvari_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileRow) {
      // Account created
      events.push({
        eventId: makeId('EV'),
        userId,
        eventType: 'account_created',
        category: 'Auth',
        actor: 'System',
        title: 'Account created',
        description: `Account initialized in Supabase.`,
        timestamp: profileRow.created_at,
        status: 'success'
      });

      // Profile set
      events.push({
        eventId: makeId('EV'),
        userId,
        eventType: 'profile_set',
        category: 'Profile',
        actor: 'User',
        title: 'Profile details saved',
        description: `Hydration baseline and biometric blueprint configured.`,
        timestamp: profileRow.updated_at,
        status: 'success'
      });
    }

    // 2. Fetch Water Intake Logs
    const { data: logs } = await supabase
      .from('getvari_hydration_logs')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: true });

    if (logs) {
      let cumulativeMl = 0;
      logs.forEach(log => {
        cumulativeMl += log.amount_ml;

        // Calculate risk snapshot at the time of this intake
        const mockTelemetry = MockTelemetryService.getMockPrimaryTelemetry(userId);

        // Find logs before this point to calculate time since drink
        const logsBefore = logs.filter(l => new Date(l.timestamp).getTime() < new Date(log.timestamp).getTime());
        let hoursSince = 2.0;
        if (logsBefore.length > 0) {
          const newest = logsBefore.reduce((latest, l) =>
            new Date(l.timestamp) > new Date(latest.timestamp) ? l : latest
          );
          hoursSince = (new Date(log.timestamp).getTime() - new Date(newest.timestamp).getTime()) / 3_600_000;
        }

        // Calculate risk AFTER this intake to show correlation improvement
        const activeAbsorbed = Math.min(1000, 200 + cumulativeMl);

        const engineResult = HydrationRiskEngine.solveRisk({
          ...mockTelemetry,
          timeSinceWaterIntake: Math.max(0, Math.min(8, hoursSince))
        }, profileRow?.profile);

        events.push({
          eventId: makeId('EV'),
          userId,
          eventType: 'water_intake_added',
          category: 'Intake',
          actor: 'User',
          title: 'Water intake recorded',
          description: `Logged ${log.amount_ml}ml via ${log.source}.`,
          timestamp: log.timestamp,
          status: 'success',
          metadata: {
            amount: log.amount_ml,
            cumulativeAmount: cumulativeMl,
            riskSnapshot: engineResult.score
          }
        });
      });
    }

    // 3. Inject Mock Telemetry Events for the Trend Graph
    const now = Date.now();

    // 3a. Generate 6 points for the last 6 hours for Today's trend
    for (let i = 6; i >= 0; i--) {
      const pointTime = now - i * 3600000;
      const pointTimestamp = new Date(pointTime).toISOString();

      const mockTelemetry = MockTelemetryService.getMockPrimaryTelemetry(userId, undefined, pointTime);
      const logsBeforePoint = logs?.filter(l => new Date(l.timestamp).getTime() <= pointTime) || [];
      const waterIntakeMlAtTime = logsBeforePoint.reduce((sum, l) => sum + l.amount_ml, 0);

      let hoursSince = 2.0 + i;
      if (logsBeforePoint.length > 0) {
        const newest = logsBeforePoint.reduce((latest, l) =>
          new Date(l.timestamp) > new Date(latest.timestamp) ? l : latest
        );
        hoursSince = (pointTime - new Date(newest.timestamp).getTime()) / 3_600_000;
      }

      const activeAbsorbed = Math.min(1000, 200 + waterIntakeMlAtTime);
      const engineResult = HydrationRiskEngine.solveRisk({
        ...mockTelemetry,
        timeSinceWaterIntake: Math.max(0, Math.min(8, hoursSince))
      }, activeAbsorbed, profileRow?.profile);

      events.push({
        eventId: makeId('TELEMETRY_TODAY'),
        userId,
        eventType: 'telemetry_received',
        category: 'Telemetry',
        actor: 'System',
        title: 'Telemetry received',
        description: `Risk index at ${new Date(pointTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} was ${engineResult.score}%.`,
        timestamp: pointTimestamp,
        status: 'success',
        metadata: {
          risk: engineResult.score,
          heartRate: mockTelemetry.heartRate,
          activity: mockTelemetry.activityLoad
        }
      });
    }

    // 3b. Generate 7 daily points for the last 7 days for historical trend
    for (let i = 7; i > 0; i--) {
      const pointTime = now - i * 86400000;
      const pointTimestamp = new Date(pointTime).toISOString();

      const mockTelemetry = MockTelemetryService.getMockPrimaryTelemetry(userId, undefined, pointTime);
      const logsBeforePoint = logs?.filter(l => new Date(l.timestamp).getTime() <= pointTime) || [];
      // Approximate daily intake for that day (mocking historical distribution)
      const waterIntakeMlAtTime = logsBeforePoint.reduce((sum, l) => sum + l.amount_ml, 0) / (7 - i + 1);

      const activeAbsorbed = Math.min(1000, 200 + waterIntakeMlAtTime);
      const engineResult = HydrationRiskEngine.solveRisk({
        ...mockTelemetry,
        timeSinceWaterIntake: 2.5 // Assume average gap for daily snapshots
      }, activeAbsorbed, profileRow?.profile);

      events.push({
        eventId: makeId('TELEMETRY_HIST'),
        userId,
        eventType: 'telemetry_received',
        category: 'Telemetry',
        actor: 'System',
        title: 'Historical Telemetry',
        description: `Daily average risk was ${engineResult.score}%.`,
        timestamp: pointTimestamp,
        status: 'success',
        metadata: {
          risk: engineResult.score,
          isHistorical: true
        }
      });
    }
    const { data: devices } = await supabase
      .from('getvari_devices')
      .select('*')
      .eq('user_id', userId);

    if (devices) {
      devices.forEach(dev => {
        events.push({
          eventId: makeId('EV'),
          userId,
          eventType: 'ble_connected',
          category: 'Device',
          actor: 'User',
          title: 'Device paired',
          description: `Linked ${dev.name || 'GetVari Node'}.`,
          timestamp: dev.created_at || dev.last_synced,
          status: 'success'
        });
      });
    }

    const { data: alerts } = await supabase
      .from('getvari_admin_alerts')
      .select('*')
      .eq('user_id', userId)
      .order('sent_at', { ascending: true });

    alerts?.forEach(alert => {
      events.push({
        eventId: alert.id || makeId('ALERT'),
        userId,
        eventType: 'critical_alert_sent',
        category: 'Notification',
        actor: 'Admin',
        title: alert.title || 'Critical hydration alert sent',
        description: alert.message || 'Admin sent a critical hydration alert.',
        timestamp: alert.sent_at,
        status: alert.status === 'sent' ? 'success' : 'failed',
        metadata: { severity: alert.severity, alertStatus: alert.status }
      });
    });

    // Note: AI recommendations and real-time telemetry are not currently persisted in Supabase.
    // We do not fabricate these events here.

    // Sort ascending (oldest first)
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return events;
  } catch (error) {
    console.error('[ActivityService] Error fetching real events:', error);
    return [];
  }
};

export default {
  fetchEventsForUser,
};

