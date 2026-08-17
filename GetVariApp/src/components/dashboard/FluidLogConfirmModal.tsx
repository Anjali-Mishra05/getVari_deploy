import React from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Droplets } from 'lucide-react-native';

import { UserProfile } from '../../types';
import {
  calculatePredictedRiskAfterDrink,
  calculateRecoveryEstimation,
} from '../../utils/hydrationModel';
import { ACCENT } from './riskTheme';

interface FluidLogConfirmModalProps {
  /** The proposed amount, or null when the modal is closed. */
  amountMl: number | null;
  currentRisk: number;
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
}> = ({ label, value, labelColor = '#94a3b8', valueColor = '#ffffff', divider = true }) => (
  <View
    className="flex-row justify-between items-center py-2"
    style={divider ? { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' } : undefined}
  >
    <Text className="text-[11.5px] font-mono font-bold" style={{ color: labelColor }}>
      {label}
    </Text>
    <Text className="text-[11.5px] font-mono font-black" style={{ color: valueColor }}>
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
  const amount = amountMl ?? 0;
  const predictedRisk = calculatePredictedRiskAfterDrink(currentRisk, amount, profile);
  const recoveryWindow = calculateRecoveryEstimation(amount, profile);
  const recoveryProgress = Math.min(100, (amount / 1000) * 100);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <GestureHandlerRootView
        style={{
          flex: 1,
          backgroundColor: 'rgba(1,4,10,0.92)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(140)}
          className="w-full max-w-[380px] rounded-[36px] p-6 items-center"
          style={{ backgroundColor: '#080d16', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
        >
          <View className="w-16 h-16 rounded-3xl items-center justify-center bg-cyan-950/60 border border-cyan-400/30">
            <Droplets color={ACCENT} size={30} />
          </View>

          <Text className="text-[20px] font-black text-white tracking-tight mt-4">
            Fluid Log Simulation
          </Text>
          <Text className="text-[12px] text-neutral-300 leading-[18px] text-center mt-1.5">
            Confirming <Text className="text-cyan-400 font-bold">{amount}ml</Text> of active water
            intake?
          </Text>

          {/* Predictive stress analytics */}
          <View className="w-full bg-black/50 rounded-2xl border border-white/5 px-4 py-1 mt-5">
            <Row label="Current Risk:" value={`${currentRisk} / 100`} divider={false} />
            <Row
              label="Predicted Risk after absorption:"
              value={`${predictedRisk} / 100`}
              labelColor={ACCENT}
              valueColor="#34d399"
            />
            <Row label="Est. Recovery Window:" value={recoveryWindow} valueColor="#67e8f9" />

            <View className="py-2.5 border-t border-white/[0.04]">
              <Text className="text-[9px] text-neutral-500 uppercase font-mono mb-1.5">
                Estimated Recovery Progress:
              </Text>
              <View className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{ width: `${recoveryProgress}%`, backgroundColor: '#34d399' }}
                />
              </View>
            </View>
          </View>

          {!!error && (
            <Text className="text-[11px] text-rose-400 font-bold text-center mt-3">{error}</Text>
          )}

          <View className="flex-row gap-3 w-full mt-5">
            <TouchableOpacity
              onPress={onCancel}
              disabled={saving}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Cancel logging"
              className="flex-1 bg-white/5 border border-white/5 rounded-2xl py-3.5 items-center"
            >
              <Text className="text-[13px] font-black text-neutral-300">Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onConfirm}
              disabled={saving}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Log ${amount} millilitres`}
              className="flex-1 rounded-2xl py-3.5 items-center justify-center"
              style={{ backgroundColor: ACCENT, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? (
                <ActivityIndicator color="#020617" size="small" />
              ) : (
                <Text className="text-[13px] font-black text-[#020617]">Log Intake</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

export default FluidLogConfirmModal;
