import React from 'react';
import { Users, Activity, Cpu, TrendingUp, AlertTriangle, Droplets } from 'lucide-react';
import StatCard from '../components/dashboard/StatCard';
import Terminal from '../components/dashboard/Terminal';
import AlertPanel from '../components/dashboard/AlertPanel';
import { mockUsers, mockLogs } from '../data/mockData';
import { Alert } from '../types';

const DashboardPage: React.FC = () => {
  const stats = {
    total: mockUsers.length,
    active: mockUsers.filter(u => u.lastSyncedMinutes < 60).length,
    connected: mockUsers.filter(u => u.lastSyncedMinutes < 120).length,
    avgRisk: Math.round(mockUsers.reduce((acc, u) => acc + u.riskScore, 0) / mockUsers.length),
    critical: mockUsers.filter(u => u.riskScore >= 75).length,
    totalWater: Math.round(mockUsers.reduce((acc, u) => acc + u.waterIntakeMl, 0) / 1000 * 10) / 10,
  };

  const alerts: Alert[] = mockUsers.reduce((acc: Alert[], u) => {
    if (u.riskScore >= 75) {
      acc.push({
        id: `alert_risk_${u.id}`,
        title: 'Critical Dehydration',
        desc: `Risk score ${u.riskScore}/100. Heart rate elevated at ${u.heartRate} bpm.`,
        user: u.name,
        type: 'critical'
      });
    }
    if (u.waterIntakeMl < 300 && u.activityLoad > 50) {
      acc.push({
        id: `alert_water_${u.id}`,
        title: 'Hydration Deficit',
        desc: `Only ${u.waterIntakeMl}ml intake despite high physical exertion.`,
        user: u.name,
        type: 'warn'
      });
    }
    return acc;
  }, []);

  return (
    <div className="space-y-10">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        <StatCard
          label="Total"
          value={stats.total}
          sublabel="Registered Users"
          icon={<Users size={20} />}
        />
        <StatCard
          label="Syncing"
          value={stats.active}
          sublabel="Active Today"
          icon={<Activity size={20} />}
          color="text-emerald-400"
          trend="+12%"
        />
        <StatCard
          label="BLE Nodes"
          value={stats.connected}
          sublabel="Linked Wearables"
          icon={<Cpu size={20} />}
          color="text-teal-400"
        />
        <StatCard
          label="Avg Risk"
          value={`${stats.avgRisk}%`}
          sublabel="Fleet Mean Index"
          icon={<TrendingUp size={20} />}
          color="text-amber-500"
        />
        <StatCard
          label="Critical"
          value={stats.critical}
          sublabel="Users at Risk"
          icon={<AlertTriangle size={20} />}
          color="text-red-500"
        />
        <StatCard
          label="Intake"
          value={`${stats.totalWater}L`}
          sublabel="Fleet Total Today"
          icon={<Droplets size={20} />}
          color="text-blue-400"
        />
      </div>

      {/* Main Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3">
          <AlertPanel
            alerts={alerts}
            onInvestigate={(name) => console.log('Investigating', name)}
          />
        </div>
        <div className="lg:col-span-2">
          <Terminal
            logs={mockLogs}
            onClear={() => console.log('Logs cleared')}
          />
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
