import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Droplet, Info, AlertTriangle } from 'lucide-react-native';
import { PBWRBreakdown } from '../../services/PBWRService';
import GlassCard from '../GlassCard';

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
          <Text style={styles.title}>Personalized Water Target (PBWR)</Text>
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
        <PipelineItem label="PBWR Baseline" value={`${(breakdown.pbwrBaseline / 1000).toFixed(2)}L`} />
        <PipelineItem label="Activity" value={`+${(breakdown.activityAdj / 1000).toFixed(2)}L`} isAdj />
        <PipelineItem label="Temperature" value={`+${(breakdown.tempAdj / 1000).toFixed(2)}L`} isAdj />
        <PipelineItem label="Humidity" value={`+${(breakdown.humidityAdj / 1000).toFixed(2)}L`} isAdj />
        <PipelineItem label="Work Env" value={`+${(breakdown.workEnvAdj / 1000).toFixed(2)}L`} isAdj />
        <PipelineItem label="Health" value={`+${(breakdown.healthAdj / 1000).toFixed(2)}L`} isAdj />

        <View style={styles.divider} />

        <PipelineItem label="Adjusted Total" value={`${(breakdown.adjustedTotal / 1000).toFixed(2)}L`} isBold />
        <PipelineItem
          label="Upper Limit"
          value={`${(breakdown.upperLimit / 1000).toFixed(2)}L`}
          subLabel={isPhysicianGated ? (hasPhysicianLimit ? "Physician-Set" : "Safety Cap") : "Algorithm Cap"}
        />

        <View style={styles.finalRow}>
          <View>
            <Text style={styles.finalLabel}>Final Daily Target</Text>
            <Text style={styles.finalValue}>{(breakdown.finalTarget / 1000).toFixed(2)} L</Text>
          </View>
          <View style={styles.remainingBox}>
            <Text style={styles.remainingLabel}>Remaining</Text>
            <Text style={styles.remainingValue}>{(breakdown.remaining / 1000).toFixed(2)} L</Text>
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
