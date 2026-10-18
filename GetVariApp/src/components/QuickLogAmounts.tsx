import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Keyboard, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, Droplets } from 'lucide-react-native';

import { MAX_SINGLE_ENTRY_ML } from '../services/HydrationService';
import { primaryQuickAmount, quickLogAmounts } from '../utils/hydrationAmounts';
import { formatMl } from '../utils/hydrationFormat';
import { accent, tone } from '../theme/theme';

/**
 * The app's water-logging picker — quick amounts, the custom amount field and
 * the rules for the "Log" button under them — shared by the "Log water" sheet
 * and the full-screen reminder so the two look and behave as one control.
 *
 * Only the picking lives here. Each caller owns its own write, its own "Log"
 * button and what happens once the entry is saved.
 */

/** The small uppercase line over each group of controls. */
export const sectionLabel = {
  color: '#64748b',
  fontSize: 10,
  fontWeight: '800',
  letterSpacing: 1.4,
  marginBottom: 8,
} as const;

/**
 * "250 ml" as its figure and its unit, so the two can be set at different
 * sizes. The label comes from the admin config; one that is not a number
 * followed by a unit is shown whole, as the figure.
 */
const splitAmountLabel = (label: string): { figure: string; unit: string } => {
  const match = /^\s*([\d.,]+)\s*(\D.*)$/.exec(label);
  return match ? { figure: match[1], unit: match[2].trim() } : { figure: label, unit: '' };
};

export interface QuickLogSelection {
  /** The amount to log, or null when what is typed cannot be logged. */
  selectedMl: number | null;
  /** What is typed in the custom field, as text. */
  customText: string;
  /** True while the custom field holds anything — it is then the selection. */
  customActive: boolean;
  /** True when something is typed but it is not a loggable amount. */
  customInvalid: boolean;
  select: (amountMl: number) => void;
  typeCustom: (raw: string) => void;
  /** Back to `initialMl` (or the usual pre-selected amount) with the field cleared. */
  reset: (initialMl?: number) => void;
}

/**
 * The picked-but-not-committed amount, and the custom field that can stand in
 * for it.
 *
 * `frozen` is true once a write is in flight or done — selection is frozen
 * from then on. `onChange` runs on every accepted change, for the caller to
 * clear a stale failure message.
 */
export const useQuickLogSelection = (frozen: boolean, onChange?: () => void): QuickLogSelection => {
  /**
   * Starts on the amount most people log rather than on nothing. Opening to an
   * empty selection meant two taps for the common case — choose 500 ml, then
   * confirm — when the first of them was a foregone conclusion.
   */
  const [selectedMl, setSelectedMl] = useState<number | null>(() => primaryQuickAmount().ml);
  const [customText, setCustomText] = useState('');

  /**
   * Tapping an amount selects it; it is not written until "Log" is pressed.
   *
   * It used to write on the first tap, which meant a mis-tap was already a
   * row in the day's total and picking 500 left no way to change to 250 — the
   * reported defect. Selection is free and reversible; only the confirm step
   * writes.
   */
  const select = (amountMl: number) => {
    if (frozen) return;
    onChange?.();
    // Tapping the selected amount again used to clear it. With an amount
    // pre-selected that only leads to a disabled "Pick an amount" button the
    // user has to tap their way back out of, so the picker always holds a
    // valid choice and re-tapping the current one is a no-op.
    setSelectedMl(amountMl);
    // A quick amount replaces whatever was typed.
    setCustomText('');
    Keyboard.dismiss();
  };

  /**
   * Typing a custom amount selects it, in place of a quick amount.
   *
   * Digits only, and within the limit a single entry may carry — the same one
   * the dashboard's custom amount is held to. Clearing the field goes back to
   * the usual pre-selected amount, so the picker never sits on nothing.
   */
  const typeCustom = (raw: string) => {
    if (frozen) return;
    onChange?.();
    const digits = raw.replace(/[^0-9]/g, '').slice(0, 4);
    setCustomText(digits);
    if (digits === '') {
      setSelectedMl(primaryQuickAmount().ml);
      return;
    }
    const parsed = Number.parseInt(digits, 10);
    setSelectedMl(parsed > 0 && parsed <= MAX_SINGLE_ENTRY_ML ? parsed : null);
  };

  const reset = useCallback((initialMl?: number) => {
    setSelectedMl(typeof initialMl === 'number' ? initialMl : primaryQuickAmount().ml);
    setCustomText('');
  }, []);

  const customActive = customText !== '';
  return {
    selectedMl,
    customText,
    customActive,
    customInvalid: customActive && selectedMl === null,
    select,
    typeCustom,
    reset,
  };
};

/** The "Log" button's label, which always names what it is about to write. */
export const quickLogButtonLabel = (selection: QuickLogSelection, logged: boolean): string =>
  logged
    ? 'Logged'
    : selection.selectedMl === null
    ? selection.customActive
      ? 'Enter a valid amount'
      : 'Pick an amount'
    : `Log ${formatMl(selection.selectedMl)}`;

/** The same button's accessibility label. */
export const quickLogButtonAccessibilityLabel = (selection: QuickLogSelection): string =>
  selection.selectedMl === null ? 'Pick an amount first' : `Log ${formatMl(selection.selectedMl)}`;

interface QuickLogAmountsProps {
  selection: QuickLogSelection;
  /** True once a write is in flight or done. */
  busy: boolean;
  /** The amount being written, for its spinner. */
  savingMl: number | null;
  /** The amount just written, for its tick. */
  loggedMl: number | null;
}

/** The quick amounts and the custom amount field, as the "Log water" sheet draws them. */
const QuickLogAmounts: React.FC<QuickLogAmountsProps> = ({ selection, busy, savingMl, loggedMl }) => {
  const [customFocused, setCustomFocused] = useState(false);
  const { selectedMl, customText, customActive, customInvalid } = selection;

  return (
    <>
      <Text style={sectionLabel}>QUICK AMOUNTS</Text>

      {/* One row, shared equally, so the amounts read as a set of choices
          and the sheet stays short enough to sit above the keyboard. */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {quickLogAmounts().map(amount => {
          const isSaving = !customActive && savingMl === amount.ml;
          const isLogged = !customActive && loggedMl === amount.ml;
          const isSelected = !customActive && selectedMl === amount.ml;
          const highlight = isSelected || isLogged;
          const { figure, unit } = splitAmountLabel(amount.label);

          return (
            <TouchableOpacity
              key={amount.ml}
              onPress={() => selection.select(amount.ml)}
              disabled={busy}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, disabled: busy }}
              accessibilityLabel={`${amount.label}, ${amount.caption}${isSelected ? ', selected' : ''}`}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 80,
                paddingVertical: 12,
                paddingHorizontal: 8,
                borderRadius: 18,
                backgroundColor: highlight
                  ? tone('rgba(0,242,254,0.08)', 'rgba(8,145,178,0.08)')
                  : tone('rgba(255,255,255,0.03)', 'rgba(24,24,27,0.03)'),
                // The border keeps one width so selecting does not nudge
                // the label; only its colour changes.
                borderWidth: 1.5,
                borderColor: highlight
                  ? accent()
                  : tone('rgba(255,255,255,0.08)', 'rgba(24,24,27,0.12)'),
                // Dim the options that are not the one being written.
                opacity: busy && !isSaving && !isLogged ? 0.4 : 1,
              }}
            >
              <View style={{ height: 20, justifyContent: 'center' }}>
                {isSaving ? (
                  <ActivityIndicator color={accent()} size="small" />
                ) : highlight ? (
                  <Check color={accent()} size={18} strokeWidth={3} />
                ) : (
                  <Droplets color={tone('#94a3b8', '#52525b')} size={18} />
                )}
              </View>
              {/* The figure and its unit as one line on a shared baseline,
                  the unit a step smaller, so "250 ml" and "1 L" carry the
                  same weight across the row. */}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={{
                  color: tone('#ffffff', '#18181b'),
                  fontSize: 14,
                  fontWeight: '700',
                  marginTop: 6,
                }}
              >
                {figure}
                {!!unit && (
                  <Text style={{ color: tone('#94a3b8', '#52525b'), fontSize: 11, fontWeight: '600' }}>
                    {` ${unit}`}
                  </Text>
                )}
              </Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{ color: '#64748b', fontSize: 10, fontWeight: '600', marginTop: 3 }}
              >
                {amount.caption}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[sectionLabel, { marginTop: 18 }]}>CUSTOM AMOUNT</Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 44,
          paddingHorizontal: 16,
          borderRadius: 14,
          backgroundColor: tone('rgba(255,255,255,0.03)', 'rgba(24,24,27,0.03)'),
          borderWidth: 1.5,
          borderColor: customInvalid
            ? '#f43f5e'
            : customActive || customFocused
            ? accent()
            : tone('rgba(255,255,255,0.08)', 'rgba(24,24,27,0.12)'),
          opacity: busy && !customActive ? 0.4 : 1,
        }}
      >
        <TextInput
          value={customText}
          onChangeText={selection.typeCustom}
          onFocus={() => setCustomFocused(true)}
          onBlur={() => setCustomFocused(false)}
          editable={!busy}
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={4}
          // Nothing takes focus until it is tapped, so opening never raises
          // the keypad over the quick amounts.
          autoFocus={false}
          placeholder="Enter amount"
          placeholderTextColor={tone('#475569', '#a1a1aa')}
          accessibilityLabel="Custom amount in millilitres"
          testID="quick-log-custom"
          style={{
            flex: 1,
            padding: 0,
            color: tone('#ffffff', '#18181b'),
            fontSize: 13,
            fontWeight: '700',
          }}
        />
        <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700', marginLeft: 8 }}>ml</Text>
      </View>

      {customInvalid && (
        <Text style={{ color: '#f43f5e', fontSize: 11, fontWeight: '700', marginTop: 6 }}>
          {`Enter an amount from 1 to ${MAX_SINGLE_ENTRY_ML} ml.`}
        </Text>
      )}
    </>
  );
};

export default QuickLogAmounts;
