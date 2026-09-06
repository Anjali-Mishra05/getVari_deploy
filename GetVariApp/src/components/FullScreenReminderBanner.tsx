import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BellRing, X } from 'lucide-react-native';

import NotificationService from '../services/NotificationService';
import { ICON_HIT_SLOP } from './ui/Sheet';

/**
 * Offers the Android 14+ grant that lets a reminder take over the screen.
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
 * The grant lives in a system settings page, not a dialog: the app can only
 * send the user there, and a modal that does that on launch is an interruption
 * before the user has any reason to care. This appears in the dashboard's flow,
 * only when the grant is actually missing, and goes away for good once given.
 */

const DISMISSED_KEY = 'getvari_fullscreen_banner_dismissed';

/** Why the reminder is not taking over the screen, in the user's terms. */
const reasonFor = (status: { granted: boolean; channelAllows: boolean }): string => {
  if (!status.granted) {
    return 'Android is holding reminders back to a small banner. Allow full-screen reminders so they open over the lock screen.';
  }
  // The grant is there but the channel was turned down, which is a different
  // switch in a different place — saying "allow the permission" here would
  // send the user somewhere that already looks correct.
  return 'Reminders are set to silent or low priority, so they will not open over the screen. Raise their importance in notification settings.';
};

const FullScreenReminderBanner: React.FC = () => {
  const [status, setStatus] = useState<{ granted: boolean; channelAllows: boolean; available: boolean } | null>(null);
  const [dismissed, setDismissed] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setStatus(await NotificationService.fullScreenReminderStatus());
    } catch (error) {
      console.error('[Reminders] Could not read full-screen status:', error);
    }
  }, []);

  useEffect(() => {
    void refresh();
    AsyncStorage.getItem(DISMISSED_KEY)
      .then(value => setDismissed(value === '1'))
      .catch(() => setDismissed(false));

    // The grant is given in a system settings page, so the only signal that it
    // changed is the user coming back to the app. Without this the banner sits
    // there insisting on a permission that has just been granted.
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    AsyncStorage.setItem(DISMISSED_KEY, '1').catch(error =>
      console.error('[Reminders] Could not persist banner dismissal:', error)
    );
  }, []);

  // Nothing to ask for, or the user has said no. `status === null` covers the
  // first frame and iOS, where the whole idea does not apply.
  if (!status || status.available || dismissed) return null;

  return (
    <View
      className="flex-row items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3.5 mb-3"
      accessibilityRole="alert"
    >
      <BellRing size={16} color="#f59e0b" style={{ marginTop: 1 }} />
      <View className="flex-1">
        <Text className="text-[12px] font-black text-amber-400 uppercase tracking-wider mb-1">
          Full-screen reminders are off
        </Text>
        <Text className="text-[11px] text-neutral-300 leading-[16px]">{reasonFor(status)}</Text>
        <TouchableOpacity
          onPress={() => {
            void NotificationService.openFullScreenReminderSettings();
          }}
          hitSlop={ICON_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Open the settings that allow full-screen reminders"
        >
          <Text className="text-[11px] font-black uppercase text-[#00f2fe] tracking-wider mt-2.5">
            Open settings
          </Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={dismiss}
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
