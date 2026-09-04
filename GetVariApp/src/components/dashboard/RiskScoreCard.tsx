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
  /** The daily goal, or null while the profile is still loading. */
  targetMl: number | null;
  /** Hours since the last logged drink, before absorption credit. */
  hoursSinceDrink: number;
  /** Millilitres of the most recent entry, or null when nothing is logged. */
  lastIntakeMl: number | null;
  /** True while water is still moving from gut to bloodstream. */
  absorbing: boolean;
  /** When the score last moved, epoch ms. */
  updatedAt?: number;
}

/** "just now" / "12m ago" / "1h ago", for the freshness line under the ring. */
const sinceLabel = (updatedAt?: number): string | null => {
  if (!updatedAt || !Number.isFinite(updatedAt)) return null;
  const minutes = Math.floor((Date.now() - updatedAt) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

/** Circumference of the r=76 ring, matched to the web dashboard's geometry. */
const RING_LENGTH = 477;

/** One of the four small totals under the ring. */
const StatTile: React.FC<{ label: string; value: string; caption: string; valueColor?: string }> = ({
  label,
  value,
  caption,
  valueColor = '#ffffff',
}) => (
  <View className="flex-1 bg-white/[0.03] rounded-2xl px-3 py-2.5 border border-white/5 min-h-[64px] justify-between">
    {/* Every line here is single-line by contract. Four tiles across a phone
        left ~58px of usable width, which broke "CONSUMED" into "CONSUME"/"D"
        and clipped the captions to "Goal baseli…". */}
    <Text
      className="text-[9px] uppercase tracking-wide text-neutral-400 font-mono"
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.85}
    >
      {label}
    </Text>
    <Text
      className="text-[13px] font-black font-mono mt-1"
      style={{ color: valueColor }}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
    >
      {value}
    </Text>
    <Text className="text-[9px] text-neutral-500 mt-0.5" numberOfLines={1}>
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
  updatedAt,
}) => {
  const accent = statusColor(risk.status);
  const updatedLabel = sinceLabel(updatedAt);

  // The ring is eased on the UI thread rather than by re-rendering the screen:
  // the solve updates every sensor tick, and animating it in JS would repaint
  // the whole dashboard several times a second.
  const ringProgress = useSharedValue(0);
  useEffect(() => {
    ringProgress.value = withTiming(risk.score !== null ? Math.min(100, risk.score) / 100 : 0, { duration: 700 });
  }, [risk.score, ringProgress]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_LENGTH - RING_LENGTH * ringProgress.value,
  }));
  // The goal is null until the profile row lands, and used to arrive as a
  // hardcoded 2500 in the meantime — a number the user had never been given,
  // shown as though it were theirs, and then quietly replaced. It is now
  // absent until it is real, and the tiles that depend on it say so.
  //
  // Dividing by it while it was absent is also where "NaN% of goal" came from.
  const hasTarget = targetMl !== null && Number.isFinite(targetMl) && targetMl > 0;
  const remainingMl = hasTarget ? Math.max(0, (targetMl as number) - totalMl) : null;
  const goalMet = hasTarget && (targetMl as number) - totalMl <= 0;
  const targetPercent = hasTarget
    ? Math.min(100, Math.round((totalMl / (targetMl as number)) * 100))
    : null;

  // `Number.isFinite`, not `!== null`: a load that arrives as undefined or NaN
  // has to read as "no data" too. Checking only for null is what let
  // `Math.round(undefined)` reach the screen as the literal text "NaN".
  const loadValue = (value: number | null | undefined): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  const loads = [
    { label: 'Heart', value: loadValue(risk.heartLoad) },
    { label: 'Activity', value: loadValue(risk.activityLoad) },
    { label: 'Temp', value: loadValue(risk.temperatureLoad) },
    { label: 'Humidity', value: loadValue(risk.humidityLoad) },
    { label: 'Time', value: loadValue(risk.timeLoad) },
  ];

  return (
    <GlassCard className="my-3 bg-white/[0.01]" style={{ padding: 20 }}>
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
        {/* 192px rather than 224: the ring was crowding the status header above
            it and pushing the day's totals off the first screenful. */}
        <View className="w-48 h-48 items-center justify-center">
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
              {risk.score !== null ? Math.round(risk.score) : '--'}
            </Text>
            <Text className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 font-mono font-black mt-[-4px]">
              {risk.score !== null ? 'Dehydration Risk' : 'Insufficient Data'}
            </Text>
            {!!updatedLabel && (
              <Text className="text-[8px] text-neutral-600 font-mono mt-1.5">
                Updated {updatedLabel}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Meaning + prescription.

          Radius is concentric with the card around it: the outer 36px corner
          less the 20px of padding leaves 16px, which is what stops the inner
          card from reading as misaligned against the parent. */}
      <View className="bg-black/40 rounded-2xl px-4 py-4 border border-white/5">
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

      {/* Day totals.

          Two per row rather than four: on a 360dp phone four columns left each
          tile too narrow for its own label, so every fix short of widening the
          column was cosmetic. Two rows give each tile ~2.5x the width and the
          text fits at a readable size. */}
      <View className="mt-3 gap-2">
        <View className="flex-row gap-2">
          <StatTile
            label="Consumed"
            value={`${totalMl} ml`}
            caption={targetPercent !== null ? `${targetPercent}% of goal` : 'Loading goal…'}
          />
          <StatTile
            label="Daily Target"
            value={hasTarget ? `${targetMl} ml` : '--'}
            caption={hasTarget ? 'Goal baseline' : 'Loading…'}
          />
        </View>
        <View className="flex-row gap-2">
          <StatTile
            label="Remaining"
            value={remainingMl !== null ? `${remainingMl} ml` : '--'}
            caption={!hasTarget ? 'Loading…' : goalMet ? 'Goal met' : 'Deficit left'}
            valueColor={goalMet ? '#10b981' : '#ffffff'}
          />
          <StatTile
            label="Last Intake"
            value={
              lastIntakeMl === null
                ? '--'
                : hoursSinceDrink < 0.1
                ? 'Just now'
                : `${Math.max(0, Math.floor((Number.isFinite(hoursSinceDrink) ? hoursSinceDrink : 0) * 60))}m ago`
            }
            caption={lastIntakeMl === null ? 'No sync' : `${lastIntakeMl}ml logged`}
          />
        </View>
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
              <Text className="text-[12px] font-black text-white font-mono my-0.5">
                {load.value !== null ? Math.round(load.value) : '--'}
              </Text>
              <View className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${load.value !== null ? Math.max(0, Math.min(100, load.value)) : 0}%`,
                    backgroundColor: load.value !== null ? loadColor(load.value) : '#334155'
                  }}
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
