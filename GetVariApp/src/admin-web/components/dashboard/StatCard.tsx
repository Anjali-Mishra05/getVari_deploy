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

const StatCard: React.FC<StatCardProps> = ({ label, value, sublabel, icon, trend, color = 'text-blue-600' }) => {
  return (
    <GlassCard className="group">
      <div className="flex justify-between items-start">
        <div className={`p-2 bg-slate-50 rounded-xl border border-slate-100 transition-colors group-hover:border-blue-200 ${color}`}>
          {icon}
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-[10px] uppercase font-mono font-black tracking-widest ${color}`}>{label}</span>
          {trend && <span className="text-[10px] text-emerald-600 font-mono mt-1 font-bold">{trend}</span>}
        </div>
      </div>
      <h3 className="text-4xl font-black text-slate-900 mt-4 tracking-tighter">{value}</h3>
      <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">{sublabel}</p>
    </GlassCard>
  );
};

export default StatCard;
