import React from 'react';
import ChartDistribution from '../components/analytics/ChartDistribution';
import ChartTrends from '../components/analytics/ChartTrends';
import ChartCorrelation from '../components/analytics/ChartCorrelation';

const AnalyticsPage: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
      <ChartDistribution />
      <ChartTrends />
      <ChartCorrelation />
    </div>
  );
};

export default AnalyticsPage;
