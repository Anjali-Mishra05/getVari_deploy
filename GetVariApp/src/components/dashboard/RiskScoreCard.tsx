import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';

import GlassCard from '../GlassCard';
import { cardStyle } from './cardTheme';
import { HydrationRiskDetails } from '../../types';
import HydrationProgressChart from './HydrationProgressChart';
import { statusColor } from './riskTheme';
import { accentFill, themed, tone } from '../../theme/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface RiskScoreCardProps {
  risk: HydrationRiskDetails;
  totalMl: number;
  /** The daily goal, or null while the profile is still loading. */
  targetMl: number | null;
  /** True while water is still moving from gut to bloodstream. */
  absorbing: boolean;
  /** When the score last moved, epoch ms. */
  updatedAt?: number;
  /**
   * Opens the quick-log sheet on the suggested amount.
   *
   * The water requirement is the one line on this card that names an action
   * the user can take right now, and it was the only one they could not act
   * on — the amount was stated and then had to be found again in the log
   * sheet. Omit the handler and the pill stays a read-only statement, which
   * is what the surfaces with nowhere to log want.
   */
  onRequirementPress?: (suggestedMl: number) => void;
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

/**
 * The dashboard's headline: the risk ring, what the number means, what to do
 * about it, and the day's totals.
 */
const RiskScoreCard: React.FC<RiskScoreCardProps> = ({
  risk,
  totalMl,
  targetMl,
  absorbing,
  updatedAt,
  onRequirementPress,
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
  // The explanation line is kept only where there is no band to read — no
  // data, or a device fault — because there it says why the ring is empty.
  const showMeaning = risk.status === 'Insufficient Data' || risk.status === 'Device Error';

  /**
   * The prescription, resolved once.
   *
   * Read out here rather than off `risk` at each use: the press handler is a
   * closure, so narrowing `risk.glassesRequired` at the JSX guard does not
   * reach inside it, and the multiplication belongs in one place regardless.
   */
  const glassesRequired = risk.glassesRequired ?? 0;
  const suggestedMl = glassesRequired * 250;

  return (
    <GlassCard adaptive className={themed('bg-white/[0.01]')} style={cardStyle}>
      {/* Status header */}
      <View className={themed('flex-row items-center justify-between mb-1')}>
        <Text className={themed('text-[10px] uppercase tracking-[0.2em] text-cyan-400 font-mono font-black')}>
          Hydration Risk Score
        </Text>
        {absorbing && (
          <View className={themed('flex-row items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full')}>
            <View className={themed('w-1.5 h-1.5 rounded-full bg-emerald-400')} />
            <Text className={themed('text-[8px] font-mono font-black text-emerald-400 uppercase tracking-wider')}>
              Absorbing
            </Text>
          </View>
        )}
      </View>

      <View className={themed('flex-row items-center gap-2.5 mb-2')}>
        <View className={themed('w-2.5 h-2.5 rounded-full')} style={{ backgroundColor: accent }} />
        <Text className={themed('text-2xl font-black text-white tracking-tight')}>{risk.status}</Text>
      </View>

      {/* Radial score */}
      <View className={themed('items-center justify-center my-2')}>
        {/* 192px rather than 224: the ring was crowding the status header above
            it and pushing the day's totals off the first screenful. */}
        <View className={themed('w-48 h-48 items-center justify-center')}>
          <Svg width="100%" height="100%" viewBox="0 0 160 160">
            <Circle cx="80" cy="80" r="76" stroke={tone('rgba(255,255,255,0.04)', '#ececee')} strokeWidth="9" fill="none" />
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
          <View className={themed('absolute items-center justify-center')}>
            {/* Inside a fixed 192px ring, so these do not scale with the
                system font size — at 130% the caption spilled over the arc. */}
            <Text
              className={themed('text-[56px] font-black text-white')}
              style={{ letterSpacing: -2 }}
              maxFontSizeMultiplier={1}
            >
              {risk.score !== null ? Math.round(risk.score) : '--'}
            </Text>
            <Text
              className={themed('text-[9px] uppercase tracking-[0.25em] text-neutral-500 font-mono font-black mt-[-4px]')}
              maxFontSizeMultiplier={1}
              numberOfLines={1}
            >
              {risk.score !== null ? 'Dehydration Risk' : 'Insufficient Data'}
            </Text>
            {!!updatedLabel && (
              <Text className={themed('text-[8px] text-neutral-600 font-mono mt-1.5')} maxFontSizeMultiplier={1}>
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
      <View className={themed('bg-black/40 rounded-2xl px-4 py-4 border border-white/5')}>
        {showMeaning && (
          <Text className={themed('text-[11.5px] text-neutral-300 leading-[18px] mb-2.5')}>{risk.meaning}</Text>
        )}

        {/* Follows the score: the engine writes this line for the band the
            score is in, so it changes whenever the score crosses one. */}
        <View>
          <Text className={themed('text-[8px] uppercase font-mono tracking-wider text-neutral-500')}>
            Suggested Action:
          </Text>
          <Text className={themed('text-[13px] font-black text-white mt-1')}>{risk.suggestedAction}</Text>
        </View>

        {!!glassesRequired && (
          /* The prescription, and the one thing on this card the user can act
             on.

             It is an amount to *drink*, so tapping it is a claim about the
             past — "I have had this" — not a request for the app to do
             something. The prompt says so outright: "Drank it? Tap to log."
             Left as a bare "tap to log" it read as though the pill were a
             shortcut that would log 500 ml on the spot, which invites a tap
             from someone who has not drunk anything and then quietly credits
             them for it.

             That is also why the tap opens the quick-log sheet rather than
             writing the entry: the card sits under the thumb while scrolling,
             and a stray tap silently adding half a litre to the day would be
             worse than one extra confirm. `hitSlop` gives the row a
             comfortable target without growing its visual box. */
          <Pressable
            onPress={
              onRequirementPress
                ? () => onRequirementPress(suggestedMl)
                : undefined
            }
            disabled={!onRequirementPress}
            hitSlop={8}
            accessibilityRole={onRequirementPress ? 'button' : undefined}
            accessibilityLabel={
              onRequirementPress
                ? `Suggested: ${glassesRequired} glasses of 250 millilitres, ${suggestedMl} millilitres total. Tap to log it once you have drunk it.`
                : undefined
            }
            style={({ pressed }) => ({ opacity: pressed && onRequirementPress ? 0.65 : 1 })}
            className={themed('flex-row items-center justify-between gap-2 mt-3 p-2.5 rounded-2xl bg-cyan-950/30 border border-cyan-500/15')}
          >
            {/* `flex-1` belongs on this row, not on the column inside it.
                Without it the row sizes to its content and the amount beside
                it is pushed outside the pill — which is exactly what the third
                line of text did when it was added. */}
            <View className={themed('flex-row items-center gap-2.5 flex-1')}>
              <View
                className={themed('w-7 h-7 rounded-xl items-center justify-center')}
                style={{ backgroundColor: accentFill() }}
              >
                <Text className={themed('text-[13px] font-black text-[#020617]')}>{glassesRequired}</Text>
              </View>
              <View className={themed('flex-1')}>
                <Text className={themed('text-[9px] font-black text-cyan-300 uppercase font-mono tracking-wider')}>
                  Water Requirement
                </Text>
                <Text className={themed('text-[9px] text-neutral-400 mt-0.5')}>glasses of 250ml each</Text>
                {/* The call to action is its own line, in the accent, because
                    it is the part that has to survive a glance. */}
                {!!onRequirementPress && (
                  <Text className={themed('text-[9px] font-black text-[#00f2fe] mt-1')}>
                    Drank it? Tap to log.
                  </Text>
                )}
              </View>
            </View>
            {/* The amount, as a chip rather than loose text at the edge.

                Bare text sitting hard against the pill's right border read as
                though it were outside the control — and for one build it
                genuinely was, when the row beside it had no `flex-1` and
                overflowed. Giving it a filled background of its own makes it
                visibly part of the button whatever the text beside it does,
                and `flexShrink: 0` keeps that true: the label wraps before the
                amount gives up a pixel. */}
            <View
              className={themed('rounded-xl px-2.5 py-1.5')}
              style={{ backgroundColor: tone('rgba(0,242,254,0.12)', 'rgba(8,145,178,0.10)'), flexShrink: 0 }}
            >
              <Text
                className={themed('text-[11px] font-mono font-black text-cyan-300')}
                numberOfLines={1}
              >
                +{suggestedMl} ml
              </Text>
            </View>
          </Pressable>
        )}
      </View>

      {/* Day totals: one chart, not a tile per figure. The three numbers are
          parts of the same whole, and separate tiles gave no way to compare
          them. */}
      <HydrationProgressChart totalMl={totalMl} targetMl={targetMl} />
    </GlassCard>
  );
};

export default RiskScoreCard;
