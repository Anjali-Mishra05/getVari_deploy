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
    <GlassCard className="flex flex-col h-[400px]">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-4 mb-4">
        <TerminalIcon className="w-5 h-5 text-blue-600" />
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Live Terminal Logger</h3>
        <button
          onClick={onClear}
          className="ml-auto text-[10px] text-blue-600 hover:text-blue-700 font-black bg-transparent border-none cursor-pointer uppercase tracking-widest"
        >
          [ Clear Cache ]
        </button>
      </div>

      <div className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl p-5 font-mono text-[11px] overflow-y-auto space-y-2 select-text">
        {logs.map(log => (
          <div key={log.id} className="flex gap-3 animate-fadeIn">
            <span className="text-slate-400 font-bold shrink-0">[{log.time}]</span>
            <span className={
              log.type === 'success' ? 'text-emerald-600 font-bold' :
              log.type === 'error' ? 'text-red-600 font-bold' :
              log.type === 'warn' ? 'text-orange-600 font-bold' :
              'text-blue-700 font-bold'
            }>
              <span className="opacity-50 mr-1.5">{log.type.toUpperCase()}:</span>
              {log.text}
            </span>
          </div>
        ))}
        <div className="flex gap-2">
          <span className="text-blue-600 animate-pulse font-black">_</span>
        </div>
      </div>
    </GlassCard>
  );
};

export default Terminal;
