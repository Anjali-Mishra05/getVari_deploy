import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Check, Droplets } from 'lucide-react-native';

import Button from './ui/Button';
import Sheet from './ui/Sheet';
import { quickLogAmounts } from '../utils/hydrationAmounts';
import { formatMl } from '../utils/hydrationFormat';

interface QuickLogSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Writes the entry. Resolves `false` when nothing was recorded. */
  onLog: (amountMl: number) => Promise<boolean>;
  totalMl: number;
  /** The daily goal, or null while the profile is still loading. */
  targetMl: number | null;
}

const ACCENT = '#00f2fe';

/** How long the tick stays up before the sheet closes itself. */
const CONFIRM_MS = 850;

/**
 * The "+" on the hydration card: log a glass, a bottle or a litre in one tap.
 *
 * Writing is delegated to the caller (which goes through `HydrationService`),
 * so an entry made here obeys the same idempotency and reminder-reset rules as
 * one made from the chat. The sheet only owns the interaction: one write at a
 * time, a visible outcome, and a close that the user does not have to perform.
 */
const QuickLogSheet: React.FC<QuickLogSheetProps> = ({
  visible,
  onClose,
  onLog,
  totalMl,
  targetMl,
}) => {
  /** The amount the user has picked but not yet committed. */
  const [selectedMl, setSelectedMl] = useState<number | null>(null);
  const [savingMl, setSavingMl] = useState<number | null>(null);
  const [loggedMl, setLoggedMl] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  // Every open starts clean, so a previous failure or tick is never inherited.
  useEffect(() => {
    if (!visible) return;
    setSelectedMl(null);
    setSavingMl(null);
    setLoggedMl(null);
    setFailed(false);
  }, [visible]);

  // Close on a delay so the confirmation is actually seen. Tied to `loggedMl`
  // rather than fired inline so an unmount mid-countdown cancels it.
  useEffect(() => {
    if (loggedMl === null) return;
    const timer = setTimeout(onClose, CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [loggedMl, onClose]);

  /**
   * Tapping an amount selects it; it is not written until "Log" is pressed.
   *
   * It used to write on the first tap, which meant a mis-tap was already a
   * row in the day's total and picking 500 left no way to change to 250 — the
   * reported defect. Selection is free and reversible; only the confirm step
   * writes.
   */
  const select = (amountMl: number) => {
    if (savingMl !== null || loggedMl !== null) return;
    setFailed(false);
    // Tapping the selected amount again clears it, so the sheet can be left
    // with nothing chosen.
    setSelectedMl(current => (current === amountMl ? null : amountMl));
  };

  const commit = async () => {
    if (selectedMl === null || savingMl !== null || loggedMl !== null) return;

    setSavingMl(selectedMl);
    setFailed(false);
    try {
      const ok = await onLog(selectedMl);
      if (ok) {
        setLoggedMl(selectedMl);
      } else {
        setFailed(true);
      }
    } catch (error) {
      console.error('[Hydration] Quick log failed:', error);
      setFailed(true);
    } finally {
      setSavingMl(null);
    }
  };

  /** True once a write is in flight or done — selection is frozen from then on. */
  const busy = savingMl !== null || loggedMl !== null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Log water"
      subtitle={
        targetMl === null
          ? `${formatMl(totalMl)} TODAY`.toUpperCase()
          : `${formatMl(totalMl)} OF ${formatMl(targetMl)} TODAY`.toUpperCase()
      }
    >
      {/* Amounts. The sheet sizes to its content, so the bottom inset lives
          here rather than on the panel. */}
      <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 }}>
        {quickLogAmounts().map(amount => {
              const isSaving = savingMl === amount.ml;
              const isLogged = loggedMl === amount.ml;
              const isSelected = selectedMl === amount.ml;
              // Selection is the strong state; `primary` only hints at the
              // amount most people pick before one has been chosen.
              const highlight = isSelected || isLogged || (selectedMl === null && amount.primary);

              return (
                <TouchableOpacity
                  key={amount.ml}
                  onPress={() => select(amount.ml)}
                  disabled={busy}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected, disabled: busy }}
                  accessibilityLabel={`${amount.label}${isSelected ? ', selected' : ''}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 18,
                    paddingHorizontal: 20,
                    borderRadius: 26,
                    marginBottom: 12,
                    backgroundColor: highlight
                      ? 'rgba(0,242,254,0.08)'
                      : 'rgba(255,255,255,0.03)',
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected
                      ? ACCENT
                      : highlight
                      ? 'rgba(0,242,254,0.28)'
                      : 'rgba(255,255,255,0.08)',
                    // Dim the options that are not the one being written.
                    opacity: busy && !isSaving && !isLogged ? 0.4 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 16,
                      backgroundColor: highlight
                        ? 'rgba(0,242,254,0.12)'
                        : 'rgba(255,255,255,0.04)',
                      borderWidth: 1,
                      borderColor: highlight
                        ? 'rgba(0,242,254,0.25)'
                        : 'rgba(255,255,255,0.08)',
                    }}
                  >
                    {isSaving ? (
                      <ActivityIndicator color={ACCENT} size="small" />
                    ) : isLogged || isSelected ? (
                      <Check color={ACCENT} size={20} strokeWidth={3} />
                    ) : (
                      <Droplets color={highlight ? ACCENT : '#94a3b8'} size={20} />
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: '#ffffff',
                        fontSize: 20,
                        fontWeight: '900',
                        letterSpacing: -0.5,
                      }}
                    >
                      {amount.label}
                    </Text>
                    <Text
                      style={{
                        color: '#64748b',
                        fontSize: 10,
                        fontWeight: '800',
                        letterSpacing: 1.4,
                        marginTop: 2,
                      }}
                    >
                      {(isLogged ? 'Logged' : isSelected ? 'Selected' : amount.caption).toUpperCase()}
                    </Text>
                  </View>

                  {amount.primary && selectedMl === null && !busy && (
                    <View
                      style={{
                        paddingHorizontal: 9,
                        paddingVertical: 4,
                        borderRadius: 9,
                        backgroundColor: 'rgba(0,242,254,0.12)',
                      }}
                    >
                      <Text
                        style={{
                          color: ACCENT,
                          fontSize: 8,
                          fontWeight: '900',
                          letterSpacing: 1.2,
                        }}
                      >
                        COMMON
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

        {failed && (
          <Text
            style={{
              color: '#f43f5e',
              fontSize: 11,
              fontWeight: '700',
              textAlign: 'center',
              marginTop: 4,
              marginBottom: 8,
            }}
          >
            Couldn't save that entry. Check your connection and try again.
          </Text>
        )}

        {/* Nothing is written until this is pressed, so an amount can be
            changed as many times as the user likes first. */}
        <Button
          label={
            loggedMl !== null
              ? 'Logged'
              : selectedMl === null
              ? 'Pick an amount'
              : `Log ${formatMl(selectedMl)}`
          }
          onPress={commit}
          size="lg"
          fullWidth
          loading={savingMl !== null}
          disabled={selectedMl === null || loggedMl !== null}
          style={{ marginTop: 8 }}
          accessibilityLabel={
            selectedMl === null ? 'Pick an amount first' : `Log ${formatMl(selectedMl)}`
          }
        />
      </View>
    </Sheet>
  );
};

export default QuickLogSheet;
