import React from 'react';
import GlassCard from '../shared/GlassCard';

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel: string;
  icon: React.ReactNode;
  trend?: string;
  color?: string;
  iconColor?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, sublabel, icon, trend, color = 'text-cyan-400', iconColor }) => {
  return (
    <GlassCard className="group !bg-white !border !border-slate-200 !shadow-sm !rounded-2xl !p-5 min-h-[160px] h-full flex flex-col justify-between">
      <div className="flex justify-between items-start">
        <div className={`${iconColor || color} transition-colors`}>
          {icon}
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-[11px] uppercase font-medium tracking-wide ${color}`}>{label}</span>
          {trend && (
            <div className="flex items-center gap-1 mt-1 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
              <span className="text-[10px] text-emerald-600 font-bold">{trend}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center py-1.5">
        <h3 className="text-3xl font-black text-slate-900 tracking-tight">{value}</h3>
      </div>

      <div className="mt-auto">
        <p className="text-[10px] text-slate-500 mt-1 font-medium whitespace-nowrap">{sublabel}</p>
      </div>
    </GlassCard>
  );
};

export default StatCard;
