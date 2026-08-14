import { supabase } from '../../services/SupabaseClient';
import { User } from '../types';

export const sendCriticalAlert = async (user: User) => {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    throw new Error('Authentication required: You must be signed in as an administrator to send alerts.');
  }

  // Check if the user is an admin based on JWT metadata
  const isAdmin = sessionData.session.user.user_metadata?.is_admin === true;
  if (!isAdmin) {
    throw new Error('Permission denied: Your account does not have administrator privileges.');
  }

  const sentAt = new Date().toISOString();
  const { error } = await supabase.from('getvari_admin_alerts').insert({
    user_id: user.id,
    severity: 'critical',
    title: 'Critical hydration alert',
    message: 'Your hydration status is critical. Please hydrate immediately and follow the in-app guidance.',
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
