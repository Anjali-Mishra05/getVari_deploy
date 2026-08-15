import React from 'react';
import { Text, View } from 'react-native';
import { Droplets, MapPin } from 'lucide-react-native';

import GlassCard from '../GlassCard';

interface AmbientCardProps {
  /** City from the onboarding profile; falls back when it was never set. */
  location?: string;
  temperature: number;
  humidity: number;
}

/**
 * The climate the body is working against. Humidity gets the headline because
 * it, not temperature alone, decides whether sweat can evaporate at all.
 */
const AmbientCard: React.FC<AmbientCardProps> = ({ location, temperature, humidity }) => (
  <GlassCard className="mb-4 bg-white/[0.01] rounded-[28px]" style={{ padding: 16 }}>
    <View className="flex-row items-center justify-between border-b border-white/5 pb-2.5">
      <View className="flex-row items-center gap-2">
        <MapPin color="#00f2fe" size={15} />
        <Text className="text-[12px] font-black text-neutral-100">{location || 'Your area'}</Text>
      </View>
      <Text className="text-[12px] font-mono font-black text-cyan-300">
        {temperature.toFixed(1)}°C, {humidity}% H
      </Text>
    </View>

    <View className="flex-row items-center gap-3 pt-3">
      <View className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <Droplets color="#60a5fa" size={19} />
      </View>
      <View className="flex-1">
        <Text className="text-[9.5px] uppercase text-neutral-400 font-mono font-black tracking-wide">
          Ambient Humidity
        </Text>
        <Text className="text-[19px] font-black text-white font-mono mt-0.5">{humidity}% rH</Text>
      </View>
    </View>

    <Text className="text-[10px] text-neutral-400 leading-[15px] italic mt-2.5">
      Surrounding water vapor directly affects your sweat evaporation potential and hydration loss.
    </Text>
  </GlassCard>
);

export default AmbientCard;
