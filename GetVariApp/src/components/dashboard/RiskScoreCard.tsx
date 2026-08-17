import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';

import GlassCard from '../GlassCard';
import { HydrationRiskDetails } from '../../types';
import { ACCENT, loadColor, statusColor } from './riskTheme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface RiskScoreCardProps {
  risk: HydrationRiskDetails;
  totalMl: number;
  targetMl: number;
  /** Hours since the last logged drink, before absorption credit. */
  hoursSinceDrink: number;
  /** Millilitres of the most recent entry, or null when nothing is logged. */
  lastIntakeMl: number | null;
  /** True while water is still moving from gut to bloodstream. */
  absorbing: boolean;
}

/** Circumference of the r=76 ring, matched to the web dashboard's geometry. */
const RING_LENGTH = 477;

/** One of the four small totals under the ring. */
const StatTile: React.FC<{ label: string; value: string; caption: string; valueColor?: string }> = ({
  label,
  value,
  caption,
  valueColor = '#ffffff',
}) => (
  <View className="flex-1 bg-white/[0.03] rounded-2xl p-2.5 border border-white/5 min-h-[70px] justify-between">
    <Text className="text-[8px] uppercase tracking-wider text-neutral-400 font-mono">{label}</Text>
    <Text className="text-[11px] font-black font-mono mt-1.5" style={{ color: valueColor }} numberOfLines={1}>
      {value}
    </Text>
    <Text className="text-[8px] text-neutral-500 mt-1" numberOfLines={1}>
      {caption}
    </Text>
  </View>
);

/**
 * The dashboard's headline: the risk ring, what the number means, what to do
 * about it, the day's totals, and the five loads the score was built from.
 */
const RiskScoreCard: React.FC<RiskScoreCardProps> = ({
  risk,
  totalMl,
  targetMl,
  hoursSinceDrink,
  lastIntakeMl,
  absorbing,
}) => {
  const accent = statusColor(risk.status);

  // The ring is eased on the UI thread rather than by re-rendering the screen:
  // the solve updates every sensor tick, and animating it in JS would repaint
  // the whole dashboard several times a second.
  const ringProgress = useSharedValue(0);
  useEffect(() => {
    ringProgress.value = withTiming(Math.min(100, risk.score) / 100, { duration: 700 });
  }, [risk.score, ringProgress]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_LENGTH - RING_LENGTH * ringProgress.value,
  }));
  const remainingMl = Math.max(0, targetMl - totalMl);
  const goalMet = targetMl - totalMl <= 0;
  const targetPercent = Math.min(100, Math.round((totalMl / targetMl) * 100));

  const loads = [
    { label: 'Heart', value: Math.round(risk.heartLoad) },
    { label: 'Activity', value: Math.round(risk.activityLoad) },
    { label: 'Temp', value: Math.round(risk.temperatureLoad) },
    { label: 'Humidity', value: Math.round(risk.humidityLoad) },
    { label: 'Time', value: Math.round(risk.timeLoad) },
  ];

  return (
    <GlassCard className="mb-4 bg-white/[0.01]" style={{ padding: 20 }}>
      {/* Status header */}
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-[10px] uppercase tracking-[0.2em] text-cyan-400 font-mono font-black">
          Hydration Risk Score
        </Text>
        {absorbing && (
          <View className="flex-row items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full">
            <View className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <Text className="text-[8px] font-mono font-black text-emerald-400 uppercase tracking-wider">
              Absorbing
            </Text>
          </View>
        )}
      </View>

      <View className="flex-row items-center gap-2.5 mb-2">
        <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: accent }} />
        <Text className="text-2xl font-black text-white tracking-tight">{risk.status}</Text>
      </View>

      {/* Radial score */}
      <View className="items-center justify-center my-2">
        <View className="w-56 h-56 items-center justify-center">
          <Svg width="100%" height="100%" viewBox="0 0 160 160">
            <Circle cx="80" cy="80" r="76" stroke="rgba(255,255,255,0.04)" strokeWidth="9" fill="none" />
            <AnimatedCircle
              cx="80"
              cy="80"
              r="76"
              stroke={accent}
              strokeWidth="9"
              fill="none"
              strokeDasharray={RING_LENGTH}
              animatedProps={ringProps}
              strokeLinecap="round"
              transform="rotate(-90 80 80)"
            />
          </Svg>
          <View className="absolute items-center justify-center">
            <Text className="text-[56px] font-black text-white" style={{ letterSpacing: -2 }}>
              {risk.score}
            </Text>
            <Text className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 font-mono font-black mt-[-4px]">
              Dehydration Risk
            </Text>
          </View>
        </View>
      </View>

      {/* Meaning + prescription */}
      <View className="bg-black/40 rounded-3xl p-4 border border-white/5">
        <Text className="text-[11.5px] text-neutral-300 leading-[18px]">{risk.meaning}</Text>

        <View className="border-t border-white/5 mt-3 pt-2.5">
          <Text className="text-[8px] uppercase font-mono tracking-wider text-neutral-500">
            Suggested Action:
          </Text>
          <Text className="text-[13px] font-black text-white mt-1">{risk.suggestedAction}</Text>
        </View>

        {!!risk.glassesRequired && (
          <View className="flex-row items-center justify-between gap-2 mt-3 p-2.5 rounded-2xl bg-cyan-950/30 border border-cyan-500/15">
            <View className="flex-row items-center gap-2.5">
              <View
                className="w-7 h-7 rounded-xl items-center justify-center"
                style={{ backgroundColor: ACCENT }}
              >
                <Text className="text-[13px] font-black text-[#020617]">{risk.glassesRequired}</Text>
              </View>
              <View>
                <Text className="text-[9px] font-black text-cyan-300 uppercase font-mono tracking-wider">
                  Water Requirement
                </Text>
                <Text className="text-[9px] text-neutral-400 mt-0.5">glasses of 250ml each</Text>
              </View>
            </View>
            <Text className="text-[11px] font-mono font-black text-cyan-400">
              +{risk.glassesRequired * 250} ml
            </Text>
          </View>
        )}
      </View>

      {/* Day totals */}
      <View className="flex-row gap-2 mt-3">
        <StatTile label="Consumed" value={`${totalMl} ml`} caption={`(${targetPercent}%)`} />
        <StatTile label="Daily Target" value={`${targetMl} ml`} caption="Goal baseline" />
        <StatTile
          label="Remaining"
          value={`${remainingMl} ml`}
          caption={goalMet ? 'Goal met' : 'Deficit left'}
          valueColor={goalMet ? '#10b981' : '#ffffff'}
        />
        <StatTile
          label="Last Intake"
          value={
            lastIntakeMl === null
              ? '--'
              : hoursSinceDrink < 0.1
              ? 'Just now'
              : `${Math.floor(hoursSinceDrink * 60)}m ago`
          }
          caption={lastIntakeMl === null ? 'No sync' : `${lastIntakeMl}ml logged`}
        />
      </View>

      {/* Load breakdown */}
      <View className="mt-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
        <Text className="text-[9px] uppercase tracking-wider text-neutral-400 font-mono mb-2.5">
          Intermediate Risk Load Breakdown
        </Text>
        <View className="flex-row gap-1.5">
          {loads.map(load => (
            <View
              key={load.label}
              className="flex-1 items-center justify-between bg-white/[0.03] rounded-xl border border-white/5 p-1.5 min-h-[60px]"
            >
              <Text className="text-[8px] text-neutral-400" numberOfLines={1}>
                {load.label}
              </Text>
              <Text className="text-[12px] font-black text-white font-mono my-0.5">{load.value}</Text>
              <View className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{ width: `${load.value}%`, backgroundColor: loadColor(load.value) }}
                />
              </View>
            </View>
          ))}
        </View>
      </View>
    </GlassCard>
  );
};

export default RiskScoreCard;
