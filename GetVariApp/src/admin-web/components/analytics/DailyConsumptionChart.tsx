import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import GlassCard from '../shared/GlassCard';

interface DailyConsumptionChartProps {
  data: { date: string; amount: number }[];
  loading?: boolean;
}

const DailyConsumptionChart: React.FC<DailyConsumptionChartProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <GlassCard className="h-80 flex items-center justify-center">
        <div className="animate-pulse text-slate-400 font-mono text-[10px]">FETCHING INTAKE LOGS...</div>
      </GlassCard>
    );
  }

  if (data.length === 0) {
    return (
      <GlassCard className="h-80 flex items-center justify-center">
        <div className="text-slate-400 font-mono text-[10px]">NO HYDRATION DATA AVAILABLE</div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="space-y-6">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Daily Water Consumption</h3>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
              cursor={{ fill: '#f8fafc' }}
              contentStyle={{
                backgroundColor: '#0f172a',
                border: 'none',
                borderRadius: '8px',
                fontSize: '10px',
                color: '#fff'
              }}
            />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.amount > 2000 ? '#2563eb' : '#60a5fa'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-neutral-500 leading-relaxed text-center italic font-medium px-4">
        Visualization of fleet-wide fluid ingestion volume aggregated by date.
      </p>
    </GlassCard>
  );
};

export default DailyConsumptionChart;
