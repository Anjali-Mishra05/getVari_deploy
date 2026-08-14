import React from 'react';
import { Search } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: 'search';
  label?: string;
}

const Input: React.FC<InputProps> = ({ icon, label, className = '', ...props }) => {
  return (
    <div className="space-y-1.5 w-full">
      {label && <label className="text-xs uppercase font-bold text-slate-500 ml-1 tracking-wider">{label}</label>}
      <div className="relative">
        {icon === 'search' && (
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
        )}
        <input
          className={`w-full bg-white border border-slate-200 ${icon ? 'pl-10' : 'px-3'} pr-3 py-2.5 rounded-lg text-sm text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all duration-200 shadow-sm ${className}`}
          {...props}
        />
      </div>
    </div>
  );
};


export default Input;
