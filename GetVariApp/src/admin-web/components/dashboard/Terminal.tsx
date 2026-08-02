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
      <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-4">
        <TerminalIcon className="w-5 h-5 text-cyan-400" />
        <h3 className="text-sm font-extrabold text-neutral-100 uppercase tracking-widest">Live Terminal Logger</h3>
        <button
          onClick={onClear}
          className="ml-auto text-[10px] text-cyan-400 hover:text-cyan-300 font-mono bg-transparent border-none cursor-pointer uppercase tracking-wider"
        >
          [ Clear Cache ]
        </button>
      </div>

      <div className="flex-1 bg-neutral-950/70 border border-white/5 rounded-2xl p-5 font-mono text-[11px] overflow-y-auto space-y-2 select-text scrollbar-thin scrollbar-thumb-white/10">
        {logs.map(log => (
          <div key={log.id} className="flex gap-3 animate-fadeIn">
            <span className="text-neutral-600 shrink-0">[{log.time}]</span>
            <span className={
              log.type === 'success' ? 'text-emerald-400' :
              log.type === 'error' ? 'text-red-400' :
              log.type === 'warn' ? 'text-amber-500' : 'text-cyan-300'
            }>
              <span className="opacity-50 mr-1.5">{log.type.toUpperCase()}:</span>
              {log.text}
            </span>
          </div>
        ))}
        <div className="flex gap-2">
          <span className="text-cyan-500 animate-pulse">_</span>
        </div>
      </div>
    </GlassCard>
  );
};

export default Terminal;
