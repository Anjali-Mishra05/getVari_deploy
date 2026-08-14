import React from 'react';
import { Search } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: 'search';
  label?: string;
}

const Input: React.FC<InputProps> = ({ icon, label, className = '', ...props }) => {
  return (
    <div className="space-y-1.5 w-full">
      {label && <label className="text-[10px] uppercase font-mono font-black text-slate-400 ml-1 tracking-widest">{label}</label>}
      <div className="relative">
        {icon === 'search' && (
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        )}
        <input
          className={`w-full bg-slate-50 border border-slate-200 ${icon ? 'pl-10' : 'px-4'} pr-4 py-2.5 rounded-xl text-xs text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition-all duration-200 shadow-sm ${className}`}
          {...props}
        />
      </div>
    </div>
  );
};

export default Input;
