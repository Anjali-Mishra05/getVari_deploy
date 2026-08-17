import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';

interface FluidLogSuccessModalProps {
  /** Amount that was written, or null when the modal is closed. */
  amountMl: number | null;
  /** Closing line — the hydration tip chosen for this entry. */
  message: string;
  onDismiss: () => void;
}

/** Small labelled fact in the two-up grid. */
const Fact: React.FC<{ label: string; value: React.ReactNode; caption: string }> = ({
  label,
  value,
  caption,
}) => (
  <View className="flex-1 bg-black/40 rounded-2xl border border-white/5 p-2.5">
    <Text className="text-[8px] uppercase font-mono tracking-wider text-neutral-500">{label}</Text>
    <View className="mt-1">{value}</View>
    <Text className="text-[8px] text-neutral-400 font-mono mt-0.5">{caption}</Text>
  </View>
);

/**
 * The receipt for a saved entry.
 *
 * Shown only after the write has succeeded, so the tick is evidence rather
 * than optimism — a failed write keeps the confirmation modal open with its
 * error instead of reaching this screen.
 */
const FluidLogSuccessModal: React.FC<FluidLogSuccessModalProps> = ({
  amountMl,
  message,
  onDismiss,
}) => {
  const visible = amountMl !== null;
  const amount = amountMl ?? 0;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
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
          style={{ backgroundColor: '#080d16', borderWidth: 1, borderColor: 'rgba(16,185,129,0.22)' }}
        >
          <View className="w-16 h-16 rounded-full items-center justify-center bg-emerald-950/60 border border-emerald-500/30">
            <Check color="#34d399" size={30} strokeWidth={3} />
          </View>

          <Text className="text-[9px] uppercase tracking-[0.2em] text-emerald-400 font-mono font-black mt-4">
            Biometric System Calibrated
          </Text>
          <Text className="text-[20px] font-black text-white tracking-tight mt-1.5">
            Intake Logged Successfully!
          </Text>

          <Text className="text-[12px] text-neutral-300 leading-[19px] text-center mt-2">
            Registered{' '}
            <Text className="text-emerald-400 font-black">+{amount} ml</Text> of active fluid to your
            real-time physiological model.
          </Text>

          <View className="flex-row gap-2 w-full mt-4">
            <Fact
              label="Equivalence"
              value={
                <Text className="text-[12px] font-black text-neutral-200">
                  {(amount / 250).toFixed(1)} Glasses
                </Text>
              }
              caption="250ml scale"
            />
            <Fact
              label="Metabolized"
              value={
                <View className="flex-row items-center gap-1.5">
                  <View className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <Text className="text-[12px] font-black text-neutral-200">100% Synced</Text>
                </View>
              }
              caption="Telemetry stream"
            />
          </View>

          <Text className="text-[10.5px] text-neutral-400 leading-[16px] italic text-center mt-4">
            “{message}”
          </Text>

          <TouchableOpacity
            onPress={onDismiss}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Dismiss confirmation"
            className="w-full rounded-2xl py-3.5 items-center mt-5"
            style={{ backgroundColor: '#34d399' }}
          >
            <Text className="text-[13px] font-black text-[#020617]">Done</Text>
          </TouchableOpacity>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

export default FluidLogSuccessModal;
