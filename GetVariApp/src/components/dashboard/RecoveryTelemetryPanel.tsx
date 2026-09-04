import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Cpu, Moon } from 'lucide-react-native';

import GlassCard from '../GlassCard';
import { ABSORBED_POOL_CAP_ML, STOMACH_CAPACITY_ML } from '../../hooks/useHydrationTelemetry';
import { ACCENT } from './riskTheme';

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
  valueColor = '#ffffff',
  fillPercent,
  fillColor = ACCENT,
  caption,
}) => (
  <View className="flex-1 bg-white/[0.02] p-3.5 rounded-2xl border border-white/5">
    <Text className="text-[8.5px] uppercase tracking-wider text-neutral-400 font-mono leading-[13px]">
      {label}
    </Text>
    <View className="flex-row items-baseline gap-1 mt-1.5">
      <Text className="text-[19px] font-black font-mono" style={{ color: valueColor }}>
        {value}
      </Text>
      <Text className="text-[9.5px] text-neutral-500 font-mono">{unit}</Text>
    </View>
    <View className="w-full h-1 rounded-full bg-white/5 overflow-hidden mt-2">
      {fillPercent !== undefined && (
        <View
          className="h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, fillPercent))}%`,
            backgroundColor: fillColor,
          }}
        />
      )}
    </View>
    <Text className="text-[9px] text-neutral-400 leading-[13px] mt-1.5">{caption}</Text>
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
  if (!expanded) {
    return (
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Expand recovery engine telemetry"
        className="w-full py-3 mb-4 bg-white/[0.02] border border-white/5 rounded-2xl items-center"
      >
        <Text className="text-[10px] font-mono font-black text-cyan-400">
          [Expand Recovery Engine Telemetry]
        </Text>
      </TouchableOpacity>
    );
  }

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
    <GlassCard className="mb-4 bg-cyan-950/5 rounded-[32px] border-cyan-500/10" style={{ padding: 20 }}>
      <View className="flex-row items-center justify-between pb-3 mb-3.5 border-b border-white/5">
        <View className="flex-row items-center gap-2">
          <Cpu color={ACCENT} size={16} />
          <Text className="text-[10px] uppercase tracking-[0.18em] font-black text-white/80">
            Recovery Engine Telemetry
          </Text>
        </View>
        <TouchableOpacity
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel="Collapse recovery engine telemetry"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text className="text-[10px] font-mono text-neutral-400">[Collapse]</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-row gap-2.5">
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

      <View className="flex-row gap-2.5 mt-2.5">
        <Metric
          label="Absorption Speed"
          value={`+${finite(absorptionRate).toFixed(1)}`}
          unit="ml / min"
          valueColor={ACCENT}
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

      <View className="pt-3.5 mt-3.5 border-t border-white/5 gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-[10px] text-neutral-400 font-mono">Absorption Status:</Text>
          <Text className="text-[10px] text-white font-mono font-black">
            {gut > 0 && absorbedPercent !== null
              ? `${absorbedPercent}% absorbed`
              : 'Gut empty / idle'}
          </Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-[10px] text-neutral-400 font-mono">Water Needed For Target:</Text>
          <Text
            className="text-[10px] font-mono font-black"
            style={{ color: remainingMl === 0 ? '#34d399' : ACCENT }}
          >
            {remainingMl === null ? 'Loading…' : `${remainingMl} ml`}
          </Text>
        </View>
        {paceMlPerHour > 0 && (
          <View className="flex-row items-center justify-between">
            <Text className="text-[10px] text-neutral-400 font-mono">
              Pace / Waking Hour
              {Number.isFinite(awakeHoursPerDay) && (awakeHoursPerDay as number) > 0
                ? ` (${(awakeHoursPerDay as number).toFixed(0)}h awake)`
                : ''}
              :
            </Text>
            <Text className="text-[10px] text-white font-mono font-black">
              {Math.round(paceMlPerHour)} ml / h
            </Text>
          </View>
        )}
        {isSleeping && (
          <View className="flex-row items-center gap-2 mt-1">
            <Moon color="#818cf8" size={12} />
            <Text className="text-[10px] text-indigo-300 font-mono flex-1">
              Sleep window open — alerts paused, and these hours are left out of your averages.
            </Text>
          </View>
        )}
      </View>
    </GlassCard>
  );
};

export default RecoveryTelemetryPanel;
