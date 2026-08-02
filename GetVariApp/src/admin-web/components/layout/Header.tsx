import React from 'react';
import { Sparkles } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="flex justify-between items-start mb-8">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-[10px] text-cyan-400 font-mono tracking-[0.2em] uppercase font-bold">
            Enterprise Portal
          </span>
        </div>
        <h1 className="text-4xl font-extrabold text-white tracking-tight">
          GetVari Command Center
        </h1>
        <p className="text-sm text-neutral-400 max-w-2xl">
          Real-time physiological sync monitoring, device fleet status, and bio-analytics intelligence.
        </p>
      </div>

      <div className="flex items-center gap-3 bg-cyan-950/20 border border-cyan-500/30 px-4 py-2 rounded-full backdrop-blur-md">
        <span className="flex h-2.5 w-2.5 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
        </span>
        <span className="text-xs font-bold text-cyan-300">
          Active Fleet Sync Node Online
        </span>
      </div>
    </header>
  );
};

export default Header;
