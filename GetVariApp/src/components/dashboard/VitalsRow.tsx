import React from 'react';
import { Text, View } from 'react-native';
import { Activity, Heart, Thermometer } from 'lucide-react-native';

import GlassCard from '../GlassCard';
import { SensorData } from '../../types';

interface VitalsRowProps {
  sensorData: SensorData;
  /** Renders `--` in place of every reading while nothing is streaming. */
  connected?: boolean;
}

interface VitalProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  unitColor: string;
  caption: string;
  captionColor?: string;
}

const Vital: React.FC<VitalProps> = ({
  icon,
  label,
  value,
  unit,
  unitColor,
  caption,
  captionColor = '#64748b',
}) => (
  <GlassCard className="flex-1 bg-white/[0.01] rounded-[24px]" style={{ padding: 14 }}>
    <View className="flex-row items-center gap-1.5">
      {icon}
      <Text className="text-[9px] uppercase tracking-wider text-neutral-400 font-mono" numberOfLines={1}>
        {label}
      </Text>
    </View>
    <View className="flex-row items-end gap-1 my-2">
      <Text className="text-[26px] font-black text-white font-mono" style={{ letterSpacing: -1 }}>
        {value}
      </Text>
      <Text className="text-[9px] font-mono mb-1.5" style={{ color: unitColor }}>
        {unit}
      </Text>
    </View>
    <Text className="text-[8.5px]" style={{ color: captionColor }} numberOfLines={1}>
      {caption}
    </Text>
  </GlassCard>
);

/** Heart rate, strain and body temperature — the three live sensor readings. */
const VitalsRow: React.FC<VitalsRowProps> = ({ sensorData, connected = true }) => {
  const dash = (value: string) => (connected ? value : '--');

  return (
    <View className="flex-row gap-2.5 mb-4">
      <Vital
        icon={<Heart color="#ef4444" size={13} />}
        label="HR BPM"
        value={dash(String(sensorData.heartRate))}
        unit="BPM"
        unitColor="#ef4444"
        caption={sensorData.heartRate > 100 ? 'Cardio load high' : 'Baseline stable'}
      />
      <Vital
        icon={<Activity color="#a78bfa" size={13} />}
        label="Strain"
        value={dash(String(sensorData.activityLoad))}
        unit="/100"
        unitColor="#a78bfa"
        caption="Active kinetic force"
      />
      <Vital
        icon={<Thermometer color="#f97316" size={13} />}
        label="Body Temp"
        value={dash(sensorData.temperature.toFixed(1))}
        unit="°C"
        unitColor="#f97316"
        caption="Safe recovery state"
        captionColor="#10b981"
      />
    </View>
  );
};

export default VitalsRow;
