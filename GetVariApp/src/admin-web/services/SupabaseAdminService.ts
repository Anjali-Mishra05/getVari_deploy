import { supabase } from '../../services/SupabaseClient';
import { User, RiskStatus, Workload } from '../types';

export class SupabaseAdminService {
  /**
   * Fetches all user profiles and aggregates their hydration data for today.
   */
  static async fetchAllUsers(): Promise<User[]> {
    try {
      // 1. Fetch all profiles
      const { data: profiles, error: profileError } = await supabase
        .from('getvari_profiles')
        .select('*');

      if (profileError) throw profileError;

      // 2. Fetch all logs for today
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data: logs, error: logError } = await supabase
        .from('getvari_hydration_logs')
        .select('*')
        .gte('timestamp', startOfToday.toISOString());

      if (logError) throw logError;

      // 3. Map to Admin User type
      return (profiles || []).map(p => {
        const profile = p.profile || {};
        const userLogs = (logs || []).filter(l => l.user_id === p.id);
        const waterIntakeMl = userLogs.reduce((sum, l) => sum + (l.amount_ml || 0), 0);

        const waterHistory = userLogs.map(l => ({
          time: new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          amount: l.amount_ml
        }));

        // Map activityLevel to Workload
        let workload: Workload = 'Office';
        if (profile.activityLevel === 'active' || profile.activityLevel === 'elite') workload = 'Gym';
        if (profile.activityLevel === 'moderate') workload = 'Commuter';
        // Note: Field is also a valid workload, but we don't have a direct mapping from onboarding yet.

        // Determine Status based on intake vs target
        const target = profile.targetDailyMl || 2500;
        const percent = (waterIntakeMl / target) * 100;
        let status: RiskStatus = 'Critical';
        if (percent >= 100) status = 'Hydrated';
        else if (percent >= 75) status = 'Mild Risk';
        else if (percent >= 50) status = 'High Risk';

        return {
          id: p.id,
          name: profile.name || `User ${p.id.substring(0, 5)}`, // Fallback since name is not in real profile
          age: profile.age || 0,
          gender: profile.gender || 'Unknown',
          weightKg: profile.weightKg || 0,
          workload,
          heartRate: 0, // Not persisted
          activityLoad: 0, // Not persisted
          temperature: 0, // Not persisted
          humidity: 0, // Not persisted
          sweatGSR: 0, // Not persisted
          batteryLevel: 0, // Not persisted
          rssi: 0, // Not persisted
          firmwareVersion: 'v1.0.0',
          lastSynced: p.updated_at ? new Date(p.updated_at).toLocaleDateString() : 'Never',
          lastSyncedMinutes: p.updated_at ? Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 60000) : 9999,
          riskScore: 0, // Not persisted
          status,
          waterIntakeMl,
          targetDailyMl: target,
          riskHistory: [],
          waterHistory,
          phone: p.phone_number || undefined
        };
      });
    } catch (error) {
      console.error('[SupabaseAdminService] Error fetching users:', error);
      return [];
    }
  }

  /**
   * Fetches all hydration logs for analytics.
   */
  static async fetchAllHydrationLogs() {
    try {
      const { data, error } = await supabase
        .from('getvari_hydration_logs')
        .select('*')
        .order('timestamp', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[SupabaseAdminService] Error fetching hydration logs:', error);
      return [];
    }
  }

  /**
   * Fetches all devices.
   */
  static async fetchAllDevices() {
    try {
      const { data, error } = await supabase
        .from('getvari_devices')
        .select('*');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[SupabaseAdminService] Error fetching devices:', error);
      return [];
    }
  }
}
