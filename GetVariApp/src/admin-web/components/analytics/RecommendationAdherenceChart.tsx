import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import GlassCard from '../shared/GlassCard';

interface RecommendationAdherenceChartProps {
  data: { category: string; given: number; followed: number }[];
  loading?: boolean;
}

const RecommendationAdherenceChart: React.FC<RecommendationAdherenceChartProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <GlassCard className="h-80 flex items-center justify-center">
        <div className="animate-pulse text-slate-400 font-mono text-[10px]">EVALUATING AI ADHERENCE...</div>
      </GlassCard>
    );
  }

  const hasData = data.length > 0;

  return (
    <GlassCard className="space-y-6">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">AI Recommendations Given vs Followed</h3>

      <div className="h-64 w-full relative">
        {!hasData && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/50 backdrop-blur-[1px] rounded-xl">
             <div className="text-slate-400 font-mono text-[10px] font-black tracking-widest uppercase">No AI Data Available</div>
             <div className="text-slate-400 font-mono text-[8px] mt-2 italic px-8 text-center uppercase">AI Recommendations are currently ephemeral and not logged to Supabase.</div>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="category"
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
            <Bar name="Given" dataKey="given" fill="#a78bfa" radius={[4, 4, 0, 0]} />
            <Bar name="Followed" dataKey="followed" fill="#c084fc" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-neutral-500 leading-relaxed text-center italic font-medium px-4">
        Assessment of user compliance with AI-generated hydration and recovery prescriptions.
      </p>
    </GlassCard>
  );
};

export default RecommendationAdherenceChart;
