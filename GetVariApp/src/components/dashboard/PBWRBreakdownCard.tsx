import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Droplet, Info, AlertTriangle } from 'lucide-react-native';
import { PBWRBreakdown } from '../../services/PBWRService';
import GlassCard from '../GlassCard';
import { cardStyle } from './cardTheme';
import { tone } from '../../theme/theme';

/**
 * Millilitres as litres, to two places.
 *
 * Every figure on this card is a division, and the breakdown behind them can
 * legitimately arrive incomplete — a profile saved without a weight, or an
 * upper limit with no qualifying category. `toFixed` on any of those prints
 * "NaN", so the conversion happens here, once, with a guard.
 */
const litres = (ml: unknown): string => {
  const value = Number(ml);
  return Number.isFinite(value) ? `${(value / 1000).toFixed(2)}` : '--';
};

interface Props {
  breakdown: PBWRBreakdown;
  hasPhysicianLimit: boolean;
  isPhysicianGated: boolean;
}

const PBWRBreakdownCard: React.FC<Props> = ({ breakdown, hasPhysicianLimit, isPhysicianGated }) => {
  const styles = makeStyles();
  return (
    <GlassCard adaptive style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Droplet size={20} color={tone('#38bdf8', '#0891b2')} />
          <Text style={styles.title}>Personalized Water Target</Text>
        </View>
        <Info size={18} color={tone('#94a3b8', '#71717a')} />
      </View>

      {isPhysicianGated && !hasPhysicianLimit && (
        <View style={styles.cautionBanner}>
          <AlertTriangle size={16} color="#fbbf24" />
          <Text style={styles.cautionText}>
            Medical condition active. You can add your physician's daily limit in your profile.
          </Text>
        </View>
      )}

      <View style={styles.pipeline}>
        <PipelineItem label="Baseline" value={`${litres(breakdown.pbwrBaseline)}L`} />
        <PipelineItem label="Activity" value={`+${litres(breakdown.activityAdj)}L`} isAdj />
        <PipelineItem label="Temperature" value={`+${litres(breakdown.tempAdj)}L`} isAdj />
        <PipelineItem label="Humidity" value={`+${litres(breakdown.humidityAdj)}L`} isAdj />
        <PipelineItem label="Work Env" value={`+${litres(breakdown.workEnvAdj)}L`} isAdj />
        <PipelineItem label="Health" value={`+${litres(breakdown.healthAdj)}L`} isAdj />

        <View style={styles.divider} />

        <PipelineItem label="Adjusted Total" value={`${litres(breakdown.adjustedTotal)}L`} isBold />
        <PipelineItem
          label="Upper Limit"
          value={`${litres(breakdown.upperLimit)}L`}
          subLabel={isPhysicianGated ? (hasPhysicianLimit ? "Physician-Set" : "Safety Cap") : "Algorithm Cap"}
        />

        <View style={styles.finalRow}>
          <View>
            <Text style={styles.finalLabel}>Final Daily Target</Text>
            <Text style={styles.finalValue}>{litres(breakdown.finalTarget)} L</Text>
          </View>
          <View style={styles.remainingBox}>
            <Text style={styles.remainingLabel}>Remaining</Text>
            <Text style={styles.remainingValue}>{litres(breakdown.remaining)} L</Text>
          </View>
        </View>
      </View>
    </GlassCard>
  );
};

const PipelineItem = ({ label, value, isAdj, isBold, subLabel }: any) => {
  const styles = makeStyles();
  return (
  <View style={styles.pipelineItem}>
    <View>
      <Text style={[styles.itemLabel, isBold && styles.boldText]}>{label}</Text>
      {subLabel && <Text style={styles.subLabel}>{subLabel}</Text>}
    </View>
    <Text style={[styles.itemValue, isAdj && styles.adjText, isBold && styles.boldText]}>{value}</Text>
  </View>
  );
};

/** Built per render: the text colours follow the dark/light mode. */
const makeStyles = () => StyleSheet.create({
  // The one card that used to set its own horizontal margin, on top of the
  // scroll view's padding — so it stood 16px narrower on each side than
  // everything above and below it.
  container: { ...cardStyle },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: tone('#f8fafc', '#18181b'),
  },
  cautionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  cautionText: {
    color: tone('#fbbf24', '#b45309'),
    fontSize: 12,
    flex: 1,
  },
  pipeline: {
    gap: 8,
  },
  pipelineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemLabel: {
    fontSize: 14,
    color: tone('#94a3b8', '#3f3f46'),
  },
  subLabel: {
    fontSize: 10,
    color: tone('#64748b', '#71717a'),
  },
  itemValue: {
    fontSize: 14,
    color: tone('#f1f5f9', '#18181b'),
  },
  adjText: {
    color: tone('#38bdf8', '#0e7490'),
  },
  boldText: {
    fontWeight: '700',
    color: tone('#fff', '#18181b'),
  },
  divider: {
    height: 1,
    backgroundColor: tone('#334155', '#e4e4e7'),
    marginVertical: 4,
  },
  finalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: tone('rgba(56, 189, 248, 0.1)', '#fafafa'),
    borderWidth: tone(0, 1),
    borderColor: tone('transparent', '#e4e4e7'),
    padding: 12,
    borderRadius: 12,
  },
  finalLabel: {
    fontSize: 12,
    color: tone('#38bdf8', '#0e7490'),
    marginBottom: 2,
  },
  finalValue: {
    fontSize: 24,
    fontWeight: '800',
    color: tone('#fff', '#18181b'),
  },
  remainingBox: {
    alignItems: 'flex-end',
  },
  remainingLabel: {
    fontSize: 10,
    color: tone('#94a3b8', '#3f3f46'),
  },
  remainingValue: {
    fontSize: 18,
    fontWeight: '600',
    color: tone('#38bdf8', '#0e7490'),
  },
});

export default PBWRBreakdownCard;
