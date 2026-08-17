import React from 'react';
import { Text, View } from 'react-native';
import { Layers } from 'lucide-react-native';

import GlassCard from '../GlassCard';
import { HydrationRiskDetails } from '../../types';
import { ACCENT, loadColor } from './riskTheme';

interface WhyThisScoreCardProps {
  risk: HydrationRiskDetails;
}

/**
 * The score, shown as arithmetic.
 *
 * Each row is a load times its base weight, so a user who distrusts the score
 * can check it rather than take it. The engine re-weights those percentages
 * for weight, medical conditions and climate, so the rows can fall short of
 * the solved total — the footnote below says so rather than hiding it.
 */
const WhyThisScoreCard: React.FC<WhyThisScoreCardProps> = ({ risk }) => {
  const rows = [
    { label: 'Heart Load', value: risk.heartLoad, weight: 0.3 },
    { label: 'Activity Load', value: risk.activityLoad, weight: 0.25 },
    { label: 'Temperature Load', value: risk.temperatureLoad, weight: 0.2 },
    { label: 'Humidity Load', value: risk.humidityLoad, weight: 0.1 },
    { label: 'Time Load', value: risk.timeLoad, weight: 0.15 },
  ];

  const baseTotal = rows.reduce((sum, row) => sum + Math.round(row.value * row.weight), 0);
  const reweighted = Math.abs(baseTotal - risk.score) > 1;

  return (
    <GlassCard className="mb-4 bg-white/[0.01] rounded-[28px]" style={{ padding: 20 }}>
      <View className="flex-row items-center gap-2 mb-4">
        <Layers color={ACCENT} size={15} />
        <Text className="text-[10px] font-black tracking-wider uppercase text-neutral-200">
          Why This Score?
        </Text>
      </View>

      {rows.map(row => (
        <View
          key={row.label}
          className="flex-row justify-between items-center border-b border-white/[0.03] py-2"
        >
          <Text className="text-[11.5px] font-mono text-neutral-400">
            {row.label} ({Math.round(row.weight * 100)}%)
          </Text>
          <Text className="text-[11.5px] font-mono font-black text-white">
            {Math.round(row.value * row.weight)} pts
          </Text>
        </View>
      ))}

      <View className="flex-row justify-between items-center pt-3 mt-1 border-t border-white/10">
        <Text className="text-[12px] font-black text-cyan-400">Total Risk Score</Text>
        <Text className="text-[15px] font-mono font-black" style={{ color: loadColor(risk.score) }}>
          {risk.score}
        </Text>
      </View>

      {reweighted && (
        <Text className="text-[9px] text-neutral-500 leading-[14px] mt-2.5">
          Percentages shown are the model's base weights. Your profile re-weights them, so the
          solved total differs from their sum.
        </Text>
      )}
    </GlassCard>
  );
};

export default WhyThisScoreCard;
