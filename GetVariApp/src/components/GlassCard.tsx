import React from 'react';
import { View, ViewProps } from 'react-native';

import { getThemeMode, themed } from '../theme/theme';

interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Follows the dark/light mode. Off by default: the sign-in and onboarding
   * screens use this card too, and they are dark in both modes.
   */
  adaptive?: boolean;
}

const BASE = 'bg-black/40 backdrop-blur-md rounded-[36px] p-6 border border-white/8 shadow-2xl';

/**
 * The outline of a section card in dark mode.
 *
 * Set in `style` because the classes could not be relied on for it: the
 * base's `border-white/8` is not an opacity step the stylesheet generates, so
 * the border fell back to black, and the cards that named their own
 * (`border-white/5`, `border-cyan-500/10`) were too faint to see on the dark
 * page. One outline for every card, whatever classes it carries — kept low
 * in contrast, so it separates a card from the page without framing it.
 * Light mode is untouched — its border comes from the mapped classes.
 */
const DARK_BORDER = 'rgba(255,255,255,0.09)';

const GlassCard: React.FC<GlassCardProps> = ({ children, className, adaptive = false, style, ...props }) => {
  const darkOutline = adaptive && getThemeMode() === 'dark';
  return (
    <View
      className={`${adaptive ? themed(BASE) : BASE} ${className}`}
      style={darkOutline ? [{ borderColor: DARK_BORDER }, style] : style}
      {...props}
    >
      {children}
    </View>
  );
};

export default GlassCard;
