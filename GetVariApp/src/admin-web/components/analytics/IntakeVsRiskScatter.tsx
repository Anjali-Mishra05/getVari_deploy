import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label } from 'recharts';
import GlassCard from '../shared/GlassCard';

interface IntakeVsRiskScatterProps {
  data: { intake: number; risk: number }[];
  loading?: boolean;
}

const IntakeVsRiskScatter: React.FC<IntakeVsRiskScatterProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <GlassCard className="h-[300px] flex items-center justify-center">
        <div className="animate-pulse text-slate-400 font-mono text-[10px]">ANALYZING CORRELATION...</div>
      </GlassCard>
    );
  }

  // Data mapping logic would go here if data existed.
  // Requirement: Do not fabricate.
  const hasData = data.length > 0;

  return (
    <GlassCard className="space-y-4 h-[300px]">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Intake vs Risk Score</h3>

      <div className="h-[210px] w-full relative">
        {!hasData && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/50 backdrop-blur-[1px] rounded-xl">
             <div className="text-slate-400 font-mono text-[10px] font-black tracking-widest uppercase">No Risk Data Available</div>
             <div className="text-slate-400 font-mono text-[8px] mt-2 italic px-8 text-center uppercase">Sensor telemetry (HR/Activity) is not currently persisted in Supabase.</div>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              type="number"
              dataKey="intake"
              name="Intake"
              unit="ml"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }}
            >
              <Label value="Water Intake (ml)" offset={-10} position="insideBottom" style={{ fill: '#64748b', fontSize: '9px', fontWeight: 'bold' }} />
            </XAxis>
            <YAxis
              type="number"
              dataKey="risk"
              name="Risk"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }}
            >
               <Label value="Risk Score" angle={-90} position="insideLeft" style={{ fill: '#64748b', fontSize: '9px', fontWeight: 'bold' }} />
            </YAxis>
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{
                backgroundColor: '#0f172a',
                border: 'none',
                borderRadius: '8px',
                fontSize: '10px',
                color: '#fff'
              }}
            />
            <Scatter name="Users" data={data} fill="#ef4444" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-neutral-500 leading-relaxed text-center italic font-medium px-4">
        Predictive mapping of fluid intake volume against systemic dehydration risk indexes.
      </p>
    </GlassCard>
  );
};

export default IntakeVsRiskScatter;
