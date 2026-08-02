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
      className={`glass rounded-3xl p-6 border border-white/10 backdrop-blur-md transition-all duration-300 ${onClick ? 'cursor-pointer hover:border-cyan-500/30 active:scale-[0.99]' : ''} ${className}`}
    >
      {children}
    </div>
  );
};

export default GlassCard;
