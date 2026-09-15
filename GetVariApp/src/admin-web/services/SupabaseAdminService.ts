import { supabase } from '../../services/SupabaseClient';
import { User, RiskStatus, Workload } from '../types';
import MockTelemetryService from '../../services/MockTelemetryService';
import { HydrationRiskEngine } from '../../utils/hydrationRiskEngine';

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

      // 2. Fetch all logs for today (Since Midnight Local Time)
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

        const mockTelemetry = MockTelemetryService.getMockPrimaryTelemetry(p.id);

        // 2. Calculate Time Since Last Drink (REAL)
        let hoursSinceDrink: number | null = null;
        if (userLogs.length > 0) {
          const newest = userLogs.reduce((latest, log) =>
            new Date(log.timestamp) > new Date(latest.timestamp) ? log : latest
          );
          hoursSinceDrink = (Date.now() - new Date(newest.timestamp).getTime()) / 3_600_000;
          hoursSinceDrink = Math.max(0, Math.min(8, hoursSinceDrink));
        }

        // 3. Calculate Risk Score via Engine
        const engineResult = HydrationRiskEngine.solveRisk({
          heartRate: mockTelemetry.heartRate,
          activityLoad: mockTelemetry.activityLoad,
          temperature: mockTelemetry.temperature,
          humidity: mockTelemetry.humidity,
          timeSinceWaterIntake: hoursSinceDrink
        }, profile);

        const waterHistory = userLogs.map(l => ({
          time: new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          amount: l.amount_ml
        }));

        // Map activityLevel to Workload
        let workload: Workload = 'Office';
        if (profile.activityLevel === 'active' || profile.activityLevel === 'elite') workload = 'Gym';
        if (profile.activityLevel === 'moderate') workload = 'Commuter';

        const target = profile.targetDailyMl || 2500;

        // Use the Engine's status for the dashboard
        const status: RiskStatus = engineResult.status;

        // 4. Activity Tracking Fix: Use newest of profile update or latest log
        const profileSync = p.updated_at ? new Date(p.updated_at).getTime() : 0;
        const lastLogAt = userLogs.length > 0
          ? new Date(userLogs.reduce((latest, l) => l.timestamp > latest.timestamp ? l : latest).timestamp).getTime()
          : 0;
        const lastActiveTime = Math.max(profileSync, lastLogAt);
        const lastSyncedMinutes = lastActiveTime > 0
          ? Math.floor((Date.now() - lastActiveTime) / 60000)
          : 9999;

        // 5. Generate Deterministic Risk History (T-6 to T-0)
        const riskHistory: number[] = [];
        const nowMs = Date.now();
        for (let i = 6; i >= 0; i--) {
          const pointTime = nowMs - i * 3600000;
          const logsBeforePoint = userLogs.filter(l => new Date(l.timestamp).getTime() <= pointTime);

          let hoursSince = 2.0 + i; // Baseline + hours ago if no logs
          if (logsBeforePoint.length > 0) {
            const newest = logsBeforePoint.reduce((latest, log) =>
              new Date(log.timestamp) > new Date(latest.timestamp) ? log : latest
            );
            hoursSince = (pointTime - new Date(newest.timestamp).getTime()) / 3_600_000;
          }

          // Simplified history: use same mock telemetry but different timeSince
          const historyRisk = HydrationRiskEngine.solveRisk({
            ...mockTelemetry,
            timeSinceWaterIntake: Math.max(0, Math.min(8, hoursSince))
          }, profile);

          riskHistory.push(historyRisk.score ?? 0);
        }

        return {
          id: p.id,
          name: profile.fullName || profile.name || `User ${p.id.substring(0, 5)}`,
          email: profile.email,
          age: profile.age || 0,
          gender: profile.gender || 'Unknown',
          weightKg: profile.weightKg || 0,
          workload,
          heartRate: mockTelemetry.heartRate ?? 0,
          activityLoad: mockTelemetry.activityLoad ?? 0,
          temperature: mockTelemetry.temperature ?? 0,
          humidity: mockTelemetry.humidity ?? 0,
          batteryLevel: mockTelemetry.batteryLevel ?? 0,
          rssi: mockTelemetry.rssi ?? 0,
          firmwareVersion: 'v1.0.0',
          lastSynced: lastActiveTime > 0 ? new Date(lastActiveTime).toLocaleDateString() : 'Never',
          lastSyncedMinutes,
          riskScore: engineResult.score ?? 0,
          status,
          waterIntakeMl,
          targetDailyMl: target,
          riskHistory,
          waterHistory,
          phone: p.phone_number || undefined,
          fullProfile: profile,
        };
      });
    } catch (error) {
      console.error('[SupabaseAdminService] Error fetching users:', error);
      return [];
    }
  }

  /**
   * Fetches fleet-wide stats for today, including users who may not have profiles yet.
   */
  static async fetchFleetStats(): Promise<{ totalWaterMl: number; totalUsers: number }> {
    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [logsResponse, profilesResponse] = await Promise.all([
        supabase
          .from('getvari_hydration_logs')
          .select('amount_ml')
          .gte('timestamp', startOfToday.toISOString()),
        supabase
          .from('getvari_profiles')
          .select('id', { count: 'exact', head: true })
      ]);

      const totalWaterMl = (logsResponse.data || []).reduce((sum, l) => sum + (l.amount_ml || 0), 0);
      const totalUsers = profilesResponse.count || 0;

      return { totalWaterMl, totalUsers };
    } catch (error) {
      console.error('[SupabaseAdminService] Error fetching fleet stats:', error);
      return { totalWaterMl: 0, totalUsers: 0 };
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
