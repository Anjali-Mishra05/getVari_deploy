import React from 'react';
import { Text, View } from 'react-native';
import { Droplets, MapPin } from 'lucide-react-native';

import GlassCard from '../GlassCard';
import { cardStyle } from './cardTheme';
import { accent, themed } from '../../theme/theme';

interface AmbientCardProps {
  /** City from the onboarding profile; falls back when it was never set. */
  location?: string;
  temperature: number | null;
  humidity: number | null;
}

/**
 * The climate the body is working against. Humidity gets the headline because
 * it, not temperature alone, decides whether sweat can evaporate at all.
 */
const AmbientCard: React.FC<AmbientCardProps> = ({ location, temperature, humidity }) => (
  <GlassCard adaptive className={themed('bg-white/[0.01]')} style={cardStyle}>
    <View className={themed('flex-row items-center justify-between border-b border-white/5 pb-2.5')}>
      <View className={themed('flex-row items-center gap-2')}>
        <MapPin color={accent()} size={15} />
        <Text className={themed('text-[12px] font-black text-neutral-100')}>{location || 'Your area'}</Text>
      </View>
      <Text className={themed('text-[12px] font-mono font-black text-cyan-300')}>
        {temperature !== null ? `${temperature.toFixed(1)}°C` : '--°C'}, {humidity !== null ? `${humidity}% H` : '--% H'}
      </Text>
    </View>

    <View className={themed('flex-row items-center gap-3 pt-3')}>
      <View className={themed('p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20')}>
        <Droplets color="#60a5fa" size={19} />
      </View>
      <View className={themed('flex-1')}>
        <Text className={themed('text-[9.5px] uppercase text-neutral-400 font-mono font-black tracking-wide')}>
          Ambient Humidity
        </Text>
        <Text className={themed('text-[19px] font-black text-white font-mono mt-0.5')}>
          {humidity !== null ? `${humidity}% rH` : '--% rH'}
        </Text>
      </View>
    </View>

    <Text className={themed('text-[10px] text-neutral-400 leading-[15px] italic mt-2.5')}>
      Surrounding water vapor directly affects your sweat evaporation potential and hydration loss.
    </Text>
  </GlassCard>
);

export default AmbientCard;
