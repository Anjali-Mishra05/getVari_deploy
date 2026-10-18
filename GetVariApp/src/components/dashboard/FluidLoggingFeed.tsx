import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Clock } from 'lucide-react-native';

import GlassCard from '../GlassCard';
import { cardStyle } from './cardTheme';
import { HydrationLog, HydrationSource } from '../../types';
import { accent, themed } from '../../theme/theme';

interface FluidLoggingFeedProps {
  logs: HydrationLog[];
  /**
   * Rows visible at once. Every entry is still rendered; past this many the
   * list scrolls inside the card, so a long day never stretches the home
   * scroll.
   */
  visibleRows?: number;
}

/** Matches `gap-2.5` between rows. */
const ROW_GAP = 10;
/** A row's height before the first one is measured, so the list never flashes full length. */
const ESTIMATED_ROW_HEIGHT = 54;

/** How each source describes itself in the feed. */
const SOURCE_LABEL: Record<HydrationSource, string> = {
  manual: 'Manual Sync',
  smart_cap: 'GetVari Proprietary SmartCap®',
  wearable_prediction: 'Wearable Prediction',
  ai_chat: 'Vari Chat',
  correction: 'Correction',
};

/** Today's entries, newest first — the audit trail behind the day's total. */
const FluidLoggingFeed: React.FC<FluidLoggingFeedProps> = ({ logs, visibleRows = 3 }) => {
  const ordered = [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const scrolls = ordered.length > visibleRows;
  /**
   * Measured rather than hardcoded, so the window stays exactly
   * `visibleRows` tall whatever the font scale. Rows are one line each and
   * share a height, so the first is enough.
   */
  const [rowHeight, setRowHeight] = useState(ESTIMATED_ROW_HEIGHT);

  const renderRow = (log: HydrationLog, index: number) => (
    <View
      key={log.id}
      onLayout={
        index === 0 ? e => setRowHeight(e.nativeEvent.layout.height) : undefined
      }
      className={themed('flex-row items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/5')}
    >
      <View className={themed('flex-row items-center gap-2.5 flex-1')}>
        {/* A correction is a negative row, so the sign comes from the
            amount rather than being hardcoded to "+". */}
        <View
          className={themed(`px-2.5 py-1 rounded ${
            log.amountMl < 0 ? 'bg-amber-500/10' : 'bg-cyan-500/10'
          }`)}
        >
          <Text
            className={themed(`text-[11px] font-black font-mono ${
              log.amountMl < 0 ? 'text-amber-300' : 'text-cyan-300'
            }`)}
          >
            {log.amountMl < 0 ? '' : '+'}
            {log.amountMl}ml
          </Text>
        </View>
        <View className={themed('flex-1')}>
          <Text className={themed('text-[11.5px] font-black text-white')}>
            {log.amountMl < 0 ? 'Intake Corrected' : 'Water Intake Synced'}
          </Text>
          <Text className={themed('text-[9px] text-neutral-400')} numberOfLines={1}>
            Source: {SOURCE_LABEL[log.source] ?? 'Health Integrator'}
          </Text>
        </View>
      </View>
      <Text className={themed('text-[10px] text-neutral-500 font-mono')}>
        {new Date(log.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );

  return (
    <GlassCard adaptive className={themed('bg-white/[0.01]')} style={cardStyle}>
      <View className={themed('flex-row items-center gap-2 mb-4')}>
        <Clock color={accent()} size={15} />
        <Text className={themed('text-[10px] font-mono font-black tracking-wider uppercase text-neutral-300')}>
          Fluid Logging Feed
        </Text>
      </View>

      {ordered.length === 0 ? (
        <Text className={themed('text-center py-5 text-neutral-500 text-[11px] font-mono')}>
          No water synced today. Log an amount to start the feed.
        </Text>
      ) : scrolls ? (
        <ScrollView
          // Android only hands a vertical drag to an inner ScrollView when this
          // is set; without it the home screen takes every gesture.
          nestedScrollEnabled
          showsVerticalScrollIndicator
          // Android fades the indicator out once scrolling stops, which hides
          // the one cue that more entries sit below. Keep it on screen.
          persistentScrollbar
          // iOS: a light indicator, since the card is dark.
          indicatorStyle="white"
          style={{ maxHeight: rowHeight * visibleRows + ROW_GAP * (visibleRows - 1) }}
          contentContainerStyle={{ gap: ROW_GAP }}
        >
          {ordered.map(renderRow)}
        </ScrollView>
      ) : (
        <View className={themed('gap-2.5')}>{ordered.map(renderRow)}</View>
      )}
    </GlassCard>
  );
};

export default FluidLoggingFeed;
