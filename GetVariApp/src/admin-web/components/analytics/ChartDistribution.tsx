import React from 'react';
import GlassCard from '../shared/GlassCard';

const ChartDistribution: React.FC = () => {
  return (
    <GlassCard className="space-y-6 h-full flex flex-col">
      <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Hydration Risk Distribution</h3>

      <div className="flex items-end justify-between h-48 gap-5 pt-12 border-b border-slate-100 px-4 relative">
        <div className="absolute left-0 top-0 text-[10px] font-mono text-slate-400 uppercase border-l border-slate-200 pl-3 font-bold tracking-widest">Users Count</div>

        <div className="flex-1 flex flex-col items-center gap-4 h-full justify-end group">
          <div className="bg-emerald-500 w-full rounded-t-xl transition-all duration-300 group-hover:brightness-125 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] shadow-[0_0_15px_rgba(16,185,129,0.15)]" style={{ height: '35%' }}></div>
          <span className="text-[11px] font-mono font-bold text-neutral-500 group-hover:text-emerald-400 transition-colors uppercase">Hydrated</span>
        </div>

        <div className="flex-1 flex flex-col items-center gap-4 h-full justify-end group">
          <div className="bg-yellow-500 w-full rounded-t-xl transition-all duration-300 group-hover:brightness-125 group-hover:shadow-[0_0_20px_rgba(234,179,8,0.3)] shadow-[0_0_15px_rgba(234,179,8,0.15)]" style={{ height: '25%' }}></div>
          <span className="text-[11px] font-mono font-bold text-neutral-500 group-hover:text-yellow-400 transition-colors uppercase">Mild</span>
        </div>

        <div className="flex-1 flex flex-col items-center gap-4 h-full justify-end group">
          <div className="bg-orange-500 w-full rounded-t-xl transition-all duration-300 group-hover:brightness-125 group-hover:shadow-[0_0_20px_rgba(249,115,22,0.3)] shadow-[0_0_15px_rgba(249,115,22,0.15)]" style={{ height: '20%' }}></div>
          <span className="text-[11px] font-mono font-bold text-neutral-500 group-hover:text-orange-400 transition-colors uppercase">High</span>
        </div>

        <div className="flex-1 flex flex-col items-center gap-4 h-full justify-end group">
          <div className="bg-red-500 w-full rounded-t-xl animate-pulse transition-all duration-300 group-hover:brightness-125 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] shadow-[0_0_15px_rgba(239,68,68,0.15)]" style={{ height: '20%' }}></div>
          <span className="text-[11px] font-mono font-bold text-neutral-500 group-hover:text-red-400 transition-colors uppercase">Critical</span>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed text-center italic font-medium px-4 mt-auto">
        Fleet status shows a cluster of hydrated office profiles and high-risk field workout groups.
      </p>
    </GlassCard>
  );
};

export default ChartDistribution;
