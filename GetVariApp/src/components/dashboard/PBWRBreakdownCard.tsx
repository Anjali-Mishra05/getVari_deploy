import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Droplet, Info, AlertTriangle } from 'lucide-react-native';
import { PBWRBreakdown } from '../../services/PBWRService';
import GlassCard from '../GlassCard';

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
  return (
    <GlassCard style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Droplet size={20} color="#38bdf8" />
          <Text style={styles.title}>Personalized Water Target</Text>
        </View>
        <Info size={18} color="#94a3b8" />
      </View>

      {isPhysicianGated && !hasPhysicianLimit && (
        <View style={styles.cautionBanner}>
          <AlertTriangle size={16} color="#fbbf24" />
          <Text style={styles.cautionText}>
            Medical condition active. Please enter physician-recommended limit.
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

const PipelineItem = ({ label, value, isAdj, isBold, subLabel }: any) => (
  <View style={styles.pipelineItem}>
    <View>
      <Text style={[styles.itemLabel, isBold && styles.boldText]}>{label}</Text>
      {subLabel && <Text style={styles.subLabel}>{subLabel}</Text>}
    </View>
    <Text style={[styles.itemValue, isAdj && styles.adjText, isBold && styles.boldText]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
  },
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
    color: '#f8fafc',
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
    color: '#fbbf24',
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
    color: '#94a3b8',
  },
  subLabel: {
    fontSize: 10,
    color: '#64748b',
  },
  itemValue: {
    fontSize: 14,
    color: '#f1f5f9',
  },
  adjText: {
    color: '#38bdf8',
  },
  boldText: {
    fontWeight: '700',
    color: '#fff',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 4,
  },
  finalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    padding: 12,
    borderRadius: 12,
  },
  finalLabel: {
    fontSize: 12,
    color: '#38bdf8',
    marginBottom: 2,
  },
  finalValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  remainingBox: {
    alignItems: 'flex-end',
  },
  remainingLabel: {
    fontSize: 10,
    color: '#94a3b8',
  },
  remainingValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#38bdf8',
  },
});

export default PBWRBreakdownCard;
