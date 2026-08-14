import { ActivityEvent } from '../types';
import { supabase } from '../../services/SupabaseClient';

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
      logs.forEach(log => {
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
          metadata: { amount: log.amount_ml }
        });
      });
    }

    // 3. Fetch paired devices
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

