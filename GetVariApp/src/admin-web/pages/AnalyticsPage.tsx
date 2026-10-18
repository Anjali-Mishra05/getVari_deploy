import React from 'react';
import ChartDistribution from '../components/analytics/ChartDistribution';
import ChartTrends from '../components/analytics/ChartTrends';
import ChartCorrelation from '../components/analytics/ChartCorrelation';
import useAdminUsers from '../hooks/useAdminUsers';
import DataStatus from '../components/shared/DataStatus';

const AnalyticsPage: React.FC = () => {
  const { users, loading, error, loadedAt, refresh } = useAdminUsers();

  if (loading && loadedAt === null) {
    return (
      <DataStatus loading loadingLabel="GENERATING BIO-ANALYTICS..." error={null} loadedAt={null} onRefresh={refresh} />
    );
  }

  return (
    <div className="space-y-12 animate-fadeIn">
      <DataStatus
        loading={loading}
        loadingLabel="GENERATING BIO-ANALYTICS..."
        error={error}
        loadedAt={loadedAt}
        onRefresh={refresh}
        isEmpty={users.length === 0}
        emptyLabel="No user profiles yet."
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <ChartDistribution users={users} />
        <ChartTrends users={users} />
        <ChartCorrelation users={users} loading={loading} />
      </div>
    </div>
  );
};

export default AnalyticsPage;
