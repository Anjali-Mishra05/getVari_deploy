import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl p-4 border border-slate-200 shadow-sm transition-all duration-200 ${onClick ? 'cursor-pointer hover:border-blue-300 hover:shadow-md active:scale-[0.99]' : ''} ${className}`}
    >
      {children}
    </div>
  );
};

export default GlassCard;
