import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'cyan' | 'emerald' | 'amber' | 'red' | 'neutral';
  className?: string;
  dot?: boolean;
}

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  className = '',
  dot = false
}) => {
  const variants = {
    cyan: 'text-blue-600 bg-blue-50 border-blue-100',
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    amber: 'text-orange-700 bg-orange-50 border-orange-100',
    red: 'text-red-700 bg-red-50 border-red-100',
    neutral: 'text-slate-500 bg-slate-100 border-slate-200',
  };

  const dotColors = {
    cyan: 'bg-blue-600',
    emerald: 'bg-emerald-600',
    amber: 'bg-orange-500',
    red: 'bg-red-600',
    neutral: 'bg-slate-400',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${variants[variant]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`}></span>}
      {children}
    </span>
  );
};

export default Badge;
