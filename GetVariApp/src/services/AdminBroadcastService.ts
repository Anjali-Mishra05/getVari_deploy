/**
 * Messages the admin panel sends to every user.
 *
 * Two kinds reach a user: "Notify All Users" (one copy per user) and the
 * "Send Alert" on a single user's profile. Both are rows in
 * `getvari_admin_alerts`. There is no push server behind this app, so the
 * phone collects its own: this is called when the dashboard opens, when the
 * app returns to the foreground, and on a short interval while it is open. A
 * message sent while the app is closed is shown the next time it is opened.
 *
 * The table itself is closed to the app. The read goes through the
 * `getvari_my_admin_messages` database function, which returns one user's
 * recent rows and nothing else.
 *
 * Automatic alerts (risk, focus, reminders) do not come through here; they are
 * raised on the device by `NotificationEngine` as before.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import NotificationService from './NotificationService';
import { supabase } from './SupabaseClient';

const MESSAGES_FUNCTION = 'getvari_my_admin_messages';

/** Ids of the messages this device has already shown. */
const SEEN_KEY = 'getvari_admin_broadcast_seen';
const SEEN_LIMIT = 100;

/** A message older than this is not shown: it is no longer news. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** At most this many are shown from one check, oldest first. */
const BATCH_LIMIT = 5;

/** How often the dashboard checks while the app is open. */
export const ADMIN_BROADCAST_POLL_MS = 20 * 1000;

export const ADMIN_BROADCAST_KEY = 'admin_broadcast';

/** One check at a time, so two triggers cannot show the same message twice. */
let inFlight = false;

const readSeen = async (): Promise<string[]> => {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

/**
 * Show any admin message this user has not been shown yet. Returns how many
 * were shown.
 *
 * A message is marked as seen only once it has actually been posted. One held
 * back — by the sleep window, or because notifications are switched off — is
 * left for the next check rather than lost.
 */
export const checkAdminBroadcasts = async (userId: string | null | undefined): Promise<number> => {
  if (!userId || inFlight) return 0;
  inFlight = true;
  try {
    const { data, error } = await supabase.rpc(MESSAGES_FUNCTION, {
      p_user_id: userId,
      p_since: new Date(Date.now() - MAX_AGE_MS).toISOString(),
    });

    if (error) {
      console.warn('[AdminBroadcast] Could not read messages:', error.message);
      return 0;
    }

    const seen = await readSeen();
    const rows: any[] = Array.isArray(data) ? data : [];
    const pending = rows.filter(row => row?.id && !seen.includes(String(row.id))).slice(0, BATCH_LIMIT);
    let shown = 0;

    for (const row of pending) {
      const id = String(row.id);
      // `immediate`: sent by a person, now, so it is not held by the quiet
      // period after opening the app or the gap between automatic alerts. The
      // sleep window still applies. `untracked`: it leaves no mark on the
      // spacing state either, so the automatic notifications are timed exactly
      // as if it had not been sent.
      const delivered = await NotificationService.displayNotification(
        String(row.title ?? 'GetVari'),
        String(row.message ?? ''),
        undefined,
        'local',
        {
          immediate: true,
          untracked: true,
          notificationKey: ADMIN_BROADCAST_KEY,
          source: 'event',
          reason: `admin message ${id}`,
        }
      );
      if (!delivered) break;

      seen.push(id);
      await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-SEEN_LIMIT)));
      shown += 1;
    }

    return shown;
  } catch (error) {
    console.warn('[AdminBroadcast] Check failed:', error);
    return 0;
  } finally {
    inFlight = false;
  }
};

export default { checkAdminBroadcasts, ADMIN_BROADCAST_POLL_MS };
