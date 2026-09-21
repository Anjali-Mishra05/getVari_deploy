import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Plus } from 'lucide-react-native';

import GlassCard from '../GlassCard';
import { cardStyle } from './cardTheme';
import { MAX_SINGLE_ENTRY_ML } from '../../services/HydrationService';
import { quickLogAmounts } from '../../utils/hydrationAmounts';
import { ACCENT } from './riskTheme';

interface QuickFluidLogStationProps {
  /** Opens the confirmation step. Nothing is written until it is accepted. */
  onSelectAmount: (amountMl: number) => void;
  disabled?: boolean;
}

/**
 * The amounts offered without any typing.
 *
 * Taken from the admin config's quick-log list, and capped at two so the deck
 * keeps its "two presets plus custom" shape. This used to be its own hardcoded
 * pair, which meant the dashboard offered 200ml and 500ml while the quick-log
 * sheet and the chat offered 250ml, 500ml and a litre.
 */
const presets = (): { ml: number; label: string }[] =>
  quickLogAmounts()
    .slice(0, 2)
    .map(amount => ({ ml: amount.ml, label: `+${amount.ml}ml ${amount.caption.replace(/^A /, '')}` }));

/**
 * The three-button intake deck.
 *
 * It only ever *proposes* an amount — the write happens after the confirmation
 * modal, so a mis-tap costs a tap rather than a wrong entry in the day's total.
 */
const QuickFluidLogStation: React.FC<QuickFluidLogStationProps> = ({ onSelectAmount, disabled }) => {
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState('');

  const parsedCustom = Number.parseInt(customAmount, 10);
  const customValid =
    Number.isFinite(parsedCustom) && parsedCustom > 0 && parsedCustom <= MAX_SINGLE_ENTRY_ML;

  const submitCustom = () => {
    if (!customValid) return;
    onSelectAmount(parsedCustom);
    setCustomAmount('');
    setCustomOpen(false);
  };

  return (
    <GlassCard className="bg-cyan-950/10 border-white/5" style={cardStyle}>
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-[10px] font-mono font-black tracking-wider uppercase text-neutral-300">
          Quick Fluid Log Station
        </Text>
        <View className="bg-cyan-500/10 px-2.5 py-1 rounded-full">
          <Text className="text-[9px] text-cyan-400 font-mono">Hydration calibration</Text>
        </View>
      </View>

      {customOpen ? (
        <View className="flex-row items-center gap-2">
          <TextInput
            value={customAmount}
            onChangeText={setCustomAmount}
            keyboardType="number-pad"
            placeholder="Amount in ml"
            placeholderTextColor="#475569"
            autoFocus
            onSubmitEditing={submitCustom}
            returnKeyType="done"
            accessibilityLabel="Custom amount in millilitres"
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-white font-mono text-[13px]"
          />
          <TouchableOpacity
            onPress={submitCustom}
            disabled={!customValid}
            accessibilityRole="button"
            accessibilityLabel="Add custom amount"
            className="px-4 py-2.5 rounded-xl"
            style={{ backgroundColor: ACCENT, opacity: customValid ? 1 : 0.35 }}
          >
            <Text className="text-[12px] font-black text-[#020617]">Add</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setCustomOpen(false);
              setCustomAmount('');
            }}
            accessibilityRole="button"
            accessibilityLabel="Cancel custom amount"
            className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/5"
          >
            <Text className="text-[12px] font-black text-neutral-300">Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View className="flex-row gap-2">
          {presets().map(preset => (
            <TouchableOpacity
              key={preset.ml}
              onPress={() => onSelectAmount(preset.ml)}
              disabled={disabled}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Log ${preset.ml} millilitres`}
              className="flex-1 bg-white/[0.04] border border-white/5 rounded-2xl py-3 items-center justify-center gap-1"
              style={{ opacity: disabled ? 0.4 : 1 }}
            >
              <Plus color={ACCENT} size={14} strokeWidth={3} />
              <Text className="text-[11px] font-black text-neutral-200">{preset.label}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            onPress={() => setCustomOpen(true)}
            disabled={disabled}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Log a custom amount"
            className="flex-1 bg-white/[0.04] border border-white/5 rounded-2xl py-3 items-center justify-center gap-1"
            style={{ opacity: disabled ? 0.4 : 1 }}
          >
            <Plus color={ACCENT} size={14} strokeWidth={3} />
            <Text className="text-[11px] font-black text-cyan-400">Custom Amount</Text>
          </TouchableOpacity>
        </View>
      )}
    </GlassCard>
  );
};

export default QuickFluidLogStation;
