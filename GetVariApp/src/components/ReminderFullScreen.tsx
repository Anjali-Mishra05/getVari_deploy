import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Clock, Droplets } from 'lucide-react-native';

import Button from './ui/Button';
import { SNOOZE_OPTIONS_MIN } from '../services/ActiveReminder';
import { primaryQuickAmount, quickLogAmounts } from '../utils/hydrationAmounts';
import { formatMl } from '../utils/hydrationFormat';

const ACCENT = '#00f2fe';
const BACKDROP = '#02050e';

/** How long the confirmation stays up before the screen closes itself. */
const CONFIRM_MS = 1100;

/**
 * Fixed times offered under "Remind me later", as minutes past the hour of the
 * user's day. Kept as offsets rather than clock times so the list is always
 * ahead of now, whatever hour the reminder fires at.
 */
const RESCHEDULE_OPTIONS = [
  { label: 'In 2 hours', minutes: 120 },
  { label: 'In 3 hours', minutes: 180 },
] as const;

export interface ReminderFullScreenProps {
  visible: boolean;
  /** Epoch ms the reminder was raised, for the "x minutes ago" line. */
  firedAt: number | null;
  /** Writes the entry. Resolves false when nothing was recorded. */
  onLog: (amountMl: number) => Promise<boolean>;
  /** Pushes the reminder back by `minutes` and closes. */
  onSnooze: (minutes: number) => Promise<void>;
  /** The user says they are not drinking now; the reminder is answered. */
  onSkip: () => Promise<void>;
  /**
   * Take the screen down. Called once the confirmation tick has been on
   * screen long enough to be read — the write itself has already happened by
   * then, through `onLog`.
   */
  onClose: () => void;
  /** Today's running total, or null while it is still loading. */
  totalMl: number;
  /** The daily goal, or null while the profile is still loading. */
  targetMl: number | null;
}

/** "just now" / "12 minutes ago" — how long the reminder has been waiting. */
const describeAge = (firedAt: number | null, now: number): string => {
  if (!firedAt) return '';
  const minutes = Math.floor((now - firedAt) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
};

/**
 * The reminder, as a screen the user has to answer rather than a banner they
 * can scroll past.
 *
 * ## Why this is not another sheet
 *
 * The reminder was a notification and nothing else: it sat in the shade next
 * to the social apps, it was swiped away with them, and reopening it later
 * found an event the app had already consumed. Every one of those is a
 * *passive* failure — the app asked politely and accepted silence as an
 * answer.
 *
 * This screen is the opposite. It is raised by the notification's full-screen
 * intent (so it appears over whatever the user is doing, and over the lock
 * screen), it fills the display, and the only ways out of it are answers:
 * log an amount, push it back, or say no. There is deliberately no close
 * button and no backdrop tap — "Not now" is the dismissal, and unlike a swipe
 * it is recorded as a decision.
 *
 * ## One tap, not two
 *
 * The amount most people log is selected when the screen opens, so the common
 * case is a single press on the confirm button. Picking a different amount is
 * still one tap, and it moves the confirm button's label with it — the user
 * always reads what they are about to write down.
 */
const ReminderFullScreen: React.FC<ReminderFullScreenProps> = ({
  visible,
  firedAt,
  onLog,
  onSnooze,
  onSkip,
  onClose,
  totalMl,
  targetMl,
}) => {
  const [selectedMl, setSelectedMl] = useState<number>(() => primaryQuickAmount().ml);
  const [saving, setSaving] = useState(false);
  const [logged, setLogged] = useState(false);
  const [failed, setFailed] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Every opening starts from the pre-selected amount, so a previous failure,
  // a previous choice or a stale tick is never inherited.
  useEffect(() => {
    if (!visible) return;
    setSelectedMl(primaryQuickAmount().ml);
    setSaving(false);
    setLogged(false);
    setFailed(false);
    setSnoozeOpen(false);
    setNow(Date.now());
  }, [visible]);

  // Close on a delay so the confirmation is actually seen. Tied to `logged`
  // rather than fired inline, so unmounting mid-countdown cancels it.
  useEffect(() => {
    if (!logged) return;
    const timer = setTimeout(onClose, CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [logged, onClose]);

  // The "how long ago" line would otherwise freeze at whatever it said when
  // the screen opened, which is wrong for a reminder left sitting on a locked
  // phone. A minute is as often as it can change.
  useEffect(() => {
    if (!visible || logged) return;
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, [visible, logged]);

  const commit = useCallback(async () => {
    if (saving || logged) return;
    setSaving(true);
    setFailed(false);
    try {
      const ok = await onLog(selectedMl);
      if (ok) setLogged(true);
      else setFailed(true);
    } catch (error) {
      console.error('[Reminders] Full-screen log failed:', error);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }, [saving, logged, onLog, selectedMl]);

  const snooze = useCallback(
    async (minutes: number) => {
      if (saving || logged) return;
      setSaving(true);
      try {
        await onSnooze(minutes);
      } catch (error) {
        console.error('[Reminders] Snooze failed:', error);
      } finally {
        setSaving(false);
      }
    },
    [saving, logged, onSnooze]
  );

  const skip = useCallback(async () => {
    if (saving || logged) return;
    setSaving(true);
    try {
      await onSkip();
    } catch (error) {
      console.error('[Reminders] Skip failed:', error);
    } finally {
      setSaving(false);
    }
  }, [saving, logged, onSkip]);

  const busy = saving || logged;
  // Read during render rather than memoised: the admin config can arrive after
  // this module is imported, and the list is four items long.
  const amounts = quickLogAmounts();
  const age = describeAge(firedAt, now);
  const progress =
    targetMl && targetMl > 0 ? Math.min(1, Math.max(0, totalMl / targetMl)) : null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      // Nothing behind this is meant to be reachable, so it is opaque rather
      // than a scrim over the dashboard.
      transparent={false}
      statusBarTranslucent
      presentationStyle="fullScreen"
      // Android's back gesture must not be a silent way out of the reminder;
      // it is routed to the same recorded decision the "Not now" button makes.
      onRequestClose={() => {
        if (!busy) void snooze(SNOOZE_OPTIONS_MIN[0]);
      }}
    >
      <StatusBar barStyle="light-content" backgroundColor={BACKDROP} />
      <SafeAreaView style={{ flex: 1, backgroundColor: BACKDROP }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingTop: 28,
            paddingBottom: 28,
            justifyContent: 'center',
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* -------------------------------------------------- Header */}
          <View style={{ alignItems: 'center', marginBottom: 26 }}>
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: 30,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,242,254,0.10)',
                borderWidth: 1,
                borderColor: 'rgba(0,242,254,0.28)',
                marginBottom: 18,
              }}
            >
              {logged ? (
                <Check color={ACCENT} size={40} strokeWidth={3} />
              ) : (
                <Droplets color={ACCENT} size={38} strokeWidth={2.2} />
              )}
            </View>

            <Text
              style={{
                color: '#ffffff',
                fontSize: 30,
                fontWeight: '900',
                letterSpacing: -1,
                textAlign: 'center',
              }}
            >
              {logged ? 'Logged' : 'Time to hydrate'}
            </Text>

            <Text
              style={{
                color: '#94a3b8',
                fontSize: 14,
                fontWeight: '600',
                textAlign: 'center',
                marginTop: 8,
                lineHeight: 20,
              }}
            >
              {logged
                ? `${formatMl(selectedMl)} added to today.`
                : 'Drink some water and record it — it takes one tap.'}
            </Text>

            {!!age && !logged && (
              <Text
                style={{
                  color: '#475569',
                  fontSize: 10,
                  fontWeight: '800',
                  letterSpacing: 1.3,
                  marginTop: 10,
                }}
              >
                {`REMINDER SET ${age}`.toUpperCase()}
              </Text>
            )}
          </View>

          {/* ------------------------------------------- Today's progress */}
          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.07)',
              backgroundColor: 'rgba(255,255,255,0.03)',
              paddingHorizontal: 18,
              paddingVertical: 14,
              marginBottom: 22,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text
                style={{ color: '#64748b', fontSize: 10, fontWeight: '800', letterSpacing: 1.3 }}
              >
                TODAY
              </Text>
              <Text
                style={{ color: '#cbd5e1', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}
              >
                {targetMl === null
                  ? formatMl(totalMl)
                  : `${formatMl(totalMl)} / ${formatMl(targetMl)}`}
              </Text>
            </View>

            {progress !== null && (
              <View
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  marginTop: 10,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${progress * 100}%`,
                    height: '100%',
                    borderRadius: 3,
                    backgroundColor: ACCENT,
                  }}
                />
              </View>
            )}
          </View>

          {/* ------------------------------------------------- Amounts */}
          {!logged && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
              {amounts.map(amount => {
                const isSelected = selectedMl === amount.ml;
                return (
                  <TouchableOpacity
                    key={amount.ml}
                    onPress={() => {
                      setFailed(false);
                      setSelectedMl(amount.ml);
                    }}
                    disabled={busy}
                    activeOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected, disabled: busy }}
                    accessibilityLabel={`${amount.label}, ${amount.caption}${
                      isSelected ? ', selected' : ''
                    }`}
                    style={{
                      flexGrow: 1,
                      flexBasis: '45%',
                      borderRadius: 22,
                      paddingVertical: 16,
                      paddingHorizontal: 16,
                      alignItems: 'center',
                      backgroundColor: isSelected
                        ? 'rgba(0,242,254,0.10)'
                        : 'rgba(255,255,255,0.03)',
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected ? ACCENT : 'rgba(255,255,255,0.08)',
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: isSelected ? '#ffffff' : '#e2e8f0',
                        fontSize: 19,
                        fontWeight: '900',
                        letterSpacing: -0.5,
                      }}
                    >
                      {amount.label}
                    </Text>
                    <Text
                      style={{
                        color: isSelected ? ACCENT : '#64748b',
                        fontSize: 9,
                        fontWeight: '800',
                        letterSpacing: 1.2,
                        marginTop: 4,
                      }}
                    >
                      {amount.caption.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {failed && (
            <Text
              style={{
                color: '#f43f5e',
                fontSize: 12,
                fontWeight: '700',
                textAlign: 'center',
                marginBottom: 12,
              }}
            >
              Couldn't save that entry. Check your connection and try again.
            </Text>
          )}

          {/* ------------------------------------------------- Actions */}
          {!logged && (
            <>
              <Button
                label={`Log ${formatMl(selectedMl)}`}
                onPress={commit}
                size="lg"
                fullWidth
                loading={saving && !snoozeOpen}
                disabled={busy}
                testID="reminder-log"
              />

              {snoozeOpen ? (
                <View style={{ marginTop: 14, gap: 8 }}>
                  {[
                    ...SNOOZE_OPTIONS_MIN.map(minutes => ({
                      label: `In ${minutes} minutes`,
                      minutes: minutes as number,
                    })),
                    ...RESCHEDULE_OPTIONS,
                  ].map(option => (
                    <TouchableOpacity
                      key={option.minutes}
                      onPress={() => void snooze(option.minutes)}
                      disabled={busy}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remind me ${option.label.toLowerCase()}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        paddingVertical: 14,
                        borderRadius: 18,
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.08)',
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      <Clock color="#94a3b8" size={15} />
                      <Text style={{ color: '#cbd5e1', fontSize: 13, fontWeight: '800' }}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}

                  <Button
                    label="Not now — skip this one"
                    onPress={skip}
                    variant="ghost"
                    size="md"
                    fullWidth
                    disabled={busy}
                    style={{ marginTop: 2 }}
                  />
                </View>
              ) : (
                <Button
                  label="Remind me later"
                  onPress={() => setSnoozeOpen(true)}
                  variant="secondary"
                  size="lg"
                  fullWidth
                  disabled={busy}
                  icon={<Clock color="#cbd5e1" size={16} />}
                  style={{ marginTop: 12 }}
                  testID="reminder-snooze"
                />
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

export { CONFIRM_MS as REMINDER_CONFIRM_MS };
export default ReminderFullScreen;
