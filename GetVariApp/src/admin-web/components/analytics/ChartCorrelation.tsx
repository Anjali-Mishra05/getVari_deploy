import React from 'react';
import GlassCard from '../shared/GlassCard';

const ChartCorrelation: React.FC = () => {
  const points = [
    { label: 'C. Dupont', x: '10%', y: '15%', color: 'bg-emerald-400' },
    { label: 'Y. Sato', x: '20%', y: '20%', color: 'bg-emerald-400' },
    { label: 'A. Rahman', x: '35%', y: '40%', color: 'bg-yellow-400' },
    { label: 'L. Gallagher', x: '50%', y: '65%', color: 'bg-orange-400' },
    { label: 'P. Vance', x: '85%', y: '85%', color: 'bg-red-500' },
    { label: 'E. Wright', x: '80%', y: '90%', color: 'bg-red-500' }
  ];

  return (
    <GlassCard className="space-y-6 h-full flex flex-col">
      <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Exertion vs Risk Correlation</h3>

      <div className="h-48 border-l border-b border-slate-200 relative mx-4 mt-10">
        <span className="absolute bottom-[-24px] left-0 text-[10px] text-slate-400 uppercase font-mono font-black tracking-widest whitespace-nowrap">Low Exertion</span>
        <span className="absolute bottom-[-24px] right-0 text-[10px] text-slate-400 uppercase font-mono font-black tracking-widest whitespace-nowrap">Extreme Load</span>
        <span className="absolute top-0 left-[-45px] text-[10px] text-red-500 uppercase font-mono font-black tracking-widest rotate-[-90deg] origin-top-right">High Risk</span>

        {points.map((p, i) => (
          <div
            key={i}
            className={`absolute w-3.5 h-3.5 rounded-full ${p.color} transition-all duration-500 hover:scale-150 hover:shadow-[0_0_10px_rgba(0,0,0,0.1)] cursor-help group`}
            style={{ bottom: p.y, left: p.x }}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-[10px] font-mono text-white opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 pointer-events-none transition-opacity font-bold uppercase tracking-widest">
              {p.label}
            </div>
            {(p.color === 'bg-red-500' || p.color === 'bg-orange-400') && (
              <div className={`absolute inset-0 rounded-full ${p.color} animate-ping opacity-30`}></div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed text-center italic font-medium px-4 mt-auto">
        Clear positive linear correlation between extreme physical exertion and critical dehydration indexes.
      </p>
    </GlassCard>
  );
};

export default ChartCorrelation;
