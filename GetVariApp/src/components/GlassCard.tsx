import React from 'react';
import { View, ViewProps } from 'react-native';

interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
}

const GlassCard: React.FC<GlassCardProps> = ({ children, className, ...props }) => {
  return (
    <View
      className={`bg-black/40 backdrop-blur-md rounded-[36px] p-6 border border-white/8 shadow-2xl ${className}`}
      {...props}
    >
      {children}
    </View>
  );
};

export default GlassCard;
