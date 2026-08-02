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
    red: 'border-red-500/20 bg-red-950/5',
    amber: 'border-amber-500/20 bg-amber-950/5',
    neutral: 'border-white/10 bg-neutral-900/40',
  };

  const textColors = {
    red: 'text-red-400',
    amber: 'text-amber-400',
    neutral: 'text-neutral-300',
  };

  return (
    <div className={`p-8 rounded-[32px] border ${borderColors[color]} space-y-6 h-full flex flex-col backdrop-blur-sm`}>
      <h3 className={`text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2.5 ${textColors[color]}`}>
        {icon} {title}
      </h3>

      <div className="space-y-4 flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
        {alerts.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8 text-neutral-600 italic text-[10px] font-mono uppercase tracking-widest border border-dashed border-white/5 rounded-2xl">
            No active alerts in this sector
          </div>
        ) : (
          alerts.map(al => (
            <div key={al.id} className="bg-neutral-950/60 border border-white/5 p-5 rounded-2xl space-y-3 transition-all hover:border-white/10 group">
              <div className="flex justify-between items-start">
                <span className="text-xs font-black text-white tracking-tight group-hover:text-cyan-400 transition-colors">{al.user}</span>
                <Badge variant={color === 'neutral' ? 'neutral' : color}>
                  {al.score}
                </Badge>
              </div>
              <p className="text-[11px] text-neutral-500 leading-relaxed">{al.desc}</p>
              {al.time && (
                <div className="flex items-center gap-1.5 text-[9px] text-neutral-600 font-mono font-bold uppercase">
                  <Clock size={10} /> {al.time}
                </div>
              )}
              <Button
                variant={color === 'red' ? 'danger' : color === 'amber' ? 'outline' : 'secondary'}
                size="sm"
                className="w-full text-[9px] py-2"
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
