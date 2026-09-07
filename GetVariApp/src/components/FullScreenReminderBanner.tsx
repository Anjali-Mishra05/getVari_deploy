import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BellRing, X } from 'lucide-react-native';

import NotificationService from '../services/NotificationService';
import { ICON_HIT_SLOP } from './ui/Sheet';

/**
 * Offers the grants that let a reminder take over the screen.
 *
 * ## Why this has to exist
 *
 * The full-screen reminder was built, shipped and then never seen. Android 14
 * stopped granting `USE_FULL_SCREEN_INTENT` at install to anything that is not
 * a clock or a phone dialler, so the reminder silently degraded to a heads-up
 * banner. `fullScreenReminderStatus()` and the settings deep-link both existed
 * in `NotificationService` and were called from nowhere at all — so there was
 * no path, anywhere in the app, to turn the feature on.
 *
 * ## Why a banner rather than a prompt on launch
 *
 * The grants live in system settings pages, not dialogs: the app can only send
 * the user there, and a modal that does that on launch is an interruption
 * before the user has any reason to care. This appears in the dashboard's flow,
 * only when something is actually missing, and goes away for good once given.
 */

/**
 * Which asks the user has waved away, one key per ask.
 *
 * It used to be a single flag over the whole banner. That was fine while there
 * was one thing to ask for; with the "display over other apps" grant added it
 * would have meant every user who had already dismissed the lock-screen ask
 * was silently opted out of a permission that did not exist when they
 * dismissed it — and it is the grant covering the more common case, the phone
 * unlocked and in their hand. Each ask is now dismissed on its own, and the
 * old flag is read once so a dismissal made before this change still counts
 * for the ask it was actually about.
 */
const DISMISSED_KEY = 'getvari_reminder_banner_dismissed_v2';
const LEGACY_DISMISSED_KEY = 'getvari_fullscreen_banner_dismissed';

type AdviceId = 'channel' | 'full-screen-intent' | 'overlay';

/** The ask the pre-v2 flag was about, for migrating an existing dismissal. */
const LEGACY_DISMISSED_IDS: AdviceId[] = ['channel', 'full-screen-intent'];

export interface ReminderScreenStatus {
  granted: boolean;
  channelAllows: boolean;
  canLaunchOverApps: boolean;
  available: boolean;
  availableInUse: boolean;
}

/**
 * What is missing, in the user's terms, and where to fix it.
 *
 * Three switches in three different places can each suppress the reminder
 * screen, so naming the wrong one is worse than saying nothing: it sends the
 * user to a settings page that already looks correct and leaves them believing
 * the app is broken. They are checked in the order of how much they cost the
 * user, and only the first missing one is offered — a banner listing three
 * permissions gets dismissed unread.
 */
const adviceFor = (
  status: ReminderScreenStatus
): { id: AdviceId; title: string; body: string; open: () => void } | null => {
  // The channel comes first: with it turned down, neither grant does anything,
  // so asking for a permission would be asking for something inert.
  if (!status.channelAllows) {
    return {
      id: 'channel',
      title: 'Reminders are turned down',
      body: 'Reminders are set to silent or low priority, so they will not open over the screen. Raise their importance in notification settings.',
      open: () => void NotificationService.openFullScreenReminderSettings(),
    };
  }

  if (!status.granted) {
    return {
      id: 'full-screen-intent',
      title: 'Full-screen reminders are off',
      body: 'Android is holding reminders back to a small banner. Allow full-screen reminders so they open over the lock screen.',
      open: () => void NotificationService.openFullScreenReminderSettings(),
    };
  }

  // The grant above only covers a locked or dark screen. This is the one that
  // covers the user actually holding their phone, which is the more common
  // way to miss a reminder — so it is worth asking for even once the
  // lock-screen half already works.
  if (!status.canLaunchOverApps) {
    return {
      id: 'overlay',
      title: 'Reminders stay a banner while you’re using your phone',
      body: 'Reminders open over the lock screen, but not while you are in another app. Allow GetVari to display over other apps so a reminder reaches you either way.',
      open: () => void NotificationService.openBackgroundLaunchSettings(),
    };
  }

  return null;
};

const FullScreenReminderBanner: React.FC = () => {
  const [status, setStatus] = useState<ReminderScreenStatus | null>(null);
  // Starts as "everything dismissed" so nothing flashes up in the frame before
  // the stored set has been read back.
  const [dismissed, setDismissed] = useState<AdviceId[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await NotificationService.fullScreenReminderStatus());
    } catch (error) {
      console.error('[Reminders] Could not read full-screen status:', error);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const loadDismissed = async () => {
      const stored = await AsyncStorage.getItem(DISMISSED_KEY);
      if (stored) return JSON.parse(stored) as AdviceId[];
      // No v2 set yet: honour the old single flag for the asks it covered.
      const legacy = await AsyncStorage.getItem(LEGACY_DISMISSED_KEY);
      return legacy === '1' ? LEGACY_DISMISSED_IDS : [];
    };

    loadDismissed()
      .then(setDismissed)
      .catch(error => {
        console.error('[Reminders] Could not read banner dismissals:', error);
        setDismissed([]);
      });

    // The grant is given in a system settings page, so the only signal that it
    // changed is the user coming back to the app. Without this the banner sits
    // there insisting on a permission that has just been granted.
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const dismiss = useCallback((id: AdviceId) => {
    setDismissed(current => {
      const next = current?.includes(id) ? current : [...(current ?? []), id];
      AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(next)).catch(error =>
        console.error('[Reminders] Could not persist banner dismissal:', error)
      );
      return next;
    });
  }, []);

  // Nothing to ask for, or the user has said no to this particular ask.
  // `status === null` covers the first frame and iOS, where the whole idea
  // does not apply; `dismissed === null` is the frame before the stored set
  // has come back.
  const advice = status ? adviceFor(status) : null;
  if (!advice || dismissed === null || dismissed.includes(advice.id)) return null;

  return (
    <View
      className="flex-row items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3.5 mb-3"
      accessibilityRole="alert"
    >
      <BellRing size={16} color="#f59e0b" style={{ marginTop: 1 }} />
      <View className="flex-1">
        <Text className="text-[12px] font-black text-amber-400 uppercase tracking-wider mb-1">
          {advice.title}
        </Text>
        <Text className="text-[11px] text-neutral-300 leading-[16px]">{advice.body}</Text>
        <TouchableOpacity
          onPress={advice.open}
          hitSlop={ICON_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`Open settings: ${advice.title}`}
        >
          <Text className="text-[11px] font-black uppercase text-[#00f2fe] tracking-wider mt-2.5">
            Open settings
          </Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={() => dismiss(advice.id)}
        hitSlop={ICON_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel="Dismiss this notice"
      >
        <X size={15} color="#64748b" />
      </TouchableOpacity>
    </View>
  );
};

export default FullScreenReminderBanner;
