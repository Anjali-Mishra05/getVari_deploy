import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';

import GlassCard from '../GlassCard';
import { HydrationRiskDetails } from '../../types';
import type { SensorOverride } from '../../hooks/useHydrationTelemetry';
import {
  RISK_CHANNELS,
  channelText,
  overrideFromDraft,
  validateChannel,
} from '../../utils/riskChannels';
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
  /**
   * The readings the engine is being solved over, for the editable breakdown.
   *
   * Omit these and the breakdown stays exactly as it was — five read-only
   * loads — so the card is still usable anywhere that has no telemetry to
   * hand.
   */
  inputs?: {
    heartRate: number | null;
    activityLoad: number | null;
    temperature: number | null;
    humidity: number | null;
    gapHours: number;
  };
  /** Readings currently pinned, or null when the stream is drifting freely. */
  override?: SensorOverride | null;
  /** Pins the typed readings. Passing null hands the stream back. */
  onOverrideChange?: (override: SensorOverride | null) => void;
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
  inputs,
  override,
  onOverrideChange,
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

  /**
   * The calculated load for each channel, keyed by the channel it came from.
   *
   * These are *outputs*. `risk.heartLoad` is the 10/40/70/90 band the engine
   * assigned, not the heart rate that produced it — so the number shown here
   * is never the number the field edits.
   */
  const loadFor: Record<string, number | null> = {
    heartRate: loadValue(risk.heartLoad),
    activityLoad: loadValue(risk.activityLoad),
    temperature: loadValue(risk.temperatureLoad),
    humidity: loadValue(risk.humidityLoad),
    gapHours: loadValue(risk.timeLoad),
  };

  /** Editing is offered only where there is a stream to pin and a way to pin it. */
  const editable = !!inputs && !!onOverrideChange;

  /**
   * Field contents as *text*, not numbers.
   *
   * A numeric state cannot represent "the box has been cleared to type a new
   * value", and coercing the empty string to 0 mid-edit both jumps the score
   * and fights the keyboard.
   */
  const [draft, setDraft] = useState<Record<string, string>>({});

  /**
   * Which fields the user has taken control of.
   *
   * An untouched field mirrors the live reading, which drifts every tick. A
   * touched one must not: having typed 35 °C, watching it slide back to 28
   * two seconds later would read as the input having been ignored.
   */
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  /**
   * What a field shows: the user's own edit, else anything the sensor test
   * sheet has pinned, else the live reading.
   *
   * The override matters because the sheet and this card drive the same seam.
   * Reading only `live` would still be correct — a pinned reading *is* the
   * live one — but it would lose the distinction between a value someone
   * chose and one the simulation happens to be sitting on, so a pinned field
   * would look untouched here.
   */
  const fieldValue = (key: string, live: number | null, decimals: number): string => {
    if (touched[key]) return draft[key] ?? '';
    const pinned = override ? (override as Record<string, number | undefined>)[key] : undefined;
    return channelText(pinned ?? live, decimals);
  };

  /** True when the sheet pinned this channel and the user has not retyped it. */
  const pinnedElsewhere = (key: string): boolean =>
    !touched[key] &&
    !!override &&
    (override as Record<string, number | undefined>)[key] !== undefined;

  /**
   * Apply an edit and solve immediately.
   *
   * The whole draft is handed to `onOverrideChange`, not just the field that
   * changed, because the override is a complete picture of what is pinned —
   * sending one channel would release the other four. `overrideFromDraft`
   * drops anything blank or out of range, so an invalid entry leaves that
   * channel on its last good reading while the message explains why.
   */
  const edit = (key: string, raw: string) => {
    const next = { ...draft, [key]: raw };
    setDraft(next);
    setTouched(t => ({ ...t, [key]: true }));
    onOverrideChange?.(overrideFromDraft(next));
  };

  /** Hands every channel back to the simulated stream. */
  const releaseAll = () => {
    setDraft({});
    setTouched({});
    onOverrideChange?.(null);
  };

  const pinnedCount = RISK_CHANNELS.filter(
    channel => touched[channel.key] || pinnedElsewhere(channel.key)
  ).length;

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
        <View className="flex-row items-center justify-between mb-0.5">
          <Text className="text-[9px] uppercase tracking-wider text-neutral-400 font-mono">
            Intermediate Risk Load Breakdown
          </Text>
          {editable && pinnedCount > 0 && (
            <Text
              className="text-[8px] uppercase tracking-wider font-mono font-black"
              style={{ color: ACCENT }}
              onPress={releaseAll}
              accessibilityRole="button"
              accessibilityLabel="Release pinned readings back to the live stream"
            >
              {`${pinnedCount} pinned · reset`}
            </Text>
          )}
        </View>

        {editable && (
          <Text className="text-[9px] text-neutral-500 mb-2.5 leading-relaxed">
            Adjust inputs to simulate conditions
          </Text>
        )}

        <View className="flex-row gap-1.5">
          {RISK_CHANNELS.map(channel => {
            const load = loadFor[channel.key];
            const live = inputs
              ? channel.key === 'gapHours'
                ? inputs.gapHours
                : (inputs[channel.key as 'heartRate' | 'activityLoad' | 'temperature' | 'humidity'] ?? null)
              : null;
            const raw = fieldValue(channel.key, live, channel.decimals);
            const error = editable ? validateChannel(channel, raw) : null;

            return (
              <View
                key={channel.key}
                className="flex-1 items-center justify-between bg-white/[0.03] rounded-xl border border-white/5 p-1.5"
                style={{ minHeight: editable ? 96 : 60 }}
              >
                <Text className="text-[8px] text-neutral-400" numberOfLines={1}>
                  {channel.shortLabel}
                </Text>

                {/* The raw input. Never the load — that is computed from this. */}
                {editable && (
                  <>
                    <TextInput
                      value={raw}
                      onChangeText={next => edit(channel.key, next)}
                      keyboardType="numeric"
                      selectTextOnFocus
                      // Android restores focus to the last focused view when
                      // the activity resumes, which raised the numeric keypad
                      // over the dashboard on every launch. Nothing here
                      // should take focus until it is actually tapped.
                      autoFocus={false}
                      showSoftInputOnFocus
                      placeholder="--"
                      placeholderTextColor="#475569"
                      accessibilityLabel={`${channel.label} in ${channel.unit}`}
                      className="w-full text-center text-[12px] font-black font-mono rounded-lg px-0.5 py-1 mt-1"
                      style={{
                        color: '#ffffff',
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        borderWidth: 1,
                        borderColor: error
                          ? '#f43f5e'
                          : touched[channel.key] || pinnedElsewhere(channel.key)
                          ? ACCENT
                          : 'rgba(255,255,255,0.10)',
                      }}
                    />
                    <Text className="text-[7px] text-neutral-500 font-mono" numberOfLines={1}>
                      {channel.unit}
                    </Text>
                    {/* What may be typed, and where the bands fall — the band
                        edges are what actually move the load, so they are more
                        use here than a generic "recommended". */}
                    <Text
                      className="text-[7px] text-neutral-600 text-center leading-[9px]"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {`${channel.min}–${channel.max}`}
                    </Text>
                    <Text
                      className="text-[7px] text-neutral-600 text-center leading-[9px]"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {`best ${channel.lowestRisk}`}
                    </Text>
                  </>
                )}

                {/* The calculated load, always read-only. */}
                {/*
                  The per-channel load — the 10/40/70/90 band the engine
                  assigns — is deliberately not shown while the section is
                  editable. It is an intermediate value of the algorithm, and
                  five of them competing with the five inputs made the cards
                  read as ten numbers rather than five questions. The score
                  those loads produce is still right above, in the ring.

                  The bar goes with the number: it is the same load rendered
                  as width and colour, so leaving it would still be showing
                  what it replaced.
                */}
                {!editable && (
                  <>
                    <Text className="text-[12px] font-black text-white font-mono my-0.5">
                      {load !== null ? Math.round(load) : '--'}
                    </Text>
                    <View className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${load !== null ? Math.max(0, Math.min(100, load)) : 0}%`,
                          backgroundColor: load !== null ? loadColor(load) : '#334155'
                        }}
                      />
                    </View>
                  </>
                )}
              </View>
            );
          })}
        </View>

        {/* One message for the section rather than five cramped ones: the
            cards are ~60px wide and a sentence does not fit inside them. */}
        {editable &&
          RISK_CHANNELS.map(channel => {
            const live = inputs
              ? channel.key === 'gapHours'
                ? inputs.gapHours
                : (inputs[channel.key as 'heartRate' | 'activityLoad' | 'temperature' | 'humidity'] ?? null)
              : null;
            const error = validateChannel(channel, fieldValue(channel.key, live, channel.decimals));
            if (!error) return null;
            return (
              <Text key={channel.key} className="text-[9px] text-rose-400 font-mono mt-2">
                {`${channel.label}: ${error}`}
              </Text>
            );
          })}
      </View>
    </GlassCard>
  );
};

export default RiskScoreCard;
