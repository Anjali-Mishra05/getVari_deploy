import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp, Cpu, Moon } from 'lucide-react-native';

import GlassCard from '../GlassCard';
import { cardStyle } from './cardTheme';
import { ABSORBED_POOL_CAP_ML, STOMACH_CAPACITY_ML } from '../../hooks/useHydrationTelemetry';
import { ACCENT } from './riskTheme';
import { accent, themed, tone } from '../../theme/theme';

interface RecoveryTelemetryPanelProps {
  stomachVolume: number;
  absorbedHydration: number;
  absorptionRate: number;
  sweatLossRate: number;
  totalMl: number;
  /** The daily goal, or null while the profile is still loading. */
  targetMl: number | null;
  /**
   * Daily goal divided by waking hours, not by 24 — a pace built on the full
   * day would only be reachable by drinking in your sleep. Optional so the
   * panel still renders for a profile captured before the question existed.
   */
  targetMlPerAwakeHour?: number;
  awakeHoursPerDay?: number;
  /** True inside the user's sleep window, when alerts are muted. */
  isSleeping?: boolean;
  expanded: boolean;
  onToggle: () => void;
}

interface MetricProps {
  label: string;
  value: string;
  unit: string;
  valueColor?: string;
  /** Omitted for rate metrics, which have no meaningful capacity to fill. */
  fillPercent?: number;
  fillColor?: string;
  caption: string;
}

/**
 * A finite number, or the fallback.
 *
 * This panel is the "Activity" destination in the bottom bar, and it is where
 * NaN surfaced: every figure on it is a quotient, and each of the denominators
 * can legitimately be zero — an empty gut, a goal that has not loaded yet, a
 * sleep window that covers the whole day. `toFixed` on the result of any of
 * those prints the literal string "NaN", which is what the user was seeing.
 * Each reading is now coerced at the point it is displayed.
 */
const finite = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** A percentage that is safe to render, or undefined when it cannot be formed. */
const percentOf = (part: number, whole: number): number | undefined => {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return undefined;
  return Math.max(0, Math.min(100, (part / whole) * 100));
};

const Metric: React.FC<MetricProps> = ({
  label,
  value,
  unit,
  valueColor = tone('#ffffff', '#18181b'),
  fillPercent,
  fillColor = ACCENT,
  caption,
}) => (
  <View className={themed('flex-1 bg-white/[0.02] p-3.5 rounded-2xl border border-white/5')}>
    <Text className={themed('text-[8.5px] uppercase tracking-wider text-neutral-400 font-mono leading-[13px]')}>
      {label}
    </Text>
    <View className={themed('flex-row items-baseline gap-1 mt-1.5')}>
      <Text className={themed('text-[19px] font-black font-mono')} style={{ color: valueColor }}>
        {value}
      </Text>
      <Text className={themed('text-[9.5px] text-neutral-500 font-mono')}>{unit}</Text>
    </View>
    <View className={themed('w-full h-1 rounded-full bg-white/5 overflow-hidden mt-2')}>
      {fillPercent !== undefined && (
        <View
          className={themed('h-full rounded-full')}
          style={{
            width: `${Math.max(0, Math.min(100, fillPercent))}%`,
            backgroundColor: fillColor,
          }}
        />
      )}
    </View>
    <Text className={themed('text-[9px] text-neutral-400 leading-[13px] mt-1.5')}>{caption}</Text>
  </View>
);

/**
 * The recovery engine with its lid off: how much water is still in the gut,
 * how much has reached the bloodstream, and the two rates moving fluid in
 * either direction.
 *
 * Collapsed by default — it explains the score rather than delivering it, so
 * it should not cost every user a screen of scrolling.
 */
const RecoveryTelemetryPanel: React.FC<RecoveryTelemetryPanelProps> = ({
  stomachVolume,
  absorbedHydration,
  absorptionRate,
  sweatLossRate,
  totalMl,
  targetMl,
  targetMlPerAwakeHour,
  awakeHoursPerDay,
  isSleeping = false,
  expanded,
  onToggle,
}) => {
  const gut = finite(stomachVolume);
  const absorbed = finite(absorbedHydration);
  const inBody = gut + absorbed;
  const hasTarget = targetMl !== null && Number.isFinite(targetMl) && targetMl > 0;
  const remainingMl = hasTarget ? Math.max(0, (targetMl as number) - finite(totalMl)) : null;

  // Absorption is only meaningful once there is fluid in the system at all;
  // with an empty gut and an empty pool the quotient is 0/0.
  const absorbedPercent = inBody > 0 ? Math.round((absorbed / inBody) * 100) : null;
  const paceMlPerHour = finite(targetMlPerAwakeHour, 0);

  return (
    <GlassCard adaptive className={themed('bg-cyan-950/5 border-cyan-500/10')} style={cardStyle}>
      {/* The header is the control: the whole row toggles, and the chevron at
          its end is what says so — down when there is more to open, up when
          it can be folded away. */}
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Recovery engine telemetry, ${expanded ? 'expanded' : 'collapsed'}`}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        className={themed('flex-row items-center justify-between gap-2')}
      >
        <View className={themed('flex-row items-center gap-2 flex-1')}>
          <Cpu color={accent()} size={16} />
          <Text
            className={themed('text-[10px] uppercase tracking-[0.1em] font-black text-white/80 flex-1')}
            numberOfLines={1}
          >
            Recovery Engine Telemetry
          </Text>
        </View>
        <View className={themed('w-7 h-7 rounded-full bg-white/5 items-center justify-center')}>
          {expanded ? (
            <ChevronUp color={accent()} size={18} strokeWidth={2.5} />
          ) : (
            <ChevronDown color={accent()} size={18} strokeWidth={2.5} />
          )}
        </View>
      </TouchableOpacity>

      {expanded && (
      <View className={themed('pt-3 mt-3 border-t border-white/5')}>
      <View className={themed('flex-row gap-2.5')}>
        <Metric
          label="Water Awaiting Absorption"
          value={String(Math.round(gut))}
          unit={`ml / ${STOMACH_CAPACITY_ML}ml`}
          fillPercent={percentOf(gut, STOMACH_CAPACITY_ML)}
          caption="Swallowed but not yet absorbed by the body."
        />
        <Metric
          label="Estimated Absorbed Hydration"
          value={String(Math.round(absorbed))}
          unit={`ml / ${ABSORBED_POOL_CAP_ML}ml`}
          fillPercent={percentOf(absorbed, ABSORBED_POOL_CAP_ML)}
          fillColor="#10b981"
          caption="Hydration recovery progress."
        />
      </View>

      <View className={themed('flex-row gap-2.5 mt-2.5')}>
        <Metric
          label="Absorption Speed"
          value={`+${finite(absorptionRate).toFixed(1)}`}
          unit="ml / min"
          valueColor={tone(ACCENT, '#0e7490')}
          caption="Affected by exertion stress factor."
        />
        <Metric
          label="Estimated Sweat Loss"
          value={`-${finite(sweatLossRate).toFixed(1)}`}
          unit="ml / min"
          valueColor="#f43f5e"
          caption="Scales with exertion & heat stress."
        />
      </View>

      <View className={themed('pt-3.5 mt-3.5 border-t border-white/5 gap-2')}>
        <View className={themed('flex-row items-center justify-between')}>
          <Text className={themed('text-[10px] text-neutral-400 font-mono')}>Absorption Status:</Text>
          <Text className={themed('text-[10px] text-white font-mono font-black')}>
            {gut > 0 && absorbedPercent !== null
              ? `${absorbedPercent}% absorbed`
              : 'Gut empty / idle'}
          </Text>
        </View>
        <View className={themed('flex-row items-center justify-between')}>
          <Text className={themed('text-[10px] text-neutral-400 font-mono')}>Water Needed For Target:</Text>
          <Text
            className={themed('text-[10px] font-mono font-black')}
            style={{ color: remainingMl === 0 ? tone('#34d399', '#047857') : tone(ACCENT, '#0e7490') }}
          >
            {remainingMl === null ? 'Loading…' : `${remainingMl} ml`}
          </Text>
        </View>
        {paceMlPerHour > 0 && (
          <View className={themed('flex-row items-center justify-between')}>
            <Text className={themed('text-[10px] text-neutral-400 font-mono')}>
              Pace / Waking Hour
              {Number.isFinite(awakeHoursPerDay) && (awakeHoursPerDay as number) > 0
                ? ` (${(awakeHoursPerDay as number).toFixed(0)}h awake)`
                : ''}
              :
            </Text>
            <Text className={themed('text-[10px] text-white font-mono font-black')}>
              {Math.round(paceMlPerHour)} ml / h
            </Text>
          </View>
        )}
        {isSleeping && (
          <View className={themed('flex-row items-center gap-2 mt-1')}>
            <Moon color="#818cf8" size={12} />
            <Text className={themed('text-[10px] text-indigo-300 font-mono flex-1')}>
              Sleep window open — alerts paused, and these hours are left out of your averages.
            </Text>
          </View>
        )}
      </View>
      </View>
      )}
    </GlassCard>
  );
};

export default RecoveryTelemetryPanel;
