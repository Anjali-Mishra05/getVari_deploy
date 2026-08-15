import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Cpu } from 'lucide-react-native';

import GlassCard from '../GlassCard';
import { ABSORBED_POOL_CAP_ML, STOMACH_CAPACITY_ML } from '../../hooks/useHydrationTelemetry';
import { ACCENT } from './riskTheme';

interface RecoveryTelemetryPanelProps {
  stomachVolume: number;
  absorbedHydration: number;
  absorptionRate: number;
  sweatLossRate: number;
  totalMl: number;
  targetMl: number;
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
          style={{ width: `${Math.min(100, fillPercent)}%`, backgroundColor: fillColor }}
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

  const remainingMl = Math.max(0, targetMl - totalMl);
  const inBody = absorbedHydration + stomachVolume;

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
          value={String(Math.round(stomachVolume))}
          unit={`ml / ${STOMACH_CAPACITY_ML}ml`}
          fillPercent={(stomachVolume / STOMACH_CAPACITY_ML) * 100}
          caption="Swallowed but not yet absorbed by the body."
        />
        <Metric
          label="Estimated Absorbed Hydration"
          value={String(Math.round(absorbedHydration))}
          unit={`ml / ${ABSORBED_POOL_CAP_ML}ml`}
          fillPercent={(absorbedHydration / ABSORBED_POOL_CAP_ML) * 100}
          fillColor="#10b981"
          caption="Hydration recovery progress."
        />
      </View>

      <View className="flex-row gap-2.5 mt-2.5">
        <Metric
          label="Absorption Speed"
          value={`+${absorptionRate.toFixed(1)}`}
          unit="ml / min"
          valueColor={ACCENT}
          caption="Affected by exertion stress factor."
        />
        <Metric
          label="Estimated Sweat Loss"
          value={`-${sweatLossRate.toFixed(1)}`}
          unit="ml / min"
          valueColor="#f43f5e"
          caption="Scales with exertion & heat stress."
        />
      </View>

      <View className="pt-3.5 mt-3.5 border-t border-white/5 gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-[10px] text-neutral-400 font-mono">Absorption Status:</Text>
          <Text className="text-[10px] text-white font-mono font-black">
            {stomachVolume > 0
              ? `${Math.round((absorbedHydration / inBody) * 100)}% absorbed`
              : 'Gut empty / idle'}
          </Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-[10px] text-neutral-400 font-mono">Water Needed For Target:</Text>
          <Text
            className="text-[10px] font-mono font-black"
            style={{ color: remainingMl === 0 ? '#34d399' : ACCENT }}
          >
            {remainingMl} ml
          </Text>
        </View>
      </View>
    </GlassCard>
  );
};

export default RecoveryTelemetryPanel;
