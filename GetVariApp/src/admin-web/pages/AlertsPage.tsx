import React from 'react';
import { ShieldAlert, Droplets, Clock } from 'lucide-react';
import AlertCategory from '../components/alerts/AlertCategory';
import { mockUsers } from '../data/mockData';

const AlertsPage: React.FC = () => {
  const criticalAlerts = mockUsers
    .filter(u => u.riskScore >= 75)
    .map(u => ({
      id: `crit_${u.id}`,
      user: u.name,
      score: `${u.riskScore}/100`,
      desc: `Severe physiological strain. BPM: ${u.heartRate}. Immediately hydrate.`
    }));

  const deficitAlerts = mockUsers
    .filter(u => u.waterIntakeMl < 400 && u.activityLoad > 40)
    .map(u => ({
      id: `def_${u.id}`,
      user: u.name,
      score: `${u.waterIntakeMl}ML`,
      desc: `Hydration target deficit detected for ${u.workload} workload.`
    }));

  const offlineAlerts = mockUsers
    .filter(u => u.lastSyncedMinutes >= 15)
    .map(u => ({
      id: `off_${u.id}`,
      user: u.name,
      score: 'OFFLINE',
      desc: `Wearable sync lost. No telemetry received for ${u.lastSynced}.`,
      time: u.lastSynced
    }));

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
