import React, { useEffect, useState } from 'react';
import { ShieldAlert, Droplets, Clock } from 'lucide-react';
import AlertCategory from '../components/alerts/AlertCategory';
import { User } from '../types';
import { SupabaseAdminService } from '../services/SupabaseAdminService';

const AlertsPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const data = await SupabaseAdminService.fetchAllUsers();
      setUsers(data);
      setLoading(false);
    };
    loadData();
  }, []);

  const criticalAlerts = users
    .filter(u => u.status === 'Critical')
    .map(u => ({
      id: `crit_${u.id}`,
      user: u.name,
      score: `CRITICAL`,
      desc: `Severe physiological deficit detected via hydration indexing.`
    }));

  const deficitAlerts = users
    .filter(u => u.waterIntakeMl < 300)
    .map(u => ({
      id: `def_${u.id}`,
      user: u.name,
      score: `${u.waterIntakeMl}ML`,
      desc: `Daily fluid intake is significantly below dynamic target.`
    }));

  const offlineAlerts = users
    .filter(u => u.lastSyncedMinutes >= 60)
    .map(u => ({
      id: `off_${u.id}`,
      user: u.name,
      score: 'OFFLINE',
      desc: `Wearable sync lost. No telemetry received recently.`,
      time: u.lastSynced
    }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 font-mono text-sm animate-pulse">MONITORING FLEET ANOMALIES...</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-stretch">
      <AlertCategory
        title="Critical Hazards"
        icon={<ShieldAlert size={16} className="animate-pulse" />}
        color="red"
        alerts={criticalAlerts}
      />

      <AlertCategory
        title="Intake Deficits"
        icon={<Droplets size={16} />}
        color="amber"
        alerts={deficitAlerts}
      />

      <AlertCategory
        title="Node Disconnections"
        icon={<Clock size={16} />}
        color="neutral"
        alerts={offlineAlerts}
      />
    </div>
  );
};


export default AlertsPage;
