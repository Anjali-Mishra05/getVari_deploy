import React, { useEffect, useState, useMemo } from 'react';
import DailyConsumptionChart from '../components/analytics/DailyConsumptionChart';
import IntakeVsGoalChart from '../components/analytics/IntakeVsGoalChart';
import HydrationHeatmap from '../components/analytics/HydrationHeatmap';
import IntakeVsRiskScatter from '../components/analytics/IntakeVsRiskScatter';
import RiskTrendChart from '../components/analytics/RiskTrendChart';
import RecommendationAdherenceChart from '../components/analytics/RecommendationAdherenceChart';
import { SupabaseAdminService } from '../services/SupabaseAdminService';

const AnalyticsPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const [logsData, usersData] = await Promise.all([
        SupabaseAdminService.fetchAllHydrationLogs(),
        SupabaseAdminService.fetchAllUsers()
      ]);
      setLogs(logsData);
      setProfiles(usersData);
      setLoading(false);
    };
    loadData();
  }, []);

  // Aggregate data by date
  const aggregatedData = useMemo(() => {
    if (logs.length === 0) return { daily: [], goals: [], heatmap: [] };

    const dailyMap: Record<string, number> = {};
    const goalMap: Record<string, { actual: number; goal: number; count: number }> = {};

    logs.forEach(log => {
      const date = new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
      dailyMap[date] = (dailyMap[date] || 0) + log.amount_ml;

      // For goal comparison, we'd ideally need a historical goal.
      // Since we only have current profile goal, we'll use that as an average goal for the day.
      // In a real system, goals might change per day.
      if (!goalMap[date]) {
        goalMap[date] = { actual: 0, goal: 0, count: 0 };
      }
      goalMap[date].actual += log.amount_ml;
    });

    // Average goal for each day based on profiles (simplified)
    const avgGoal = profiles.length > 0
      ? profiles.reduce((sum, p) => sum + p.targetDailyMl, 0) / profiles.length
      : 2500;

    const daily = Object.entries(dailyMap).map(([date, amount]) => ({ date, amount }));
    const goals = Object.entries(goalMap).map(([date, val]) => ({
      date,
      actual: val.actual / (profiles.length || 1), // avg per user
      goal: avgGoal
    }));

    const heatmap = Object.entries(goalMap).map(([date, val]) => ({
      date,
      performance: (val.actual / (profiles.length || 1) / avgGoal) * 100
    }));

    return { daily, goals, heatmap };
  }, [logs, profiles]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
      <DailyConsumptionChart data={aggregatedData.daily} loading={loading} />
      <IntakeVsGoalChart data={aggregatedData.goals} loading={loading} />
      <HydrationHeatmap data={aggregatedData.heatmap} loading={loading} />

      {/* Graphs 4, 5, 6 show empty states as data is not persisted */}
      <IntakeVsRiskScatter data={[]} loading={loading} />
      <RiskTrendChart data={[]} loading={loading} />
      <RecommendationAdherenceChart data={[]} loading={loading} />
    </div>
  );
};


export default AnalyticsPage;
