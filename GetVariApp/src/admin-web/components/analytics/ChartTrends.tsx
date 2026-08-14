import React from 'react';
import GlassCard from '../shared/GlassCard';

const ChartTrends: React.FC = () => {
  const data = [
    { hr: '08:00', pct: '20%', vol: '1.2L' },
    { hr: '09:00', pct: '45%', vol: '2.5L' },
    { hr: '10:00', pct: '65%', vol: '3.8L' },
    { hr: '11:00', pct: '90%', vol: '5.2L' },
    { hr: '12:00', pct: '35%', vol: '2.1L' }
  ];

  return (
    <GlassCard className="space-y-6 h-full flex flex-col">
      <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Water Intake Trends (Hourly)</h3>

      <div className="flex items-end justify-between h-48 gap-4 pt-12 border-b border-slate-100 px-4">
        {data.map(h => (
          <div key={h.hr} className="flex-1 flex flex-col items-center gap-4 h-full justify-end group">
            <span className="text-[10px] font-mono font-black text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest">{h.vol}</span>
            <div
              className="bg-cyan-600/20 w-full rounded-t-xl transition-all duration-300 group-hover:bg-cyan-500 group-hover:shadow-[0_0_15px_rgba(6,182,212,0.2)]"
              style={{ height: h.pct }}
            ></div>
            <span className="text-[11px] font-mono font-bold text-slate-400 group-hover:text-slate-900 transition-colors">{h.hr}</span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed text-center italic font-medium px-4 mt-auto">
        Cumulative fluid ingestion volume spikes consistently between 09:00 and 11:00.
      </p>
    </GlassCard>
  );
};

export default ChartTrends;
