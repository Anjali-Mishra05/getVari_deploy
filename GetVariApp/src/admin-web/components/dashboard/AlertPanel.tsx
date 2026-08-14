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
    <GlassCard className="flex flex-col h-[390px] shadow-md border-slate-200 !rounded-xl">
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5 mb-4">
        <div className="p-2 bg-red-500/5 rounded-lg border border-red-500/10 shadow-sm">
          <ShieldAlert className="w-4.5 h-4.5 text-red-600 animate-pulse" />
        </div>
        <h3 className="text-base font-black text-slate-900 tracking-tight">Priority Safety Alerts</h3>
        <div className="ml-auto">
          <span className="bg-red-500/10 text-red-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-500/20">
            {alerts.length} Anomalies Detected
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
        {alerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50">
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
              <ShieldAlert className="text-slate-300" size={24} />
            </div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No active hazards</p>
          </div>
        ) : (
          alerts.map((al) => (
            <div
              key={al.id}
              className={`p-3.5 rounded-xl border flex items-center justify-between transition-all hover:shadow-lg hover:scale-[1.002] group ${
                al.type === 'critical' ? 'bg-red-50/20 border-red-100 shadow-sm shadow-red-100/40' :
                al.type === 'warn' ? 'bg-orange-50/20 border-orange-100 shadow-sm shadow-orange-100/40' :
                'bg-slate-50/50 border-slate-200'
              }`}
            >
              <div className="space-y-1.5 pr-4 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    al.type === 'critical' ? 'bg-red-600 animate-pulse' :
                    al.type === 'warn' ? 'bg-orange-500' :
                    'bg-slate-400'
                  }`}></span>
                  <span className="text-[13px] font-black text-slate-900 tracking-tight uppercase">{al.title}</span>
                  <span className="text-slate-300 mx-1 text-xs">|</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">User: {al.user}</span>
                </div>
                <p className="text-xs font-medium text-slate-500 leading-relaxed max-w-lg">{al.desc}</p>
              </div>

              <button
                onClick={() => onInvestigate(al.user)}
                className="bg-white hover:bg-blue-600 hover:text-white text-blue-600 font-bold text-[10px] px-4 py-2 rounded-lg border border-slate-200 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer shrink-0 uppercase tracking-widest"
              >
                Resolve <ArrowUpRight size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
};


export default AlertPanel;
