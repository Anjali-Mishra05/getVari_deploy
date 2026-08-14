import React from 'react';
import GlassCard from '../shared/GlassCard';

const ChartDistribution: React.FC = () => {
  return (
    <GlassCard className="space-y-6">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Hydration Risk Distribution</h3>

      <div className="flex items-end justify-between h-48 gap-4 pt-10 border-b border-slate-100 px-4 relative">
        <div className="absolute left-0 top-0 text-[8px] font-mono text-slate-400 uppercase border-l border-slate-200 pl-2 font-bold tracking-widest">Users Count</div>

        <div className="flex-1 flex flex-col items-center gap-3 h-full justify-end group">
          <div className="bg-emerald-500 w-full rounded-t-xl transition-all duration-300 group-hover:brightness-125 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]" style={{ height: '35%' }}></div>
          <span className="text-[9px] font-mono font-bold text-neutral-500 group-hover:text-emerald-400 transition-colors uppercase">Hydrated</span>
        </div>

        <div className="flex-1 flex flex-col items-center gap-3 h-full justify-end group">
          <div className="bg-yellow-500 w-full rounded-t-xl transition-all duration-300 group-hover:brightness-125 group-hover:shadow-[0_0_20px_rgba(234,179,8,0.3)]" style={{ height: '25%' }}></div>
          <span className="text-[9px] font-mono font-bold text-neutral-500 group-hover:text-yellow-400 transition-colors uppercase">Mild</span>
        </div>

        <div className="flex-1 flex flex-col items-center gap-3 h-full justify-end group">
          <div className="bg-orange-500 w-full rounded-t-xl transition-all duration-300 group-hover:brightness-125 group-hover:shadow-[0_0_20px_rgba(249,115,22,0.3)]" style={{ height: '20%' }}></div>
          <span className="text-[9px] font-mono font-bold text-neutral-500 group-hover:text-orange-400 transition-colors uppercase">High</span>
        </div>

        <div className="flex-1 flex flex-col items-center gap-3 h-full justify-end group">
          <div className="bg-red-500 w-full rounded-t-xl animate-pulse transition-all duration-300 group-hover:brightness-125 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]" style={{ height: '20%' }}></div>
          <span className="text-[9px] font-mono font-bold text-neutral-500 group-hover:text-red-400 transition-colors uppercase">Critical</span>
        </div>
      </div>

      <p className="text-[11px] text-neutral-500 leading-relaxed text-center italic font-medium px-4">
        Fleet status shows a high concentration of optimal hydration in office cohorts, while field workers trend towards critical.
      </p>
    </GlassCard>
  );
};

export default ChartDistribution;
