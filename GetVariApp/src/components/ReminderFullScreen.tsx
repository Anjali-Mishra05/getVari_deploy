import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Clock, Droplets, MessageCircle } from 'lucide-react-native';

import Button from './ui/Button';
import { SNOOZE_OPTIONS_MIN } from '../services/ActiveReminder';
import QuickLogAmounts, {
  quickLogButtonAccessibilityLabel,
  quickLogButtonLabel,
  useQuickLogSelection,
} from './QuickLogAmounts';
import { formatMl } from '../utils/hydrationFormat';
import { accent, accentFill, tone, useThemeMode } from '../theme/theme';

/**
 * The screen's colours in the current dark/light mode.
 *
 * Read during render, from the one shared mode every other screen follows:
 * the reminder is opened by a notification, often with nothing else of the
 * app on screen, and it must still look like the app the user set up. The
 * dark column is what this screen has always drawn.
 */
const palette = () => ({
  backdrop: tone('#02050e', '#f5f5f3'),
  /** The accent as text or an icon. */
  accent: accent(),
  /** The accent as a fill or a selection outline. */
  accentFill: accentFill(),
  accentTint: tone('rgba(0,242,254,0.10)', 'rgba(8,145,178,0.08)'),
  accentTintBorder: tone('rgba(0,242,254,0.28)', 'rgba(8,145,178,0.30)'),
  title: tone('#ffffff', '#18181b'),
  strong: tone('#e2e8f0', '#27272a'),
  value: tone('#cbd5e1', '#3f3f46'),
  body: tone('#94a3b8', '#52525b'),
  muted: tone('#64748b', '#71717a'),
  faint: tone('#475569', '#71717a'),
  surface: tone('rgba(255,255,255,0.03)', '#ffffff'),
  surfaceRaised: tone('rgba(255,255,255,0.04)', '#ffffff'),
  border: tone('rgba(255,255,255,0.08)', '#e4e4e7'),
  borderSoft: tone('rgba(255,255,255,0.07)', '#e4e4e7'),
  divider: tone('rgba(255,255,255,0.06)', '#e4e4e7'),
  track: tone('rgba(255,255,255,0.06)', '#e4e4e7'),
});

/**
 * The screen's spacing, in two numbers.
 *
 * Everything here used to carry its own margin — 26 under the header, 12 under
 * the chips, 22 under the progress card, 22 under the amounts, 14 and 12 and 8
 * between the buttons — so no two gaps on the screen were the same and none of
 * them matched the dashboard behind it.
 */
const GUTTER = 24;
const GAP = 16;
/** The gap inside a group — between two amount chips, or two stacked buttons. */
const TIGHT = 10;

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
   * Hand the reminder over to the chat.
   *
   * A reminder used to open the chatbot outright, which put a conversation in
   * front of someone whose whole intent was to log a glass of water. The fast
   * path is the buttons above; this is the way out for anyone who would rather
   * describe what they drank, or ask something first.
   */
  onAskVari: () => void;
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
  /**
   * The live hydration risk score, or null for "Insufficient Data".
   *
   * Read straight off the running solve rather than off the notification,
   * which is why it can be shown at all: the shade's copy is written once at
   * delivery and then fixed, while this screen is rendering now. A null score
   * hides the row rather than printing a dash — a reminder is a bad place to
   * explain why a number is missing.
   */
  riskScore?: number | null;
  /** The engine's band for that score, e.g. "High Risk". */
  riskStatus?: string | null;
  /** Hours since the last logged drink, for the same line. */
  hoursSinceDrink?: number | null;
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
 * The risk bands' colours, matching the dashboard's dial.
 *
 * Taken from the same thresholds rather than a second set of numbers: a
 * reminder that colours 55 amber while the dashboard colours it red would have
 * the user believe the two screens disagree about their body.
 */
const riskTone = (score: number): string => {
  if (score >= 70) return '#ef4444';
  if (score >= 40) return '#f59e0b';
  return '#10b981';
};

/** "3h since your last drink" — the gap, in the units it is worth stating in. */
const describeDrinkGap = (hours: number): string => {
  const minutes = Math.round(hours * 60);
  if (minutes < 60) return `${Math.max(0, minutes)} min since water`;
  return `${Math.floor(hours)}h since water`;
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
  onAskVari,
  onClose,
  totalMl,
  targetMl,
  riskScore,
  riskStatus,
  hoursSinceDrink,
}) => {
  /** True while a snooze or a skip is being recorded. */
  const [saving, setSaving] = useState(false);
  /** The amount being written, and the amount written — as the "Log water" sheet tracks them. */
  const [savingMl, setSavingMl] = useState<number | null>(null);
  const [loggedMl, setLoggedMl] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const logged = loggedMl !== null;
  const busy = saving || savingMl !== null || logged;
  // The app's own picker, so the amounts, the highlight and the custom field
  // work exactly as they do in the "Log water" sheet.
  const selection = useQuickLogSelection(busy, () => setFailed(false));
  const { selectedMl, reset } = selection;

  // Every opening starts from the pre-selected amount, so a previous failure,
  // a previous choice or a stale tick is never inherited.
  useEffect(() => {
    if (!visible) return;
    reset();
    setSaving(false);
    setSavingMl(null);
    setLoggedMl(null);
    setFailed(false);
    setSnoozeOpen(false);
    setNow(Date.now());
  }, [visible, reset]);

  // A full-screen Modal's window does not resize for the keyboard either, so
  // the actions are lifted by its height and the custom field scrolled into
  // view while it is in use.
  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => {
      setKeyboardHeight(e.endCoordinates.height);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
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
    if (selectedMl === null || busy) return;
    Keyboard.dismiss();
    setSavingMl(selectedMl);
    setFailed(false);
    try {
      const ok = await onLog(selectedMl);
      if (ok) setLoggedMl(selectedMl);
      else setFailed(true);
    } catch (error) {
      console.error('[Reminders] Full-screen log failed:', error);
      setFailed(true);
    } finally {
      setSavingMl(null);
    }
  }, [busy, onLog, selectedMl]);

  const snooze = useCallback(
    async (minutes: number) => {
      if (busy) return;
      setSaving(true);
      try {
        await onSnooze(minutes);
      } catch (error) {
        console.error('[Reminders] Snooze failed:', error);
      } finally {
        setSaving(false);
      }
    },
    [busy, onSnooze]
  );

  const skip = useCallback(async () => {
    if (busy) return;
    setSaving(true);
    try {
      await onSkip();
    } catch (error) {
      console.error('[Reminders] Skip failed:', error);
    } finally {
      setSaving(false);
    }
  }, [busy, onSkip]);

  // Follows the shared mode, and re-renders if it changes while this is up.
  const light = useThemeMode() === 'light';
  const colors = palette();

  const keyboardOpen = keyboardHeight > 0;
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
      <StatusBar barStyle={light ? 'dark-content' : 'light-content'} backgroundColor={colors.backdrop} />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.backdrop }}>
        {/*
          Only what can be read scrolls; what has to be *pressed* does not.

          This was one scroll view with the buttons at the end of it, centred
          as a block. On a short screen — and with the chips, the progress card
          and four amounts above them, that is most screens — the actions sat
          below the fold, so the reminder opened showing a headline, a number
          and no way to answer either. A prompt the user is meant to answer
          cannot put its answers somewhere they have to go looking for, so the
          actions are pinned to the bottom of the screen and the content above
          takes whatever room is left.
        */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: GUTTER,
            paddingTop: GUTTER,
            paddingBottom: GAP,
            justifyContent: 'center',
          }}
          showsVerticalScrollIndicator={false}
          // A quick amount must take the tap that the open keyboard would
          // otherwise swallow.
          keyboardShouldPersistTaps="handled"
        >
          {/* -------------------------------------------------- Header */}
          <View style={{ alignItems: 'center', marginBottom: GUTTER }}>
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: 30,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.accentTint,
                borderWidth: 1,
                borderColor: colors.accentTintBorder,
                marginBottom: 18,
              }}
            >
              {logged ? (
                <Check color={colors.accent} size={40} strokeWidth={3} />
              ) : (
                <Droplets color={colors.accent} size={38} strokeWidth={2.2} />
              )}
            </View>

            <Text
              style={{
                color: colors.title,
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
                color: colors.body,
                fontSize: 14,
                fontWeight: '600',
                textAlign: 'center',
                marginTop: 8,
                lineHeight: 20,
              }}
            >
              {logged
                ? `${formatMl(loggedMl ?? 0)} added to today.`
                : 'Drink some water and record it — it takes one tap.'}
            </Text>

            {!!age && !logged && (
              <Text
                style={{
                  color: colors.faint,
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

          {/*
            Why the reminder states a number at all.

            "Time to hydrate" is a thing the user already knows; it is the line
            that turned this into something to dismiss. The risk score and the
            gap since the last drink are the two facts that answer "why now?",
            and they are the same figures the dashboard shows — read live here,
            so unlike the shade's copy they cannot be stale.
          */}
          {(typeof riskScore === 'number' || typeof hoursSinceDrink === 'number') && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                marginBottom: GAP,
              }}
            >
              {typeof riskScore === 'number' && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: `${riskTone(riskScore)}33`,
                    backgroundColor: `${riskTone(riskScore)}14`,
                    paddingHorizontal: 11,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{ color: riskTone(riskScore), fontSize: 11, fontWeight: '900' }}
                  >
                    RISK {Math.round(riskScore)}
                  </Text>
                  {!!riskStatus && (
                    <Text style={{ color: colors.body, fontSize: 10, fontWeight: '700' }}>
                      {riskStatus}
                    </Text>
                  )}
                </View>
              )}

              {typeof hoursSinceDrink === 'number' && (
                <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>
                  {describeDrinkGap(hoursSinceDrink)}
                </Text>
              )}
            </View>
          )}

          {/* ------------------------------------------- Today's progress */}
          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: colors.borderSoft,
              backgroundColor: colors.surface,
              paddingHorizontal: 18,
              paddingVertical: 14,
              marginBottom: GAP,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text
                style={{ color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 }}
              >
                TODAY
              </Text>
              <Text
                style={{ color: colors.value, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}
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
                  backgroundColor: colors.track,
                  marginTop: 10,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${progress * 100}%`,
                    height: '100%',
                    borderRadius: 3,
                    backgroundColor: colors.accentFill,
                  }}
                />
              </View>
            )}
          </View>

          {/* ------------------------------------------------- Amounts */}
          {/*
            The app's own water-logging picker, shared with the "Log water"
            sheet: every configured amount (250 ml, 500 ml, 750 ml, 1 L) with
            the selected one highlighted, and the Custom Amount field. A tap
            picks the amount; the Log button below writes it.
          */}
          {!logged && (
            <QuickLogAmounts
              selection={selection}
              busy={busy}
              savingMl={savingMl}
              loggedMl={loggedMl}
            />
          )}
        </ScrollView>

        {/* ------------------------------------------------- Actions */}
        {!logged && (
          <View
            style={{
              paddingHorizontal: GUTTER,
              paddingTop: GAP,
              paddingBottom: keyboardOpen ? keyboardHeight + GAP : GUTTER,
              borderTopWidth: 1,
              borderTopColor: colors.divider,
              backgroundColor: colors.backdrop,
            }}
          >
            {failed && (
              <Text
                style={{
                  color: '#f43f5e',
                  fontSize: 12,
                  fontWeight: '700',
                  textAlign: 'center',
                  marginBottom: TIGHT,
                }}
              >
                Couldn't save that entry. Check your connection and try again.
              </Text>
            )}
            {/* Labelled and enabled by the same rules as the sheet's button. */}
            <Button
              label={quickLogButtonLabel(selection, logged)}
              onPress={commit}
              size="lg"
              fullWidth
              loading={savingMl !== null}
              disabled={busy || selectedMl === null}
              accessibilityLabel={quickLogButtonAccessibilityLabel(selection)}
              testID="reminder-log"
            />

            {/* While a custom amount is being typed only "Log" stays above
                the keyboard, so the field itself is not pushed off screen. */}
            {keyboardOpen ? null : snoozeOpen ? (
              <View style={{ marginTop: TIGHT, gap: TIGHT }}>
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
                      backgroundColor: colors.surfaceRaised,
                      borderWidth: 1,
                      borderColor: colors.border,
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <Clock color={colors.body} size={15} />
                    <Text style={{ color: colors.value, fontSize: 13, fontWeight: '800' }}>
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
                icon={<Clock color={colors.value} size={16} />}
                style={{ marginTop: TIGHT }}
                testID="reminder-snooze"
              />
            )}

            {!snoozeOpen && !keyboardOpen && (
              <Button
                label="Ask Vari instead"
                onPress={() => {
                  onClose();
                  onAskVari();
                }}
                variant="ghost"
                size="md"
                fullWidth
                disabled={busy}
                icon={<MessageCircle color={colors.body} size={15} />}
                style={{ marginTop: TIGHT }}
                testID="reminder-ask-vari"
              />
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

export { CONFIRM_MS as REMINDER_CONFIRM_MS };
export default ReminderFullScreen;
