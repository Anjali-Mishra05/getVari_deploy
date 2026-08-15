import React from 'react';
import { Text, View } from 'react-native';
import { Clock } from 'lucide-react-native';

import GlassCard from '../GlassCard';
import { HydrationLog, HydrationSource } from '../../types';
import { ACCENT } from './riskTheme';

interface FluidLoggingFeedProps {
  logs: HydrationLog[];
  /** Rows shown before the list is capped, keeping the home scroll bounded. */
  limit?: number;
}

/** How each source describes itself in the feed. */
const SOURCE_LABEL: Record<HydrationSource, string> = {
  manual: 'Manual Sync',
  smart_cap: 'GetVari Proprietary SmartCap®',
  wearable_prediction: 'Wearable Prediction',
  ai_chat: 'AquaSage Chat',
};

/** Today's entries, newest first — the audit trail behind the day's total. */
const FluidLoggingFeed: React.FC<FluidLoggingFeedProps> = ({ logs, limit = 4 }) => {
  const ordered = [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const shown = ordered.slice(0, limit);
  const hidden = ordered.length - shown.length;

  return (
    <GlassCard className="mb-4 bg-white/[0.01] rounded-[28px]" style={{ padding: 20 }}>
      <View className="flex-row items-center gap-2 mb-4">
        <Clock color={ACCENT} size={15} />
        <Text className="text-[10px] font-mono font-black tracking-wider uppercase text-neutral-300">
          Fluid Logging Feed
        </Text>
      </View>

      {shown.length === 0 ? (
        <Text className="text-center py-5 text-neutral-500 text-[11px] font-mono">
          No water synced today. Log an amount to start the feed.
        </Text>
      ) : (
        <View className="gap-2.5">
          {shown.map(log => (
            <View
              key={log.id}
              className="flex-row items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/5"
            >
              <View className="flex-row items-center gap-2.5 flex-1">
                <View className="px-2.5 py-1 rounded bg-cyan-500/10">
                  <Text className="text-[11px] font-black font-mono text-cyan-300">
                    +{log.amountMl}ml
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[11.5px] font-black text-white">Water Intake Synced</Text>
                  <Text className="text-[9px] text-neutral-400" numberOfLines={1}>
                    Source: {SOURCE_LABEL[log.source] ?? 'Health Integrator'}
                  </Text>
                </View>
              </View>
              <Text className="text-[10px] text-neutral-500 font-mono">
                {new Date(log.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          ))}

          {hidden > 0 && (
            <Text className="text-[9.5px] text-neutral-500 font-mono text-center mt-1">
              +{hidden} earlier {hidden === 1 ? 'entry' : 'entries'} today
            </Text>
          )}
        </View>
      )}
    </GlassCard>
  );
};

export default FluidLoggingFeed;
