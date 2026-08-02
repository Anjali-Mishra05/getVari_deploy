import React from 'react';
import GlassCard from '../shared/GlassCard';

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel: string;
  icon: React.ReactNode;
  trend?: string;
  color?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, sublabel, icon, trend, color = 'text-cyan-400' }) => {
  return (
    <GlassCard className="group">
      <div className="flex justify-between items-start">
        <div className={`p-2 bg-neutral-900/60 rounded-xl border border-white/5 transition-colors group-hover:border-cyan-500/30 ${color}`}>
          {icon}
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-[10px] uppercase font-mono font-bold tracking-widest ${color}`}>{label}</span>
          {trend && <span className="text-[10px] text-emerald-400 font-mono mt-1">{trend}</span>}
        </div>
      </div>
      <h3 className="text-4xl font-black text-white mt-4 tracking-tighter">{value}</h3>
      <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-wider font-bold">{sublabel}</p>
    </GlassCard>
  );
};

export default StatCard;
