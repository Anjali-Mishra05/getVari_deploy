import React from 'react';
import { Text, View } from 'react-native';
import { Battery, Cpu } from 'lucide-react-native';

import GlassCard from '../GlassCard';
import { cardStyle } from './cardTheme';
import { accent, themed } from '../../theme/theme';

interface DeviceBandCardProps {
  /** A reading has arrived recently enough to call the band connected. */
  connected: boolean;
  /** The wearable's battery — not the phone's — or null when it has not reported one. */
  batteryLevel: number | null;
}

/**
 * The wearable itself: whether it is talking to the phone, and how much
 * charge it has.
 *
 * Nothing here is estimated. With no battery reading the level shows as `--%`.
 */
const DeviceBandCard: React.FC<DeviceBandCardProps> = ({ connected, batteryLevel }) => {
  const low = !!batteryLevel && batteryLevel <= 20;

  return (
    <GlassCard adaptive
      className={themed('flex-row items-center justify-between border-white/5 bg-black/60')}
      style={cardStyle}
    >
      <View className={themed('flex-row items-center gap-3.5')}>
        <View className={themed('p-2.5 bg-neutral-900 rounded-2xl border border-white/5')}>
          <Cpu color={accent()} size={17} />
        </View>
        <View>
          <Text className={themed('text-[10px] font-black text-white uppercase tracking-widest font-mono')}>
            getVari Band
          </Text>
          <View className={themed('flex-row items-center gap-1.5 mt-1')}>
            <View className={themed(`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`)} />
            <Text className={themed('text-[9px] text-neutral-500 font-mono font-bold uppercase tracking-widest')}>
              {connected ? 'Streaming encrypted' : 'Offline / Status Unknown'}
            </Text>
          </View>
        </View>
      </View>
      <View className={themed('flex-row items-center gap-2.5 bg-white/[0.03] px-3 py-1.5 rounded-xl')}>
        <Battery color={low ? '#ef4444' : '#10b981'} size={16} />
        <Text className={themed(`text-[11px] font-black font-mono ${low ? 'text-red-500' : 'text-emerald-500'}`)}>
          {batteryLevel !== null ? `${batteryLevel}%` : '--%'}
        </Text>
      </View>
    </GlassCard>
  );
};

export default DeviceBandCard;
