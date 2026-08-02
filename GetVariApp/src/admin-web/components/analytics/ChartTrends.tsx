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
    <GlassCard className="space-y-6">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Hourly Intake Volume</h3>

      <div className="flex items-end justify-between h-48 gap-3 pt-10 border-b border-white/10 px-4">
        {data.map(h => (
          <div key={h.hr} className="flex-1 flex flex-col items-center gap-3 h-full justify-end group">
            <span className="text-[8px] font-mono font-bold text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">{h.vol}</span>
            <div
              className="bg-cyan-500/40 w-full rounded-t-xl transition-all duration-300 group-hover:bg-cyan-500 group-hover:shadow-[0_0_20px_rgba(6,182,212,0.3)]"
              style={{ height: h.pct }}
            ></div>
            <span className="text-[9px] font-mono font-bold text-neutral-500 group-hover:text-white transition-colors">{h.hr}</span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-neutral-500 leading-relaxed text-center italic font-medium px-4">
        Fleet-wide fluid ingestion spikes consistently during mid-morning operational cycles between 09:00 and 11:00.
      </p>
    </GlassCard>
  );
};

export default ChartTrends;
