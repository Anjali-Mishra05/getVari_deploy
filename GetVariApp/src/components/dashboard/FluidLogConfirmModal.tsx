import React from 'react';
import { Text, View } from 'react-native';
import { Droplets } from 'lucide-react-native';

import Button from '../ui/Button';
import Dialog from '../ui/Dialog';

import { UserProfile } from '../../types';
import {
  calculatePredictedRiskAfterDrink,
  calculateRecoveryEstimation,
} from '../../utils/hydrationModel';
import { ACCENT } from './riskTheme';
import { accent, themed, tone } from '../../theme/theme';

interface FluidLogConfirmModalProps {
  /** The proposed amount, or null when the modal is closed. */
  amountMl: number | null;
  /** The engine's current score, or null when it has too little data. */
  currentRisk: number | null;
  profile?: UserProfile;
  /** True while the write is in flight, so the modal cannot be double-fired. */
  saving?: boolean;
  /** Set when the write failed, shown in place of a silent close. */
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** One label/value line in the predictive panel. */
const Row: React.FC<{
  label: string;
  value: string;
  labelColor?: string;
  valueColor?: string;
  divider?: boolean;
}> = ({ label, value, labelColor = tone('#94a3b8', '#52525b'), valueColor = tone('#ffffff', '#18181b'), divider = true }) => (
  <View
    className={themed('flex-row justify-between items-center py-2')}
    style={divider ? { borderTopWidth: 1, borderTopColor: tone('rgba(255,255,255,0.04)', 'rgba(24,24,27,0.08)') } : undefined}
  >
    <Text className={themed('text-[11.5px] font-mono font-bold')} style={{ color: labelColor }}>
      {label}
    </Text>
    <Text className={themed('text-[11.5px] font-mono font-black')} style={{ color: valueColor }}>
      {value}
    </Text>
  </View>
);

/**
 * The step between tapping an amount and it becoming a fact.
 *
 * It exists to show the *consequence* of the drink — where the risk score
 * lands once the water is absorbed, and how long that takes — so the number on
 * the ring is something the user chose rather than something that happened.
 */
const FluidLogConfirmModal: React.FC<FluidLogConfirmModalProps> = ({
  amountMl,
  currentRisk,
  profile,
  saving,
  error,
  onCancel,
  onConfirm,
}) => {
  const visible = amountMl !== null;
  // Guard the derivations: the modal stays mounted for its exit animation, and
  // `amountMl` is already null by then.
  const amount = Number.isFinite(amountMl as number) ? (amountMl as number) : 0;

  // `currentRisk` is null whenever the engine has too little data to score —
  // which is the normal state on a cold dashboard. Feeding that straight into
  // the arithmetic produced "NaN / 100" on both rows here; an unknown risk is
  // now reported as unknown, and the prediction is withheld rather than
  // invented.
  const riskKnown = currentRisk !== null && Number.isFinite(currentRisk);
  const safeRisk = riskKnown ? (currentRisk as number) : 0;
  const predictedRisk = calculatePredictedRiskAfterDrink(safeRisk, amount, profile);
  const currentRiskLabel = riskKnown ? `${safeRisk} / 100` : 'Not enough data yet';
  const predictedRiskLabel = riskKnown ? `${predictedRisk} / 100` : '—';

  const recoveryWindow = calculateRecoveryEstimation(amount, profile);
  const recoveryProgress = Math.max(0, Math.min(100, (amount / 1000) * 100));

  return (
    <Dialog
      visible={visible}
      onDismiss={onCancel}
      busy={!!saving}
      accessibilityLabel="Confirm fluid log"
    >
      <View className={themed('w-16 h-16 rounded-3xl items-center justify-center bg-cyan-950/60 border border-cyan-400/30')}>
        <Droplets color={accent()} size={30} />
      </View>

      <Text className={themed('text-[20px] font-black text-white tracking-tight mt-4')}>
        Fluid Log Simulation
      </Text>
      <Text className={themed('text-[12px] text-neutral-300 leading-[18px] text-center mt-1.5')}>
        Confirming <Text className={themed('text-cyan-400 font-bold')}>{amount}ml</Text> of active water
        intake?
      </Text>

      {/* Predictive stress analytics */}
      <View className={themed('w-full bg-black/50 rounded-2xl border border-white/5 px-4 py-1 mt-5')}>
        <Row label="Current Risk:" value={currentRiskLabel} divider={false} />
        <Row
          label="Predicted Risk after absorption:"
          value={predictedRiskLabel}
          labelColor={ACCENT}
          valueColor={tone('#34d399', '#047857')}
        />
        <Row label="Est. Recovery Window:" value={recoveryWindow} valueColor={tone('#67e8f9', '#0e7490')} />

        <View className={themed('py-2.5 border-t border-white/[0.04]')}>
          <Text className={themed('text-[9px] text-neutral-500 uppercase font-mono mb-1.5')}>
            Estimated Recovery Progress:
          </Text>
          <View className={themed('w-full h-1.5 rounded-full bg-white/5 overflow-hidden')}>
            <View
              className={themed('h-full rounded-full')}
              style={{ width: `${recoveryProgress}%`, backgroundColor: '#34d399' }}
            />
          </View>
        </View>
      </View>

      {!!error && (
        <Text className={themed('text-[11px] text-rose-400 font-bold text-center mt-3')}>{error}</Text>
      )}

      <View className={themed('flex-row gap-3 w-full mt-5')}>
        <Button
          label="Cancel"
          onPress={onCancel}
          variant="secondary"
          disabled={saving}
          style={{ flex: 1 }}
          accessibilityLabel="Cancel logging"
        />
        <Button
          label="Log Intake"
          onPress={onConfirm}
          loading={saving}
          style={{ flex: 1 }}
          accessibilityLabel={`Log ${amount} millilitres`}
        />
      </View>
    </Dialog>
  );
};

export default FluidLogConfirmModal;
