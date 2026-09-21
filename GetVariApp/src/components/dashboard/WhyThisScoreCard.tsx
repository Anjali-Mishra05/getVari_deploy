import React from 'react';
import { Text, View } from 'react-native';
import { Layers } from 'lucide-react-native';

import GlassCard from '../GlassCard';
import { cardStyle } from './cardTheme';
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
  // A load can be null (the sensor said nothing) or, until the engine's field
  // names were unified, undefined. Either way it contributes nothing and is
  // shown as "--" rather than as the string "NaN".
  const points = (value: number | null | undefined, weight: number): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value * weight) : null;

  const rows = [
    { label: 'Heart Load', pts: points(risk.heartLoad, 0.3), weight: 0.3 },
    { label: 'Activity Load', pts: points(risk.activityLoad, 0.25), weight: 0.25 },
    { label: 'Temperature Load', pts: points(risk.temperatureLoad, 0.2), weight: 0.2 },
    { label: 'Humidity Load', pts: points(risk.humidityLoad, 0.1), weight: 0.1 },
    { label: 'Time Load', pts: points(risk.timeLoad, 0.15), weight: 0.15 },
  ];

  const scored = typeof risk.score === 'number' && Number.isFinite(risk.score);
  const baseTotal = rows.reduce((sum, row) => sum + (row.pts ?? 0), 0);
  const reweighted = scored && Math.abs(baseTotal - (risk.score as number)) > 1;

  return (
    <GlassCard className="bg-white/[0.01]" style={cardStyle}>
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
            {row.pts === null ? '--' : `${row.pts} pts`}
          </Text>
        </View>
      ))}

      <View className="flex-row justify-between items-center pt-3 mt-1 border-t border-white/10">
        <Text className="text-[12px] font-black text-cyan-400">Total Risk Score</Text>
        <Text
          className="text-[15px] font-mono font-black"
          style={{ color: scored ? loadColor(risk.score as number) : '#64748b' }}
        >
          {scored ? risk.score : '--'}
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
