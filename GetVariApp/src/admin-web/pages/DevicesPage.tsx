import React from 'react';
import DeviceTable from '../components/devices/DeviceTable';
import useAdminUsers from '../hooks/useAdminUsers';
import DataStatus from '../components/shared/DataStatus';

const DevicesPage: React.FC = () => {
  const { users, loading, error, loadedAt, refresh } = useAdminUsers();

  if (loading && loadedAt === null) {
    return (
      <DataStatus loading loadingLabel="SCANNING HARDWARE FLEET..." error={null} loadedAt={null} onRefresh={refresh} />
    );
  }

  return (
    <div>
      <DataStatus
        loading={loading}
        loadingLabel="SCANNING HARDWARE FLEET..."
        error={error}
        loadedAt={loadedAt}
        onRefresh={refresh}
        isEmpty={users.length === 0}
        emptyLabel="No user profiles yet."
      />
      <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-bold">
        The mobile app does not pair or register a wearable yet. Battery and signal below are the
        app's simulated sensor values for each profile, the same ones its dashboard shows.
      </div>
      <DeviceTable
        users={users}
        onUpdate={(id, name) => console.log('Updating', name)}
      />
    </div>
  );
};


export default DevicesPage;
