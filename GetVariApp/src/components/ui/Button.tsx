import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { useScopedTheme } from '../../theme/theme';

/**
 * The app's one button.
 *
 * Before this existed every screen drew its own: the login screen's primary
 * action was a 52px pill with a cyan glow, onboarding's was a 22px-radius bar,
 * the confirmation modal's was a 2xl rounded box, and the "enable
 * notifications" nudge was a 1.5px-padded chip. They agreed on the accent
 * colour and on nothing else — different heights, radii, letter-spacing and
 * disabled treatments on screens the user sees one after the other.
 *
 * Variants encode *intent*, not appearance, so a screen picks what the button
 * means and the look follows from that.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in place of the label and blocks presses. */
  loading?: boolean;
  disabled?: boolean;
  /** Drawn to the left of the label. */
  icon?: React.ReactNode;
  /** Stretches to fill its row. */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

export const ACCENT = '#00f2fe';
const ON_ACCENT = '#020617';

const SIZES: Record<ButtonSize, { height: number; radius: number; fontSize: number; paddingH: number }> = {
  sm: { height: 36, radius: 14, fontSize: 11, paddingH: 14 },
  md: { height: 48, radius: 18, fontSize: 13, paddingH: 20 },
  lg: { height: 54, radius: 22, fontSize: 15, paddingH: 24 },
};

const VARIANTS: Record<ButtonVariant, { background: string; border: string; text: string; spinner: string }> = {
  primary: { background: ACCENT, border: ACCENT, text: ON_ACCENT, spinner: ON_ACCENT },
  secondary: {
    background: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.10)',
    text: '#cbd5e1',
    spinner: '#cbd5e1',
  },
  ghost: { background: 'transparent', border: 'transparent', text: '#94a3b8', spinner: '#94a3b8' },
  danger: {
    background: 'rgba(244,63,94,0.12)',
    border: 'rgba(244,63,94,0.35)',
    text: '#fb7185',
    spinner: '#fb7185',
  },
};

/** The same intents on a light surface. */
const LIGHT_VARIANTS: typeof VARIANTS = {
  primary: { background: '#0891b2', border: '#0891b2', text: '#ffffff', spinner: '#ffffff' },
  secondary: {
    background: 'rgba(24,24,27,0.04)',
    border: 'rgba(24,24,27,0.14)',
    text: '#3f3f46',
    spinner: '#3f3f46',
  },
  ghost: { background: 'transparent', border: 'transparent', text: '#52525b', spinner: '#52525b' },
  danger: {
    background: 'rgba(244,63,94,0.08)',
    border: 'rgba(244,63,94,0.35)',
    text: '#e11d48',
    spinner: '#e11d48',
  },
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  label: {
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  iconSpacing: { marginRight: 8 },
});

const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  style,
  textStyle,
  accessibilityLabel,
  testID,
}) => {
  const { light } = useScopedTheme();
  const tone = (light ? LIGHT_VARIANTS : VARIANTS)[variant];
  const metrics = SIZES[size];
  // One disabled treatment everywhere, rather than each screen inventing its
  // own opacity. A loading button is disabled too — a second tap on a request
  // already in flight is the double-submit these screens used to allow.
  const inert = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={inert}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inert, busy: loading }}
      testID={testID}
      style={[
        styles.base,
        {
          height: metrics.height,
          borderRadius: metrics.radius,
          paddingHorizontal: metrics.paddingH,
          backgroundColor: tone.background,
          borderColor: tone.border,
          opacity: inert ? 0.55 : 1,
        },
        fullWidth ? { alignSelf: 'stretch' } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone.spinner} />
      ) : (
        <>
          {!!icon && <View style={styles.iconSpacing}>{icon}</View>}
          <Text
            style={[styles.label, { color: tone.text, fontSize: metrics.fontSize }, textStyle]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

export default Button;
