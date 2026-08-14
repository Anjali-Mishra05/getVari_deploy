import React from 'react';
import GlassCard from '../shared/GlassCard';

interface HydrationHeatmapProps {
  data: { date: string; performance: number }[]; // performance 0-100
  loading?: boolean;
}

const HydrationHeatmap: React.FC<HydrationHeatmapProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <GlassCard className="h-[300px] flex items-center justify-center">
        <div className="animate-pulse text-slate-400 font-mono text-[10px]">GENERATING CALENDAR MAP...</div>
      </GlassCard>
    );
  }

  // Legend categories
  const legend = [
    { label: '<50%', color: 'bg-red-500' },
    { label: '50-74%', color: 'bg-orange-400' },
    { label: '75-99%', color: 'bg-yellow-400' },
    { label: '100-124%', color: 'bg-emerald-400' },
    { label: '>=125%', color: 'bg-blue-500' },
  ];

  const getColor = (perf: number) => {
    if (perf < 50) return 'bg-red-500';
    if (perf < 75) return 'bg-orange-400';
    if (perf < 100) return 'bg-yellow-400';
    if (perf < 125) return 'bg-emerald-400';
    return 'bg-blue-500';
  };

  // Create a 28-day grid (4 weeks) for demo purposes, filled with real data where available
  const grid = Array.from({ length: 28 }).map((_, i) => {
    const dayData = data[data.length - 28 + i];
    return dayData || { date: '', performance: 0, placeholder: true };
  });

  return (
    <GlassCard className="space-y-4 h-[300px]">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Hydration Consistency</h3>

      <div className="grid grid-cols-7 gap-2 px-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
          <div key={d} className="text-[8px] font-black text-slate-300 text-center">{d}</div>
        ))}
        {grid.map((d, i) => (
          <div
            key={i}
            title={d.date ? `${d.date}: ${Math.round(d.performance)}%` : 'No Data'}
            className={`aspect-square rounded-md transition-all duration-300 hover:scale-110 cursor-help ${
              (d as any).placeholder ? 'bg-slate-100' : getColor(d.performance)
            }`}
          />
        ))}
      </div>

      <div className="flex justify-center gap-4 flex-wrap px-4">
        {legend.map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded ${item.color}`} />
            <span className="text-[8px] font-bold text-slate-400 font-mono uppercase">{item.label}</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-neutral-500 leading-relaxed text-center italic font-medium px-4">
        Longitudinal consistency map highlighting periods of optimal and suboptimal hydration.
      </p>
    </GlassCard>
  );
};

export default HydrationHeatmap;
