import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Activity, Droplets, Heart, RefreshCw, Sparkles, Thermometer } from 'lucide-react-native';

import GlassCard from '../GlassCard';
import { AIInsight } from '../../types';
import { ACCENT } from './riskTheme';

interface CoreAIInsightsProps {
  insights: AIInsight[];
  /** Re-runs the generator. Disabled while a run is in flight. */
  onRefresh: () => void;
  refreshing?: boolean;
}

/** Icon and accent per insight category, mirroring the web dashboard. */
const CATEGORY_STYLE: Record<
  AIInsight['category'],
  { color: string; well: string; icon: (color: string) => React.ReactNode }
> = {
  hydration: {
    color: '#60a5fa',
    well: 'rgba(59,130,246,0.1)',
    icon: color => <Droplets color={color} size={15} />,
  },
  activity: {
    color: '#a78bfa',
    well: 'rgba(139,92,246,0.1)',
    icon: color => <Activity color={color} size={15} />,
  },
  temperature: {
    color: '#fbbf24',
    well: 'rgba(245,158,11,0.1)',
    icon: color => <Thermometer color={color} size={15} />,
  },
  recovery: {
    color: '#34d399',
    well: 'rgba(16,185,129,0.1)',
    icon: color => <Heart color={color} size={15} />,
  },
};

/**
 * The narrative layer over the score: what the sensors mean, and what to do.
 *
 * Insights are generated on-device (see `hydrationInsights`), so the badge
 * reads "Adaptive rule" unless a run actually came back from the model.
 */
const CoreAIInsights: React.FC<CoreAIInsightsProps> = ({ insights, onRefresh, refreshing }) => (
  <GlassCard className="mb-4 bg-white/[0.01] rounded-[32px]" style={{ padding: 20 }}>
    <View className="flex-row items-center justify-between mb-4">
      <View className="flex-row items-center gap-2">
        <Sparkles color={ACCENT} size={17} />
        <Text className="text-[10px] uppercase tracking-[0.2em] font-black text-white/80">
          GetVari Core AI Insights
        </Text>
      </View>
      <TouchableOpacity
        onPress={onRefresh}
        disabled={refreshing}
        accessibilityRole="button"
        accessibilityLabel="Refresh insights"
        className="flex-row items-center gap-1.5 px-3 py-1.5 border border-white/10 rounded-xl"
        style={{ opacity: refreshing ? 0.5 : 1 }}
      >
        <RefreshCw color={ACCENT} size={11} />
        <Text className="text-[10px] font-black text-neutral-400">
          {refreshing ? 'Syncing' : 'Refresh Core'}
        </Text>
      </TouchableOpacity>
    </View>

    <View className="gap-2.5">
      {insights.map(insight => {
        const style = CATEGORY_STYLE[insight.category];
        return (
          <View
            key={insight.id}
            className="flex-row gap-3 bg-white/[0.02] p-3.5 rounded-2xl border border-white/5"
          >
            <View
              className="p-2 rounded-xl self-start"
              style={{ backgroundColor: style.well }}
            >
              {style.icon(style.color)}
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-2 flex-wrap">
                <Text className="text-[12px] font-black text-white">{insight.title}</Text>
                <View className="bg-cyan-950/60 border border-cyan-800/30 px-1.5 py-0.5 rounded">
                  <Text className="text-[7.5px] font-mono text-cyan-400 uppercase tracking-widest">
                    {insight.source === 'gemini_brain' ? 'Gemini 3.5' : 'Adaptive rule'}
                  </Text>
                </View>
              </View>
              <Text className="text-[11px] text-neutral-400 leading-[17px] italic mt-1.5">
                “{insight.text}”
              </Text>
            </View>
          </View>
        );
      })}
    </View>

    <Text className="text-[9px] font-mono text-neutral-500 text-right mt-2.5">
      <Text className="text-cyan-500">*</Text> Generated using sensor fusion analysis
    </Text>
  </GlassCard>
);

export default CoreAIInsights;
