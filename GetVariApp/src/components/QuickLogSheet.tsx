import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Check, Droplets, X } from 'lucide-react-native';

import { QUICK_LOG_AMOUNTS } from '../utils/hydrationAmounts';
import { formatMl } from '../utils/hydrationFormat';

interface QuickLogSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Writes the entry. Resolves `false` when nothing was recorded. */
  onLog: (amountMl: number) => Promise<boolean>;
  totalMl: number;
  targetMl: number;
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
  const [pendingMl, setPendingMl] = useState<number | null>(null);
  const [loggedMl, setLoggedMl] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  // Every open starts clean, so a previous failure or tick is never inherited.
  useEffect(() => {
    if (!visible) return;
    setPendingMl(null);
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

  const handlePress = async (amountMl: number) => {
    // One write at a time: a second tap while the first is in flight would
    // otherwise queue a duplicate entry behind it.
    if (pendingMl !== null || loggedMl !== null) return;

    setPendingMl(amountMl);
    setFailed(false);
    try {
      const ok = await onLog(amountMl);
      if (ok) {
        setLoggedMl(amountMl);
      } else {
        setFailed(true);
      }
    } catch (error) {
      console.error('[Hydration] Quick log failed:', error);
      setFailed(true);
    } finally {
      setPendingMl(null);
    }
  };

  const busy = pendingMl !== null || loggedMl !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* RN's Modal opens its own native window outside the app root's
          GestureHandlerRootView; without one here, gesture-handler swallows
          touches inside the sheet on Android. */}
      <GestureHandlerRootView
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' }}
      >
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1 }} />

        <Animated.View
          entering={SlideInDown.duration(280)}
          exiting={SlideOutDown.duration(220)}
          style={{
            backgroundColor: '#020617',
            borderTopLeftRadius: 40,
            borderTopRightRadius: 40,
            borderTopWidth: 1,
            borderColor: 'rgba(255,255,255,0.2)',
            paddingBottom: 40,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 24,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255,255,255,0.05)',
            }}
          >
            <View>
              <Text style={{ color: '#ffffff', fontWeight: '900', fontSize: 16 }}>
                Log water
              </Text>
              <Text
                style={{
                  color: '#64748b',
                  fontSize: 9,
                  fontWeight: '900',
                  letterSpacing: 2,
                  marginTop: 3,
                }}
              >
                {`${formatMl(totalMl)} OF ${formatMl(targetMl)} TODAY`.toUpperCase()}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 10 }}>
              <X color="#94a3b8" size={24} />
            </TouchableOpacity>
          </View>

          {/* Amounts */}
          <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
            {QUICK_LOG_AMOUNTS.map(amount => {
              const isPending = pendingMl === amount.ml;
              const isLogged = loggedMl === amount.ml;
              const highlight = amount.primary || isLogged;

              return (
                <TouchableOpacity
                  key={amount.ml}
                  onPress={() => handlePress(amount.ml)}
                  disabled={busy}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Log ${amount.label}`}
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
                    borderWidth: 1,
                    borderColor: highlight
                      ? 'rgba(0,242,254,0.28)'
                      : 'rgba(255,255,255,0.08)',
                    // Dim the options that are not the one being written.
                    opacity: busy && !isPending && !isLogged ? 0.4 : 1,
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
                    {isPending ? (
                      <ActivityIndicator color={ACCENT} size="small" />
                    ) : isLogged ? (
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
                      {(isLogged ? 'Logged' : amount.caption).toUpperCase()}
                    </Text>
                  </View>

                  {amount.primary && !busy && (
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
                }}
              >
                Couldn't save that entry. Check your connection and try again.
              </Text>
            )}
          </View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

export default QuickLogSheet;
