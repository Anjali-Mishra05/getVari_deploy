import NotificationService from './NotificationService';
import ProfileService, { type ProfileReadResult } from './ProfileService';
import DailyTargetService from './DailyTargetService';
import { storedTargetForToday } from '../utils/dailyTargetRecord';
import { normaliseSleepSchedule } from '../utils/sleepWindow';

/**
 * Keeps the notification schedule in step with the signed-in account's profile.
 *
 * The profile is read first and the schedule built from it, never the other
 * way round: building first used whatever wake/sleep window happened to be
 * stored (or the 23:00-07:00 default after a reinstall) and only corrected it
 * once the profile arrived.
 *
 *  - The profile's window is the source of truth. If the profile cannot be
 *    read, the stored window — the last profile seen — is used instead.
 *  - A changed window, or a changed name or daily water target (both are part
 *    of the notification text), rebuilds every queue in place. Otherwise the
 *    queues are rebuilt only when `fullRebuild` asks for it.
 *
 * Pass `profileResult` when the caller has already read the profile, so it is
 * not read twice. Returns the read, for callers that also need the profile.
 */
export const reconcileNotificationsWithProfile = async (
  userId: string,
  options: { fullRebuild: boolean; profileResult?: ProfileReadResult }
): Promise<ProfileReadResult> => {
  const result = options.profileResult ?? (await ProfileService.fetchProfileResult(userId));
  const profile = result.failed ? null : result.profile;

  let nameChanged = false;
  if (profile) {
    try {
      nameChanged = await NotificationService.setNotificationRecipient(profile.fullName);
    } catch (error) {
      console.error('[Notifications] Failed to apply the notification name:', error);
    }
  }

  // The Daily Water Requirement has no text without a target, so one is put in
  // place before the schedule is built rather than left to the dashboard's
  // PBWR calculation, which finishes later — or, offline, not at all.
  let targetChanged = false;
  try {
    // Today's Final Daily Target where one exists: locked on this device, or
    // stored on the profile row.
    const finalTarget =
      (await DailyTargetService.peekTodayTargetMl(userId)) ?? (profile ? storedTargetForToday(profile) : null);
    if (finalTarget !== null) {
      targetChanged = await NotificationService.cacheDailyWaterTarget(finalTarget);
    } else if (profile) {
      // Otherwise the profile's baseline, as a fallback only: it guarantees
      // the message is queued and never replaces a target already cached.
      targetChanged = await NotificationService.cacheDailyWaterTarget(profile.targetDailyMl, {
        onlyIfEmpty: true,
      });
    }
  } catch (error) {
    console.error('[Notifications] Failed to apply the daily water target:', error);
  }

  try {
    await NotificationService.reconcileSchedule(profile ? normaliseSleepSchedule(profile) : null, {
      fullRebuild: options.fullRebuild || nameChanged || targetChanged,
    });
  } catch (error) {
    console.error('[Notifications] Failed to reconcile the schedule:', error);
  }
  return result;
};

export default { reconcileNotificationsWithProfile };
