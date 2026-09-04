import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import GlassCard from '../GlassCard';
import { ACCENT } from './riskTheme';

/**
 * What the dashboard shows while the profile and today's entries are being
 * read.
 *
 * It exists so the screen has something honest to render in that window. The
 * alternative it replaces was rendering the real cards against a hardcoded
 * 2,500ml goal and an empty log — numbers that looked exactly like measured
 * ones and were then silently replaced a second later.
 */
const Block: React.FC<{ height: number }> = ({ height }) => (
  <View
    style={{
      height,
      borderRadius: 28,
      backgroundColor: 'rgba(255,255,255,0.02)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.05)',
      marginBottom: 16,
    }}
  />
);

const DashboardSkeleton: React.FC = () => (
  <View accessibilityLabel="Loading your hydration data">
    <GlassCard className="my-3 bg-white/[0.01]" style={{ padding: 20, alignItems: 'center' }}>
      <ActivityIndicator color={ACCENT} />
      <Text
        style={{
          color: '#94a3b8',
          fontSize: 12,
          fontWeight: '700',
          marginTop: 14,
          textAlign: 'center',
        }}
      >
        Loading your hydration data…
      </Text>
      <Text
        style={{
          color: '#475569',
          fontSize: 10,
          lineHeight: 15,
          marginTop: 6,
          textAlign: 'center',
        }}
      >
        Your goal and today's entries appear as soon as they arrive.
      </Text>
    </GlassCard>

    <Block height={96} />
    <Block height={140} />
    <Block height={120} />
  </View>
);

export default DashboardSkeleton;
