import React from 'react';
import { ShieldAlert, Droplets, Clock } from 'lucide-react';
import AlertCategory from '../components/alerts/AlertCategory';
import BroadcastNotificationCard from '../components/alerts/BroadcastNotificationCard';
import useAdminUsers from '../hooks/useAdminUsers';
import DataStatus from '../components/shared/DataStatus';

const AlertsPage: React.FC = () => {
  const { users, loading, error, loadedAt, refresh } = useAdminUsers();

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

  // The app sends no wearable heartbeat, so "quiet" is the most the panel can
  // say: no profile save and no logged entry for an hour.
  const offlineAlerts = users
    .filter(u => u.lastSyncedMinutes === null || u.lastSyncedMinutes >= 60)
    .map(u => ({
      id: `off_${u.id}`,
      user: u.name,
      score: 'QUIET',
      desc: `No logged water or profile change in the last hour.`,
      time: u.lastSynced
    }));

  if (loading && loadedAt === null) {
    return (
      <DataStatus loading loadingLabel="MONITORING FLEET ANOMALIES..." error={null} loadedAt={null} onRefresh={refresh} />
    );
  }

  return (
    <>
    <DataStatus
      loading={loading}
      loadingLabel="MONITORING FLEET ANOMALIES..."
      error={error}
      loadedAt={loadedAt}
      onRefresh={refresh}
    />
    <BroadcastNotificationCard />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
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
        title="No Recent Activity"
        icon={<Clock size={16} />}
        color="neutral"
        alerts={offlineAlerts}
      />
    </div>
    </>
  );
};


export default AlertsPage;
