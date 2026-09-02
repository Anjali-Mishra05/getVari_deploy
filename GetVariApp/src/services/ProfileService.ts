import { supabase } from './SupabaseClient';
import { AuthService } from './AuthService';
import NotificationService from './NotificationService';
import { targetFromProfile } from '../utils/hydrationTarget';
import { awakeHoursPerDay, normaliseSleepSchedule } from '../utils/sleepWindow';
import type { UserProfile } from '../types';

/**
 * Reads and writes the onboarding profile blob.
 *
 * Onboarding used to be the only writer, so it inlined everything: the goal
 * calculation, the Supabase call, the hand-off of the sleep window to the
 * notification layer. Now that the user can edit their details at any time
 * there are two writers, and the invariants they share live here:
 *
 *  - **Merge, never replace.** An edit sends only the fields on screen; the
 *    paired device id, the coordinates and anything a future step adds have
 *    to survive a save that never mentioned them.
 *  - **Derived values are recomputed, not carried.** The daily goal follows
 *    from weight, activity, conditions and climate, so correcting a weight
 *    has to move the goal — a stale target would quietly outlive the answer
 *    it came from.
 *  - **The sleep window is pushed to the OS.** Reminders are scheduled
 *    outside React and cannot read this row.
 */

const PROFILES_TABLE = 'getvari_profiles';

/** Every field the profile editor can change. All optional — it sends a patch. */
export interface ProfilePatch {
  fullName?: string;
  email?: string;
  age?: number;
  gender?: string;
  weightKg?: number;
  selectedCity?: string;
  latitude?: number | null;
  longitude?: number | null;
  medicalConditions?: string[];
  activityLevel?: string;
  sleepSchedule?: { sleepStart: string; wakeUp: string };
}

export type ProfileSaveResult =
  | { status: 'saved'; profile: UserProfile }
  | { status: 'unauthenticated' }
  | { status: 'error'; error: string };

/** The stored profile blob, or null when the user has not onboarded yet. */
export const fetchProfile = async (userId?: string | null): Promise<UserProfile | null> => {
  const id = userId ?? (await AuthService.getCurrentUserId());
  if (!id) return null;

  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select('profile')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[Profile] Failed to fetch:', error.message);
    return null;
  }
  return (data?.profile as UserProfile) ?? null;
};

/**
 * Recompute everything that follows from the answers, so no caller has to
 * remember which stored fields are derived.
 */
export const withDerivedFields = (profile: any): any => {
  const schedule = normaliseSleepSchedule(profile);
  return {
    ...profile,
    // Stamped on the first save and preserved thereafter, so the PBWR
    // calibration window has a fixed start date to measure from.
    accountCreatedAt: profile.accountCreatedAt ?? new Date().toISOString(),
    // The dashboard reads `location`; onboarding has always written
    // `selectedCity`. Both are kept in step rather than migrating rows.
    location: profile.selectedCity ?? profile.location,
    targetDailyMl: targetFromProfile(profile),
    ...(schedule
      ? {
          sleepSchedule: schedule,
          awakeHoursPerDay: Number(awakeHoursPerDay(schedule).toFixed(2)),
        }
      : {}),
  };
};

/**
 * Apply an edit to the stored profile.
 *
 * The row is re-read first so a save cannot clobber fields written by another
 * device (or by a part of onboarding this screen never shows) with whatever
 * the editor happened to have in memory.
 */
export const updateProfile = async (patch: ProfilePatch): Promise<ProfileSaveResult> => {
  const userId = await AuthService.getCurrentUserId();
  if (!userId) {
    console.warn('[Profile] Cannot save: no authenticated user.');
    return { status: 'unauthenticated' };
  }

  try {
    const existing = (await fetchProfile(userId)) ?? {};
    const merged = withDerivedFields({ ...existing, ...patch });

    const { error } = await supabase.from(PROFILES_TABLE).upsert({
      id: userId,
      profile: merged,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[Profile] Save failed:', error.message);
      return { status: 'error', error: error.message };
    }

    // Reminders live in the OS and are scheduled from contexts that never see
    // this row, so a changed sleep window has to be handed over explicitly.
    try {
      await NotificationService.setSleepSchedule(normaliseSleepSchedule(merged));
    } catch (sleepError) {
      console.error('[Profile] Failed to apply sleep window:', sleepError);
    }

    return { status: 'saved', profile: merged as UserProfile };
  } catch (error: any) {
    console.error('[Profile] Fatal error while saving:', error);
    return { status: 'error', error: String(error?.message ?? error) };
  }
};

export const ProfileService = {
  fetchProfile,
  updateProfile,
  withDerivedFields,
};

export default ProfileService;
