import React from 'react';
import { ShieldAlert, Droplets, Clock } from 'lucide-react';
import Badge from '../shared/Badge';
import Button from '../shared/Button';

interface AlertCategoryProps {
  title: string;
  icon: React.ReactNode;
  color: 'red' | 'amber' | 'neutral';
  alerts: { id: string; user: string; score: number | string; desc: string; time?: string }[];
}

const AlertCategory: React.FC<AlertCategoryProps> = ({ title, icon, color, alerts }) => {
  const borderColors = {
    red: 'border-red-100 bg-red-50',
    amber: 'border-orange-100 bg-orange-50',
    neutral: 'border-slate-200 bg-slate-50',
  };

  const textColors = {
    red: 'text-red-600',
    amber: 'text-orange-600',
    neutral: 'text-slate-600',
  };

  return (
    <div className={`p-4 rounded-xl border ${borderColors[color]} space-y-4 h-full flex flex-col`}>
      <h3 className={`text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2.5 ${textColors[color]}`}>
        {icon} {title}
      </h3>

      <div className="space-y-3 flex-1 overflow-y-auto pr-1">
        {alerts.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8 text-slate-400 italic text-[10px] font-mono uppercase tracking-widest border border-dashed border-slate-200 rounded-2xl">
            No active alerts in this sector
          </div>
        ) : (
          alerts.map(al => (
            <div key={al.id} className="bg-white border border-black/5 p-3.5 rounded-xl space-y-2.5 shadow-sm transition-all hover:shadow-md group">
              <div className="flex justify-between items-start">
                <span className="text-sm font-black text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors">{al.user}</span>
                <Badge variant={color === 'neutral' ? 'neutral' : color}>
                  {al.score}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">{al.desc}</p>
              {al.time && (
                <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-mono font-bold uppercase tracking-widest">
                  <Clock size={10} /> {al.time}
                </div>
              )}
              <Button
                variant={color === 'red' ? 'danger' : color === 'amber' ? 'outline' : 'secondary'}
                size="sm"
                className="w-full text-[9px] py-2 font-black tracking-widest"
              >
                Resolve Anomaly
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AlertCategory;
