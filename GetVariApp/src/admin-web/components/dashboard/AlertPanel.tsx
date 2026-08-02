import React from 'react';
import { ShieldAlert, ArrowUpRight } from 'lucide-react';
import GlassCard from '../shared/GlassCard';
import Badge from '../shared/Badge';
import { Alert } from '../../types';

interface AlertPanelProps {
  alerts: Alert[];
  onInvestigate: (userName: string) => void;
}

const AlertPanel: React.FC<AlertPanelProps> = ({ alerts, onInvestigate }) => {
  return (
    <GlassCard className="flex flex-col h-[400px]">
      <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-4">
        <ShieldAlert className="w-5 h-5 text-red-400 animate-pulse" />
        <h3 className="text-sm font-extrabold text-neutral-100 uppercase tracking-widest">Actionable Safety Alerts</h3>
        <Badge variant="red" className="ml-auto" dot>
          {alerts.length} ANOMALIES
        </Badge>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
        {alerts.map((al) => (
          <div
            key={al.id}
            className={`p-4 rounded-2xl border flex items-center justify-between transition group hover:scale-[1.01] ${
              al.type === 'critical' ? 'bg-red-500/5 border-red-500/15' :
              al.type === 'warn' ? 'bg-amber-500/5 border-amber-500/15' :
              'bg-neutral-950/30 border-white/5'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${al.type === 'critical' ? 'bg-red-500' : al.type === 'warn' ? 'bg-amber-500' : 'bg-neutral-400'}`}></span>
                <span className="text-xs font-bold text-white uppercase tracking-tight">{al.title}</span>
                <span className="text-[10px] font-mono text-neutral-500">// {al.user}</span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-snug">{al.desc}</p>
            </div>

            <button
              onClick={() => onInvestigate(al.user)}
              className="bg-white/5 hover:bg-cyan-500 hover:text-neutral-950 text-neutral-300 font-mono text-[10px] px-3 py-2 rounded-xl border border-white/5 transition flex items-center gap-1 cursor-pointer shrink-0 uppercase font-bold"
            >
              Resolve <ArrowUpRight size={14} />
            </button>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};

export default AlertPanel;
