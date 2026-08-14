import React from 'react';
import { Sparkles } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="flex justify-between items-start mb-8">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="text-[10px] text-blue-600 font-mono tracking-[0.3em] uppercase font-black">
            Enterprise Portal
          </span>
        </div>
        <h1 className="text-5xl font-black text-slate-900 tracking-tight">
          GetVari Command Center
        </h1>
        <p className="text-sm font-medium text-slate-500 max-w-2xl">
          Real-time physiological sync monitoring, device fleet status, and bio-analytics intelligence.
        </p>
      </div>

      <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 px-5 py-2.5 rounded-full shadow-sm">
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
        </span>
        <span className="text-xs font-black text-blue-700 uppercase tracking-widest">
          Active Fleet Sync Node Online
        </span>
      </div>
    </header>
  );
};

export default Header;
