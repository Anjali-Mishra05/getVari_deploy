import React, { useEffect, useState } from 'react';
import ChartDistribution from '../components/analytics/ChartDistribution';
import ChartTrends from '../components/analytics/ChartTrends';
import ChartCorrelation from '../components/analytics/ChartCorrelation';
import { SupabaseAdminService } from '../services/SupabaseAdminService';
import { User } from '../types';

const AnalyticsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const [_, userData] = await Promise.all([
        SupabaseAdminService.fetchAllHydrationLogs(),
        SupabaseAdminService.fetchAllUsers()
      ]);
      setUsers(userData);
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
        <ChartCorrelation users={users} loading={loading} />
      </div>
    </div>
  );
};

export default AnalyticsPage;
