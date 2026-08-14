import React, { useEffect, useState } from 'react';
import ChartDistribution from '../components/analytics/ChartDistribution';
import ChartTrends from '../components/analytics/ChartTrends';
import ChartCorrelation from '../components/analytics/ChartCorrelation';
import { SupabaseAdminService } from '../services/SupabaseAdminService';

const AnalyticsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([
        SupabaseAdminService.fetchAllHydrationLogs(),
        SupabaseAdminService.fetchAllUsers()
      ]);
      setLoading(false);
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 font-mono text-sm animate-pulse">GENERATING BIO-ANALYTICS...</div>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-fadeIn">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <ChartDistribution />
        <ChartTrends />
        <ChartCorrelation />
      </div>
    </div>
  );
};

export default AnalyticsPage;
