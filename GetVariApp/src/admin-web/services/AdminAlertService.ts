import { supabase } from '../../services/SupabaseClient';
import { User } from '../types';

/**
 * What the alert sent from a user's profile says.
 *
 * Only a user whose status really is Critical is told so. Everyone else gets a
 * neutral check-in that makes no claim about their condition.
 */
export const buildUserAlert = (
  status: User['status']
): { severity: 'critical' | 'info'; title: string; message: string } =>
  status === 'Critical'
    ? {
        severity: 'critical',
        title: 'Critical hydration alert',
        message: 'Your hydration status is critical. Please hydrate immediately and follow the in-app guidance.',
      }
    : {
        severity: 'info',
        title: 'Message from GetVari',
        message: 'A quick check-in from the GetVari team. Open the app to see your hydration progress for today.',
      };

/**
 * Send an alert to one user — the one whose profile is open — whatever their
 * status. Named for what it was first written for; the wording now follows the
 * user's status.
 */
export const sendCriticalAlert = async (user: User) => {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    throw new Error('Authentication required: You must be signed in as an administrator to send alerts.');
  }

  // A courtesy check for a clear message; the database enforces it (RLS on
  // getvari_admin_alerts, via the trusted `app_metadata` flag).
  const isAdmin = sessionData.session.user.app_metadata?.is_admin === true;
  if (!isAdmin) {
    throw new Error('Permission denied: Your account does not have administrator privileges.');
  }

  const sentAt = new Date().toISOString();
  const { error } = await supabase.from('getvari_admin_alerts').insert({
    user_id: user.id,
    ...buildUserAlert(user.status),
    status: 'sent',
    sent_at: sentAt,
  });

  if (error) {
    throw new Error(
      `Supabase getvari_admin_alerts insert failed (${error.code ?? 'unknown'}): ${error.message}${error.details ? ` — ${error.details}` : ''}`
    );
  }
  return sentAt;
};

/**
 * Send one notification to every registered user, whatever their current
 * hydration status.
 *
 * The work is done by the `getvari_admin_notify_all` database function: it
 * checks the caller is an admin on the server, then stores the message for
 * every profile in one statement — everyone or no one, with no paging limit.
 * Each phone collects its own copy (see `AdminBroadcastService` in the app).
 * Resolves with how many users it was stored for; throws with the reason when
 * nothing was sent.
 */
export const sendNotificationToAllUsers = async (input: { title: string; message: string }) => {
  const title = input.title.trim();
  const message = input.message.trim();
  if (!title || !message) {
    throw new Error('A title and a message are both required.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    throw new Error('Authentication required: You must be signed in as an administrator to send notifications.');
  }

  const { data, error } = await supabase.rpc('getvari_admin_notify_all', {
    p_title: title,
    p_message: message,
  });

  if (error) {
    throw new Error(`${error.message}${error.code ? ` (${error.code})` : ''}`);
  }

  const count = Number(data);
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error('The server did not confirm any recipients.');
  }
  return { count, sentAt: new Date().toISOString() };
};
