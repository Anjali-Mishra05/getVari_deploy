import React from 'react';
import { Sparkles, LogOut, User as UserIcon } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../../services/SupabaseClient';

interface HeaderProps {
  user: User;
}

const Header: React.FC<HeaderProps> = ({ user }) => {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <header className="flex justify-between items-start mb-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-[10px] text-blue-600 tracking-[0.2em] uppercase font-black">
            Enterprise Bio-Telemetry Portal
          </span>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          GetVari Command Center
        </h1>
        <p className="text-sm text-slate-500 max-w-2xl font-medium mt-1">
          Fleet-wide physiological monitoring and hydration intelligence dashboard.
        </p>
      </div>

      <div className="flex flex-col items-end gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-full shadow-sm">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)]"></span>
            </span>
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
              Fleet Node <span className="text-blue-600">Active</span>
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-full shadow-sm hover:bg-slate-50 transition-colors text-slate-500 hover:text-red-600"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Sign Out</span>
          </button>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200/60">
          <UserIcon className="w-3 h-3 text-slate-400" />
          <span className="text-[10px] font-bold text-slate-500">{user.email}</span>
        </div>
      </div>
    </header>
  );
};


export default Header;
