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
      <GlassCard className="h-[340px] flex items-center justify-center border-slate-200 shadow-md">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-slate-400 font-bold uppercase tracking-widest text-xs">Syncing intake logs...</div>
        </div>
      </GlassCard>
    );
  }

  if (data.length === 0) {
    return (
      <GlassCard className="h-[340px] flex flex-col items-center justify-center border-slate-200 shadow-md">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
           <div className="text-slate-200 uppercase font-black text-2xl">0.0</div>
        </div>
        <div className="text-slate-500 font-bold uppercase tracking-widest text-xs">No Hydration Data</div>
        <p className="text-[11px] text-slate-400 mt-2 max-w-[200px] text-center">Verify user telemetering is active in the mobile environment.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="space-y-4 border-slate-200 shadow-md h-[340px] flex flex-col">
      <div className="space-y-1.5">
        <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-500">Fleet Water Consumption</h3>
        <p className="text-xs text-slate-400 font-medium">Daily aggregated intake across all active nodes.</p>
      </div>

      <div className="flex-1 w-full mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 10, left: -10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 12, fontWeight: 'bold' }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 12, fontWeight: 'bold' }}
              unit="ml"
            />
            <Tooltip
              cursor={{ fill: '#f8fafc', radius: 4 }}
              contentStyle={{
                backgroundColor: '#1e293b',
                border: 'none',
                borderRadius: '12px',
                padding: '16px',
                fontSize: '14px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                color: '#fff'
              }}
              itemStyle={{ fontWeight: 'bold', color: '#38bdf8' }}
              labelStyle={{ color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', fontSize: '11px', fontWeight: '900' }}
            />
            <Bar dataKey="amount" radius={[6, 6, 0, 0]} barSize={32}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.amount > 2000 ? '#2563eb' : '#60a5fa'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="pt-4 border-t border-slate-50 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
        <span>Unit: Milliliters (ml)</span>
        <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span> Fleet Mean</span>
      </div>
    </GlassCard>
  );
};


export default DailyConsumptionChart;
