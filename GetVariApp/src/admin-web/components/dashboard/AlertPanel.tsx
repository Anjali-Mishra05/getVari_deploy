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
      <div className="flex items-center gap-2 border-b border-slate-100 pb-4 mb-4">
        <ShieldAlert className="w-5 h-5 text-red-600 animate-pulse" />
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Actionable Safety Alerts</h3>
        <Badge variant="red" className="ml-auto" dot>
          {alerts.length} ANOMALIES
        </Badge>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-2">
        {alerts.map((al) => (
          <div
            key={al.id}
            className={`p-4 rounded-2xl border flex items-center justify-between transition group hover:shadow-md ${
              al.type === 'critical' ? 'bg-red-50 border-red-100' :
              al.type === 'warn' ? 'bg-orange-50 border-orange-100' :
              'bg-slate-50 border-slate-100'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${al.type === 'critical' ? 'bg-red-600' : al.type === 'warn' ? 'bg-orange-500' : 'bg-slate-400'}`}></span>
                <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{al.title}</span>
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">// {al.user}</span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 leading-snug">{al.desc}</p>
            </div>

            <button
              onClick={() => onInvestigate(al.user)}
              className="bg-white hover:bg-blue-600 hover:text-white text-blue-600 font-black text-[10px] px-4 py-2 rounded-xl border border-slate-200 shadow-sm transition flex items-center gap-1 cursor-pointer shrink-0 uppercase tracking-widest"
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
