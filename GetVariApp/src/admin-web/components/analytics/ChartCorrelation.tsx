import React from 'react';
import GlassCard from '../shared/GlassCard';
import { User } from '../../types';

interface ChartCorrelationProps {
  users: User[];
  loading?: boolean;
}

const ChartCorrelation: React.FC<ChartCorrelationProps> = ({ users, loading }) => {
  const points = users.map(u => ({
    label: u.name,
    // X-axis: Intake % of goal (0-100%)
    x: `${Math.min(100, (u.waterIntakeMl / u.targetDailyMl) * 100)}%`,
    // Y-axis: Risk Score (0-100%, bottom is 0, so risk 80 is 80% from bottom)
    y: `${u.riskScore}%`,
    color: u.status === 'Critical' ? 'bg-red-500' :
           u.status === 'High Risk' ? 'bg-orange-400' :
           u.status === 'Mild Risk' ? 'bg-yellow-400' : 'bg-emerald-400'
  }));

  return (
    <GlassCard className="space-y-6 h-full flex flex-col">
      <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Intake vs Risk Correlation</h3>

      <div className="h-48 border-l border-b border-slate-200 relative mx-4 mt-10">
        <span className="absolute bottom-[-24px] left-0 text-[10px] text-slate-400 uppercase font-mono font-black tracking-widest whitespace-nowrap">Low Intake</span>
        <span className="absolute bottom-[-24px] right-0 text-[10px] text-slate-400 uppercase font-mono font-black tracking-widest whitespace-nowrap">High Intake</span>
        <span className="absolute top-0 left-[-45px] text-[10px] text-red-500 uppercase font-mono font-black tracking-widest rotate-[-90deg] origin-top-right">High Risk</span>

        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-mono text-slate-300 animate-pulse uppercase">Syncing Plot Points...</span>
          </div>
        ) : points.map((p, i) => (
          <div
            key={i}
            className={`absolute w-3.5 h-3.5 rounded-full ${p.color} transition-all duration-500 hover:scale-150 hover:shadow-[0_0_10px_rgba(0,0,0,0.1)] cursor-help group`}
            style={{ bottom: p.y, left: p.x }}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-[10px] font-mono text-white opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 pointer-events-none transition-opacity font-bold uppercase tracking-widest">
              {p.label}: {p.y} Risk
            </div>
            {(p.color === 'bg-red-500' || p.color === 'bg-orange-400') && (
              <div className={`absolute inset-0 rounded-full ${p.color} animate-ping opacity-30`}></div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed text-center italic font-medium px-4 mt-auto">
        Live correlation between daily fluid ingestion volume and real-time physiological risk indices.
      </p>
    </GlassCard>
  );
};

export default ChartCorrelation;
