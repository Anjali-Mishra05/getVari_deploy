import React from 'react';
import { Search } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: 'search';
  label?: string;
}

const Input: React.FC<InputProps> = ({ icon, label, className = '', ...props }) => {
  return (
    <div className="space-y-1.5 w-full">
      {label && <label className="text-[10px] uppercase font-mono text-neutral-500 ml-1">{label}</label>}
      <div className="relative">
        {icon === 'search' && (
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
        )}
        <input
          className={`w-full bg-neutral-950/60 border border-white/10 ${icon ? 'pl-10' : 'px-4'} pr-4 py-2.5 rounded-xl text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-cyan-500/50 transition-all duration-200 ${className}`}
          {...props}
        />
      </div>
    </div>
  );
};

export default Input;
