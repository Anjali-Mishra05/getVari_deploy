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
    <GlassCard className="space-y-6">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Exertion vs Risk Vector</h3>

      <div className="h-48 border-l border-b border-slate-200 relative mx-4 mt-8">
        <span className="absolute bottom-[-20px] left-0 text-[8px] text-slate-400 uppercase font-mono font-black tracking-widest">Low Load</span>
        <span className="absolute bottom-[-20px] right-0 text-[8px] text-slate-400 uppercase font-mono font-black tracking-widest">Max Load</span>
        <span className="absolute top-0 left-[-35px] text-[8px] text-red-500 uppercase font-mono font-black tracking-widest rotate-[-90deg] origin-top-right">High Risk</span>

        {points.map((p, i) => (
          <div
            key={i}
            className={`absolute w-3 h-3 rounded-full ${p.color} transition-all duration-500 hover:scale-150 hover:shadow-[0_0_10px_rgba(0,0,0,0.1)] cursor-help group`}
            style={{ bottom: p.y, left: p.x }}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 border border-slate-800 px-2 py-1 rounded text-[8px] font-mono text-white opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 pointer-events-none transition-opacity font-bold uppercase tracking-widest">
              {p.label}
            </div>
            {(p.color === 'bg-red-500' || p.color === 'bg-orange-400') && (
              <div className={`absolute inset-0 rounded-full ${p.color} animate-ping opacity-30`}></div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-neutral-500 leading-relaxed text-center italic font-medium px-4 mt-4">
        Predictive mapping confirms a linear correlation between extreme metabolic workload and systemic dehydration risks.
      </p>
    </GlassCard>
  );
};

export default ChartCorrelation;
