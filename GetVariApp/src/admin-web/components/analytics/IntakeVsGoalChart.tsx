import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import GlassCard from '../shared/GlassCard';

interface IntakeVsGoalChartProps {
  data: { date: string; actual: number; goal: number }[];
  loading?: boolean;
}

const IntakeVsGoalChart: React.FC<IntakeVsGoalChartProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <GlassCard className="h-80 flex items-center justify-center">
        <div className="animate-pulse text-slate-400 font-mono text-[10px]">SYNCING TARGET METRICS...</div>
      </GlassCard>
    );
  }

  if (data.length === 0) {
    return (
      <GlassCard className="h-80 flex items-center justify-center">
        <div className="text-slate-400 font-mono text-[10px]">NO GOAL DATA AVAILABLE</div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="space-y-6">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Intake vs Daily Goal</h3>

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
              contentStyle={{
                backgroundColor: '#0f172a',
                border: 'none',
                borderRadius: '8px',
                fontSize: '10px',
                color: '#fff'
              }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.1em', paddingBottom: '20px' }}
            />
            <Bar name="Actual Intake" dataKey="actual" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar name="Recommended Goal" dataKey="goal" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-neutral-500 leading-relaxed text-center italic font-medium px-4">
        Comparative analysis of user compliance against dynamically calculated hydration targets.
      </p>
    </GlassCard>
  );
};

export default IntakeVsGoalChart;
