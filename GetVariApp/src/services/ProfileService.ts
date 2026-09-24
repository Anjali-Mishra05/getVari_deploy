import { supabase } from './SupabaseClient';
import { AuthService } from './AuthService';
import NotificationService from './NotificationService';
import DailyTargetService from './DailyTargetService';
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
 *    from weight, age, gender, work environment and diagnoses — the PBWR
 *    pipeline's inputs — so correcting any of them has to move the goal. A
 *    stale target would quietly outlive the answer it came from.
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
  /** Stage 3's self-declared band, and Stage 1 scales by age and gender. */
  workEnvironment?: string;
  /** Stage 5's ceiling for a fluid-restricted diagnosis. */
  physicianLimitMl?: number | null;
  sleepSchedule?: { sleepStart: string; wakeUp: string };
}

export type ProfileSaveResult =
  | { status: 'saved'; profile: UserProfile }
  | { status: 'unauthenticated' }
  | { status: 'error'; error: string };

/**
 * A read, with the reason it came back empty.
 *
 * `fetchProfile` cannot tell a caller why it has no profile, and the two
 * reasons are opposites: a user who has not onboarded has nothing to show, a
 * user whose phone was offline has everything to show and could not reach it.
 * The dashboard has to retry one of those and not the other, so it reads
 * through here; everything that only wants the blob still calls `fetchProfile`.
 */
export interface ProfileReadResult {
  profile: UserProfile | null;
  /** True when the backend could not be read — offline, timed out, rejected. */
  failed: boolean;
}

export const fetchProfileResult = async (
  userId?: string | null
): Promise<ProfileReadResult> => {
  const id = userId ?? (await AuthService.getCurrentUserId());
  if (!id) return { profile: null, failed: false };

  let data: { profile?: unknown } | null = null;
  try {
    const response = await supabase
      .from(PROFILES_TABLE)
      .select('profile')
      .eq('id', id)
      .maybeSingle();

    if (response.error) {
      console.error('[Profile] Failed to fetch:', response.error.message);
      return { profile: null, failed: true };
    }
    data = response.data;
  } catch (error) {
    // A timed-out or aborted request rejects rather than returning an error
    // row; both mean the same thing here.
    console.error('[Profile] Fetch threw:', error);
    return { profile: null, failed: true };
  }

  const stored = (data?.profile as UserProfile) ?? null;
  if (!stored) return { profile: null, failed: false };

  /**
   * The goal is recomputed on read, not trusted as stored.
   *
   * `withDerivedFields` runs on *write*, so `targetDailyMl` is frozen at
   * whatever the rules said the last time this row was saved — which can be
   * months and several releases ago. That is fine for a goal that only drifts;
   * it is not fine for a fluid restriction. A profile carrying a physician
   * limit of 1000 ml, written before the limit was honoured, kept serving the
   * formula's 3250 ml to every screen in the app: the exact over-drinking the
   * physician gate exists to prevent, preserved by the cache.
   *
   * Only this one field is re-derived. `accountCreatedAt` deliberately is not:
   * `withDerivedFields` stamps it with `now` when absent, and doing that on
   * every read would move the PBWR calibration window's start date each time
   * the profile loaded, so the calibration period would never end.
   */
  return { profile: { ...stored, targetDailyMl: targetFromProfile(stored) }, failed: false };
};

/** The stored profile blob, or null when the user has not onboarded yet. */
export const fetchProfile = async (userId?: string | null): Promise<UserProfile | null> =>
  (await fetchProfileResult(userId)).profile;

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

    /**
     * The phone number is written with every save, not just at sign-up.
     *
     * It is what lets a returning user be matched back to their history when
     * their device no longer remembers them — a reinstall, cleared app data,
     * or simply a different phone. Rows created by this upsert used to carry
     * only `id`, so a demo-mode user who lost their local identity map had a
     * profile on the server that nothing could ever find again.
     *
     * Omitted rather than written as null when the session has no number, so a
     * save can never blank a number an earlier one established.
     */
    const session = await AuthService.getStoredSession();
    const phoneNumber = session?.phoneNumber;

    const { error } = await supabase.from(PROFILES_TABLE).upsert({
      id: userId,
      profile: merged,
      ...(phoneNumber && phoneNumber !== 'unknown' ? { phone_number: phoneNumber } : {}),
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

    /**
     * The day's goal is locked, and an edit is the one thing that should move
     * it before tomorrow.
     *
     * Correcting a weight or adding a diagnosis changes the inputs the goal
     * was computed from, and a user who has just done that and sees the same
     * number reads it as the edit not having saved. Dropping the lock makes
     * the next read recompute; every other read today still gets one stable
     * answer.
     */
    try {
      await DailyTargetService.clearLockedTarget();
    } catch (targetError) {
      console.error('[Profile] Failed to unlock the daily target:', targetError);
    }

    return { status: 'saved', profile: merged as UserProfile };
  } catch (error: any) {
    console.error('[Profile] Fatal error while saving:', error);
    return { status: 'error', error: String(error?.message ?? error) };
  }
};

export const ProfileService = {
  fetchProfile,
  fetchProfileResult,
  updateProfile,
  withDerivedFields,
};

export default ProfileService;
