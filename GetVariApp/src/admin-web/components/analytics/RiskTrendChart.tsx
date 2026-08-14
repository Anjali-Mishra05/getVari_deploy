import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import GlassCard from '../shared/GlassCard';

interface RiskTrendChartProps {
  data: { date: string; avgRisk: number }[];
  loading?: boolean;
}

const RiskTrendChart: React.FC<RiskTrendChartProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <GlassCard className="h-80 flex items-center justify-center">
        <div className="animate-pulse text-slate-400 font-mono text-[10px]">TRACKING RISK VECTOR...</div>
      </GlassCard>
    );
  }

  const hasData = data.length > 0;

  return (
    <GlassCard className="space-y-6">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Risk Trend Over Time</h3>

      <div className="h-64 w-full relative">
        {!hasData && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/50 backdrop-blur-[1px] rounded-xl">
             <div className="text-slate-400 font-mono text-[10px] font-black tracking-widest uppercase">No Risk Data Available</div>
             <div className="text-slate-400 font-mono text-[8px] mt-2 italic px-8 text-center uppercase">Historical risk scores are not currently persisted in Supabase.</div>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: 'none',
                borderRadius: '8px',
                fontSize: '10px',
                color: '#fff'
              }}
            />
            <Line
              type="monotone"
              dataKey="avgRisk"
              stroke="#f59e0b"
              strokeWidth={3}
              dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-neutral-500 leading-relaxed text-center italic font-medium px-4">
        Longitudinal tracking of average fleet-wide hydration risk parameters.
      </p>
    </GlassCard>
  );
};

export default RiskTrendChart;
