import React from 'react';
import { Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import Button from '../ui/Button';
import Dialog from '../ui/Dialog';

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
  // The dialog stays mounted through its exit animation, by which time
  // `amountMl` is already null — hence the guard rather than a bare read.
  const amount = Number.isFinite(amountMl as number) ? (amountMl as number) : 0;
  const glasses = amount / 250;

  return (
    <Dialog visible={visible} onDismiss={onDismiss} accessibilityLabel="Intake logged">
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
        Registered <Text className="text-emerald-400 font-black">+{amount} ml</Text> of active fluid
        to your real-time physiological model.
      </Text>

      <View className="flex-row gap-2 w-full mt-4">
        <Fact
          label="Equivalence"
          value={
            <Text className="text-[12px] font-black text-neutral-200">
              {glasses.toFixed(1)} Glasses
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

      {!!message && (
        <Text className="text-[10.5px] text-neutral-400 leading-[16px] italic text-center mt-4">
          “{message}”
        </Text>
      )}

      <Button
        label="Done"
        onPress={onDismiss}
        fullWidth
        style={{ marginTop: 20, backgroundColor: '#34d399', borderColor: '#34d399' }}
        accessibilityLabel="Dismiss confirmation"
      />
    </Dialog>
  );
};

export default FluidLogSuccessModal;
