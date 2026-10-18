import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
// Not React Native's own SafeAreaView: that is a plain View on Android and
// leaves the content under the system bars. This one applies the real insets.
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellRing, Check, ShieldAlert } from 'lucide-react-native';

import Button from '../components/ui/Button';
import NotificationService from '../services/NotificationService';
import {
  PERMISSION_REQUIREMENTS,
  firstMissing,
  missingRequirements,
  type PermissionKey,
  type PermissionRequirement,
  type PermissionSnapshot,
} from '../utils/permissionRequirements';
import { accent, themed, tone, useThemeMode } from '../theme/theme';

/**
 * The screen that stands between the user and an app that cannot do its job.
 *
 * ## Why a gate replaced the dashboard banner
 *
 * The grants were previously offered by a banner on the dashboard: one
 * requirement at a time, below the fold, next to a risk score that looked like
 * it was working. It was dismissible in practice — you scroll past it — and it
 * told a user whose reminders were silently degraded that everything was fine.
 * For a product whose entire output is a notification, "working except for the
 * notifications" is not a state worth rendering a dashboard for.
 *
 * ## Why it re-appears rather than being completed
 *
 * Nothing here is remembered. The grants are read on mount and on every
 * resume, so revoking one from App info and coming back puts this screen up
 * again — which is the behaviour asked for, and also the only honest one: the
 * app cannot deliver a reminder it no longer has permission to post, whatever
 * the user agreed to last week.
 *
 * ## Why every requirement is listed, not just the blocking one
 *
 * A gate that reveals its demands one at a time reads as a series of
 * refusals. All four are on screen from the start, each showing whether it is
 * done, so the user can see how much is left and that it is finite.
 */

interface PermissionGateScreenProps {
  snapshot: PermissionSnapshot;
  /** Re-reads the grants; called after every action the user takes here. */
  onRecheck: () => Promise<void> | void;
}

/** Sends the user wherever this grant is given. */
const openFor = async (key: PermissionKey): Promise<void> => {
  switch (key) {
    case 'notifications': {
      // The dialog first. Android stops showing it after two refusals and
      // resolves immediately instead, so a press that changes nothing falls
      // through to the settings page rather than looking broken.
      const granted = await NotificationService.promptForNotificationPermission();
      if (!granted) await NotificationService.openNotificationSettings();
      return;
    }
    case 'channelAllows':
    case 'fullScreenIntent':
      await NotificationService.openFullScreenReminderSettings();
      return;
    case 'displayOverApps':
      await NotificationService.openBackgroundLaunchSettings();
      return;
  }
};

/** One requirement: what it is, whether it is done, and how to do it. */
const RequirementRow: React.FC<{
  requirement: PermissionRequirement;
  granted: boolean;
  /** Only the first outstanding requirement offers its button. */
  active: boolean;
  busy: boolean;
  onPress: () => void;
}> = ({ requirement, granted, active, busy, onPress }) => (
  <View
    className={themed('rounded-3xl border px-4 py-4 mb-3')}
    style={{
      borderColor: granted
        ? 'rgba(16,185,129,0.25)'
        : active
        ? 'rgba(0,242,254,0.30)'
        : tone('rgba(255,255,255,0.07)', 'rgba(24,24,27,0.11)'),
      backgroundColor: granted
        ? 'rgba(16,185,129,0.06)'
        : active
        ? 'rgba(0,242,254,0.05)'
        : tone('rgba(255,255,255,0.02)', 'rgba(24,24,27,0.02)'),
    }}
    accessibilityRole="summary"
    accessibilityLabel={`${requirement.title}. ${granted ? 'Granted.' : 'Not granted.'}`}
  >
    <View className={themed('flex-row items-start gap-3')}>
      <View
        className={themed('w-6 h-6 rounded-lg items-center justify-center mt-0.5')}
        style={{
          backgroundColor: granted ? 'rgba(16,185,129,0.15)' : tone('rgba(255,255,255,0.05)', 'rgba(24,24,27,0.05)'),
          borderWidth: 1,
          borderColor: granted ? 'rgba(16,185,129,0.35)' : tone('rgba(255,255,255,0.10)', 'rgba(24,24,27,0.14)'),
        }}
      >
        {granted ? (
          <Check size={13} color={tone('#10b981', '#047857')} />
        ) : (
          <Text className={themed('text-[11px] font-black text-neutral-500')}>—</Text>
        )}
      </View>

      <View className={themed('flex-1')}>
        <Text
          className={themed('text-[13px] font-black')}
          style={{ color: granted ? '#6ee7b7' : tone('#ffffff', '#18181b') }}
        >
          {requirement.title}
        </Text>
        {/* The explanation is dropped once the grant is given: it exists to
            justify the ask, and a justification for something already done is
            just noise on a screen the user wants to leave. */}
        {!granted && (
          <Text className={themed('text-[11.5px] text-neutral-400 leading-[17px] mt-1')}>
            {requirement.body}
          </Text>
        )}
        {!granted && active && requirement.hint && (
          <Text className={themed('text-[10.5px] text-amber-300/90 leading-[15px] mt-2')}>
            {requirement.hint}
          </Text>
        )}

        {/* The restricted-setting escape hatch. Only on the active row, so it
            is never four blocks of instructions at once. */}
        {!granted && active && requirement.steps && (
          <View
            className={themed('mt-3 rounded-2xl px-3 py-2.5')}
            style={{ backgroundColor: tone('rgba(255,255,255,0.03)', 'rgba(24,24,27,0.03)') }}
          >
            {!!requirement.stepsIntro && (
              <Text className={themed('text-[10px] text-neutral-400 leading-[15px] mb-2')}>
                {requirement.stepsIntro}
              </Text>
            )}
            {requirement.steps.map((step, index) => (
              <View key={step} className={themed('flex-row gap-2 mb-1')}>
                <Text className={themed('text-[10px] font-black text-[#00f2fe] w-3')}>{index + 1}.</Text>
                <Text className={themed('text-[10px] text-neutral-300 leading-[15px] flex-1')}>{step}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>

    {/* One button at a time. Four live buttons invite the user to open four
        settings pages at once and lose track of which they have done. */}
    {!granted && active && (
      <View className={themed('mt-3.5')}>
        <Button
          label={requirement.action}
          onPress={onPress}
          loading={busy}
          size="md"
          fullWidth
          accessibilityLabel={`${requirement.action}: ${requirement.title}`}
        />
      </View>
    )}
  </View>
);

const PermissionGateScreen: React.FC<PermissionGateScreenProps> = ({ snapshot, onRecheck }) => {
  useThemeMode();
  const [busy, setBusy] = useState(false);
  const outstanding = missingRequirements(snapshot);
  const next = firstMissing(snapshot);
  const grantedCount = PERMISSION_REQUIREMENTS.length - outstanding.length;

  const handle = useCallback(
    async (key: PermissionKey) => {
      if (busy) return;
      setBusy(true);
      try {
        await openFor(key);
        // The dialog resolves immediately; a settings page does not, and the
        // resume listener in `usePermissionGate` is what catches that one.
        // This covers the dialog case so the row ticks over without waiting
        // for an app-state change that will not come.
        await onRecheck();
      } catch (error) {
        console.error('[Permissions] Could not open the grant:', error);
      } finally {
        setBusy(false);
      }
    },
    [busy, onRecheck]
  );

  return (
    <SafeAreaView className={themed('flex-1 bg-[#02050e]')}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className={themed('w-12 h-12 rounded-2xl items-center justify-center mb-5')}
          style={{ backgroundColor: 'rgba(0,242,254,0.10)', borderWidth: 1, borderColor: 'rgba(0,242,254,0.25)' }}
        >
          <BellRing size={20} color={accent()} />
        </View>

        <Text className={themed('text-[9px] uppercase font-mono tracking-[2px] text-[#00f2fe] mb-2')}>
          Before we start
        </Text>
        <Text className={themed('text-[24px] font-black text-white leading-[30px]')}>
          GetVari needs a few permissions
        </Text>
        <Text className={themed('text-[12.5px] text-neutral-400 leading-[19px] mt-2.5')}>
          Everything this app does, it does by reaching you at the right moment. Without these it
          can still record what you drink, but it cannot tell you when to.
        </Text>

        <View
          className={themed('flex-row items-center gap-2 mt-4 mb-6 px-3 py-2 rounded-xl')}
          style={{ backgroundColor: tone('rgba(255,255,255,0.03)', 'rgba(24,24,27,0.03)') }}
        >
          <ShieldAlert size={13} color="#64748b" />
          <Text className={themed('text-[10.5px] text-neutral-500 flex-1')}>
            {grantedCount} of {PERMISSION_REQUIREMENTS.length} granted
          </Text>
        </View>

        {PERMISSION_REQUIREMENTS.map(requirement => (
          <RequirementRow
            key={requirement.key}
            requirement={requirement}
            granted={snapshot[requirement.key]}
            active={next?.key === requirement.key}
            busy={busy && next?.key === requirement.key}
            onPress={() => void handle(requirement.key)}
          />
        ))}

        <Text className={themed('text-[10.5px] text-neutral-600 leading-[16px] mt-3 text-center')}>
          This screen appears whenever one of these is switched off, including after you change it
          in Android’s App info.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

/** The full-screen spinner shown while the first read is in flight. */
export const PermissionGateLoading: React.FC = () => (
  <View className={themed('flex-1 bg-[#02050e] items-center justify-center')}>
    <ActivityIndicator color={accent()} />
  </View>
);

export default PermissionGateScreen;
