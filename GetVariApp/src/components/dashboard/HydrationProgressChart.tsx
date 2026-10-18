import React from 'react';
import { Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { formatMl } from '../../utils/hydrationFormat';
import { RISK_EMERALD } from './riskTheme';
import { accent, themed, tone } from '../../theme/theme';

interface HydrationProgressChartProps {
  totalMl: number;
  /** The daily goal, or null while the profile is still loading. */
  targetMl: number | null;
}

/** The day's figures, worked out once and drawn by the bar. */
interface DayWater {
  /** Formatted amounts: litres from 1000 ml up, ml below. `--` with no goal. */
  consumed: string;
  target: string;
  remaining: string;
  /** Share of the goal drunk, 0–1, or null with no goal to measure against. */
  fraction: number | null;
  /** The same share as a whole percentage, capped at 100. */
  percent: number | null;
  hasTarget: boolean;
  goalMet: boolean;
  /** The consumed mark's colour: the accent, or green once the goal is met. */
  fillColor: string;
  /** The unfilled part of the bar, which is what "remaining" looks like. */
  trackColor: string;
}

/**
 * The share of the bar to fill. A sliver is still drawn for a small non-zero
 * amount, so a first glass of the day is visible against a three-litre goal;
 * nothing at all is drawn for zero.
 */
const visibleShare = (fraction: number | null): number =>
  fraction === null || fraction <= 0 ? 0 : Math.max(0.02, Math.min(1, fraction));

const BAR_HEIGHT = 6;

/**
 * One bar. "Consumed / target" and the share of the goal over it, what is left
 * under it. Each figure appears once.
 */
const ProgressBar: React.FC<{ day: DayWater }> = ({ day }) => {
  const filled = visibleShare(day.fraction);

  return (
    <View>
      <View className={themed('flex-row items-baseline justify-between gap-2')}>
        <Text className={themed('text-[14px] font-black font-mono text-white')} style={{ flexShrink: 1 }} numberOfLines={1}>
          {day.consumed}
          <Text className={themed('text-[12px] font-bold text-neutral-400')}>{` / ${day.target}`}</Text>
        </Text>
        <Text
          className={themed('text-[10px] font-black font-mono')}
          style={{ color: day.fillColor, flexShrink: 0 }}
          numberOfLines={1}
        >
          {day.percent !== null ? `${day.percent}% of goal` : 'Loading goal…'}
        </Text>
      </View>

      <View
        style={{
          height: BAR_HEIGHT,
          borderRadius: BAR_HEIGHT / 2,
          marginTop: 6,
          overflow: 'hidden',
          backgroundColor: day.trackColor,
        }}
      >
        {filled > 0 && (
          <View
            style={{
              width: `${filled * 100}%`,
              height: '100%',
              borderRadius: BAR_HEIGHT / 2,
              backgroundColor: day.fillColor,
            }}
          />
        )}
      </View>

      {day.hasTarget && (
        <View className={themed('flex-row items-center gap-1 mt-1.5')}>
          {day.goalMet && <Check color={RISK_EMERALD} size={11} strokeWidth={3} />}
          <Text className={themed('text-[10px] text-neutral-400')} numberOfLines={1}>
            {day.goalMet ? 'Goal met' : `${day.remaining} remaining`}
          </Text>
        </View>
      )}
    </View>
  );
};

/**
 * The day's water as one chart: what has been drunk, the goal it is measured
 * against, and what is left.
 *
 * Display only. The figures are the ones the card was already given; nothing
 * here feeds back into the goal or the score.
 */
const HydrationProgressChart: React.FC<HydrationProgressChartProps> = ({ totalMl, targetMl }) => {
  const consumedMl = Number.isFinite(totalMl) ? Math.max(0, totalMl) : 0;
  // The goal is null until the profile row lands. It is absent until it is
  // real: the chart stays empty rather than measure against a stand-in.
  const hasTarget = targetMl !== null && Number.isFinite(targetMl) && targetMl > 0;
  const goalMl = hasTarget ? (targetMl as number) : null;
  const remainingMl = goalMl !== null ? Math.max(0, goalMl - consumedMl) : null;
  const goalMet = goalMl !== null && consumedMl >= goalMl;
  const fraction = goalMl !== null ? Math.min(1, consumedMl / goalMl) : null;
  const percent = goalMl !== null ? Math.min(100, Math.round((consumedMl / goalMl) * 100)) : null;

  const day: DayWater = {
    consumed: formatMl(consumedMl),
    target: goalMl !== null ? formatMl(goalMl) : '--',
    remaining: remainingMl !== null ? formatMl(remainingMl) : '--',
    fraction,
    percent,
    hasTarget,
    goalMet,
    fillColor: goalMet ? RISK_EMERALD : accent(),
    trackColor: tone('rgba(255,255,255,0.09)', '#e4e4e7'),
  };

  const summary = !hasTarget
    ? `Consumed ${day.consumed}. Daily target loading.`
    : goalMet
    ? `Consumed ${day.consumed} of a ${day.target} daily target. Goal met.`
    : `Consumed ${day.consumed} of a ${day.target} daily target, ${percent} percent. ${day.remaining} remaining.`;

  return (
    <View className={themed('mt-3 bg-white/[0.03] rounded-2xl border border-white/5 px-3.5 py-3')}>
      <Text
        className={themed('text-[9px] uppercase tracking-[0.18em] text-neutral-400 font-mono font-black mb-2')}
        numberOfLines={1}
      >
        Daily Water Goal
      </Text>

      <View accessible accessibilityLabel={summary}>
        <ProgressBar day={day} />
      </View>
    </View>
  );
};

export default HydrationProgressChart;
