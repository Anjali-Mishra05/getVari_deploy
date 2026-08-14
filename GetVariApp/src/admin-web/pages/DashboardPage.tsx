import React, { useEffect, useState, useMemo } from 'react';
import { Users, Activity, Cpu, TrendingUp, AlertTriangle, Droplets } from 'lucide-react';
import StatCard from '../components/dashboard/StatCard';
import Terminal from '../components/dashboard/Terminal';
import AlertPanel from '../components/dashboard/AlertPanel';
import { mockLogs } from '../data/mockData';
import { Alert, User, DashboardStats } from '../types';
import { SupabaseAdminService } from '../services/SupabaseAdminService';

const DashboardPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState(mockLogs);

  useEffect(() => {
    const loadData = async () => {
      const data = await SupabaseAdminService.fetchAllUsers();
      setUsers(data);
      setLoading(false);
    };
    loadData();
  }, []);

  const stats: DashboardStats = useMemo(() => {
    if (users.length === 0) return { total: 0, active: 0, connected: 0, avgRisk: 0, critical: 0, totalWater: 0 };

    const total = users.length;
    const active = users.filter(u => u.lastSyncedMinutes < 60).length;
    const connected = users.filter(u => u.lastSyncedMinutes < 120).length;
    const avgRisk = 0; // Not persisted in DB
    const critical = users.filter(u => u.status === 'Critical').length;
    const totalWater = Math.round(users.reduce((acc, u) => acc + u.waterIntakeMl, 0) / 1000 * 10) / 10;

    return { total, active, connected, avgRisk, critical, totalWater };
  }, [users]);

  const alerts: Alert[] = useMemo(() => {
    return users.reduce((acc: Alert[], u) => {
      if (u.status === 'Critical') {
        acc.push({
          id: `alert_risk_${u.id}`,
          title: 'Critical Dehydration',
          desc: `User has significant hydration deficit. Intake: ${u.waterIntakeMl}ml / Goal: ${u.targetDailyMl}ml.`,
          user: u.name,
          type: 'critical'
        });
      }
      return acc;
    }, []);
  }, [users]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 font-mono text-sm animate-pulse">SYNCING FLEET TELEMETRY...</div>
      </div>
    );
  }

  return (
    <div className="space-y-7 animate-fadeIn">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Fleet Size"
          value={stats.total}
          sublabel="Registered Users"
          icon={<Users size={24} />}
          iconColor="text-slate-400"
        />
        <StatCard
          label="Live Sync"
          value={stats.active}
          sublabel="Active Today"
          icon={<Activity size={24} />}
          color="text-emerald-400"
        />
        <StatCard
          label="Hardware"
          value={stats.connected}
          sublabel="Linked Wearables"
          icon={<Cpu size={24} />}
          color="text-cyan-400"
        />
        <StatCard
          label="Avg Risk"
          value={`--%`}
          sublabel="Historical Data Not Persisted"
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
            onClear={() => setLogs([])}
          />
        </div>
      </div>
    </div>
  );
};



export default DashboardPage;
