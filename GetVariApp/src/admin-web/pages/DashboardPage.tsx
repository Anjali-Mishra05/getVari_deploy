import React, { useState, useMemo } from 'react';
import { Users, Activity, Cpu, TrendingUp, AlertTriangle, Droplets } from 'lucide-react';
import StatCard from '../components/dashboard/StatCard';
import Terminal from '../components/dashboard/Terminal';
import AlertPanel from '../components/dashboard/AlertPanel';
import { Alert, DashboardStats, LogEntry } from '../types';
import { SupabaseAdminService } from '../services/SupabaseAdminService';
import useAdminUsers from '../hooks/useAdminUsers';
import DataStatus from '../components/shared/DataStatus';

const DashboardPage: React.FC = () => {
  const { users, loading, error, loadedAt, refresh } = useAdminUsers();
  // Entries cleared from the feed stay cleared until a newer one arrives.
  const [clearedBefore, setClearedBefore] = useState(0);

  const stats: DashboardStats = useMemo(() => {
    const fleet = SupabaseAdminService.fleetStats(users);
    const active = users.filter(u => u.lastSyncedMinutes !== null && u.lastSyncedMinutes < 60).length;
    const connected = users.filter(u => u.lastSyncedMinutes !== null && u.lastSyncedMinutes < 120).length;
    // Only users the engine could score: "Insufficient Data" is not a 0.
    const scored = users.filter(u => u.riskScore !== null);
    const avgRisk = scored.length > 0
      ? Math.round(scored.reduce((acc, u) => acc + (u.riskScore as number), 0) / scored.length)
      : 0;
    const critical = users.filter(u => u.status === 'Critical').length;
    const totalWater = Math.round(fleet.totalWaterMl / 1000 * 10) / 10;

    return { total: fleet.distinctPeople, active, connected, avgRisk, critical, totalWater, scoredCount: scored.length };
  }, [users]);

  const alerts: Alert[] = useMemo(() => {
    return users.reduce((acc: Alert[], u) => {
      if (u.status === 'Critical') {
        acc.push({
          id: `alert_risk_${u.id}`,
          title: 'Critical Dehydration',
          desc: `User has significant hydration deficit. Intake: ${u.waterIntakeMl}ml / Goal: ${u.targetDailyMl ?? '—'}ml.`,
          user: u.name,
          type: 'critical'
        });
      }
      return acc;
    }, []);
  }, [users]);

  // Today's real entries, newest first, in place of the old sample feed.
  const logs: LogEntry[] = useMemo(() => {
    return users
      .flatMap(u => u.waterHistory.map(entry => ({ user: u, entry })))
      .filter(({ entry }) => new Date(entry.timestamp).getTime() > clearedBefore)
      .sort((a, b) => b.entry.timestamp.localeCompare(a.entry.timestamp))
      .slice(0, 50)
      .map(({ user, entry }) => ({
        id: entry.id,
        time: entry.time,
        text: entry.isCorrection
          ? `${user.name} corrected intake by ${entry.amount} ml`
          : `${user.name} logged ${entry.amount} ml (${entry.source})`,
        type: entry.isCorrection ? 'warn' : 'success',
      }));
  }, [users, clearedBefore]);

  if (loading && loadedAt === null) {
    return (
      <DataStatus loading loadingLabel="SYNCING FLEET TELEMETRY..." error={null} loadedAt={null} onRefresh={refresh} />
    );
  }

  return (
    <div className="space-y-7 animate-fadeIn w-full overflow-hidden">
      <DataStatus
        loading={loading}
        loadingLabel="SYNCING FLEET TELEMETRY..."
        error={error}
        loadedAt={loadedAt}
        onRefresh={refresh}
        isEmpty={users.length === 0}
        emptyLabel="No user profiles yet."
      />
      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Fleet Size"
          value={stats.total}
          sublabel="Registered Users (by phone)"
          icon={<Users size={24} />}
          iconColor="text-slate-400"
        />
        <StatCard
          label="Recent Activity"
          value={stats.active}
          sublabel="Logged or Saved < 1h"
          icon={<Activity size={24} />}
          color="text-emerald-400"
        />
        <StatCard
          label="Active < 2h"
          value={stats.connected}
          sublabel="No Wearables Reported"
          icon={<Cpu size={24} />}
          color="text-cyan-400"
        />
        <StatCard
          label="Avg Risk"
          value={stats.scoredCount > 0 ? `${stats.avgRisk}%` : '—'}
          sublabel={`Over ${stats.scoredCount} Scored Users`}
          icon={<TrendingUp size={24} />}
          color="text-amber-400"
        />
        <StatCard
          label="Hazards"
          value={stats.critical}
          sublabel="Users at Risk"
          icon={<AlertTriangle size={24} />}
          color="text-red-400"
        />
        <StatCard
          label="Intake"
          value={`${stats.totalWater}L`}
          sublabel="Fleet Total Today"
          icon={<Droplets size={24} />}
          color="text-blue-400"
        />
      </div>

      {/* Main Panels */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-7">
          <AlertPanel
            alerts={alerts}
            onInvestigate={(name) => console.log('Investigating', name)}
          />
        </div>
        <div className="xl:col-span-5">
          <Terminal
            logs={logs}
            onClear={() => setClearedBefore(Date.now())}
          />
        </div>
      </div>
    </div>
  );
};



export default DashboardPage;
