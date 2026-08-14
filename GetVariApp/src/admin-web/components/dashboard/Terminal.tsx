import React from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';
import GlassCard from '../shared/GlassCard';
import { LogEntry } from '../../types';

interface TerminalProps {
  logs: LogEntry[];
  onClear: () => void;
}

const Terminal: React.FC<TerminalProps> = ({ logs, onClear }) => {
  return (
    <GlassCard className="flex flex-col h-[390px] shadow-md border-slate-200 !rounded-xl">
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5 mb-4">
        <div className="p-2 bg-slate-900 rounded-lg shadow-sm">
          <TerminalIcon className="w-4 h-4 text-emerald-400" />
        </div>
        <h3 className="text-base font-black text-slate-900 tracking-tight">Live System Logs</h3>
        <button
          onClick={onClear}
          className="ml-auto text-[10px] text-blue-600 hover:text-blue-700 font-black transition-colors uppercase tracking-[0.2em]"
        >
          Clear Cache
        </button>
      </div>

      <div className="flex-1 bg-[#0a0a0a] border border-slate-900 rounded-lg p-5 font-mono text-[13px] overflow-y-auto space-y-3 shadow-inner custom-scrollbar">
        {logs.map(log => (
          <div key={log.id} className="flex gap-4 animate-fadeIn group leading-relaxed">
            <span className="text-slate-500 font-medium shrink-0">[{log.time}]</span>
            <span className={
              log.type === 'success' ? 'text-emerald-400' :
              log.type === 'error' ? 'text-red-400' :
              log.type === 'warn' ? 'text-amber-400' :
              'text-cyan-400'
            }>
              <span className="mr-2 text-[11px] font-medium tracking-wide">[{log.type.toUpperCase()}]</span>
              <span className="font-medium">{log.text}</span>
            </span>
          </div>
        ))}
        <div className="flex gap-2">
          <span className="text-blue-600 animate-pulse font-bold leading-none">_</span>
        </div>
      </div>
    </GlassCard>
  );
};


export default Terminal;
