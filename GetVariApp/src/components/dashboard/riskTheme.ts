import { HydrationRiskStatus } from '../../utils/hydrationRiskEngine';

/**
 * The one place the risk bands are turned into colour.
 *
 * The ring, the status dot, the load bars and the "why this score" total all
 * have to agree about what 27/100 looks like, and NativeWind cannot build a
 * class name from a runtime value — so these are plain hex strings applied
 * through `style`.
 */

export const ACCENT = '#00f2fe';

/** Band colours, from hydrated through critical. */
export const RISK_EMERALD = '#10b981';
export const RISK_AMBER = '#eab308';
export const RISK_ORANGE = '#f97316';
export const RISK_RED = '#dc2626';

/** Colour for any 0-100 load or score, using the engine's own band edges. */
export const loadColor = (value: number): string => {
  if (value <= 25) return RISK_EMERALD;
  if (value <= 50) return RISK_AMBER;
  if (value <= 75) return RISK_ORANGE;
  return RISK_RED;
};

/** Colour for a solved status, which the score alone cannot always imply. */
export const statusColor = (status: HydrationRiskStatus): string => {
  switch (status) {
    case 'Hydrated':
      return RISK_EMERALD;
    case 'Mild Risk':
      return RISK_AMBER;
    case 'High Risk':
      return RISK_ORANGE;
    default:
      return RISK_RED;
  }
};

/** Translucent fill matching a band colour, for chips and icon wells. */
export const tint = (hex: string, alpha = 0.12): string => {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
