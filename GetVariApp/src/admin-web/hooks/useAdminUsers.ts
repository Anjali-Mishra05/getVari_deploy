import { useCallback, useEffect, useRef, useState } from 'react';
import { User } from '../types';
import { SupabaseAdminService } from '../services/SupabaseAdminService';

/**
 * How often the panel re-reads while it is on screen.
 *
 * The app writes straight to Supabase and the panel has no push channel, so
 * a reload is the only way an entry logged on a phone reaches an open page.
 * Thirty seconds keeps that close to "as it happens" without hammering the
 * database from a tab left open all day; a hidden tab does not poll at all.
 */
export const ADMIN_REFRESH_MS = 30 * 1000;

export interface AdminUsersState {
  users: User[];
  /** True only until the first answer, success or failure. */
  loading: boolean;
  /** The last read's failure, or null. Earlier data stays on screen. */
  error: string | null;
  /** When the users on screen were read, epoch ms. */
  loadedAt: number | null;
  refresh: () => Promise<void>;
}

export const useAdminUsers = (): AdminUsersState => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    inFlight.current = (async () => {
      try {
        const next = await SupabaseAdminService.fetchAllUsers();
        if (!mounted.current) return;
        setUsers(next);
        setError(null);
        setLoadedAt(Date.now());
      } catch (err: any) {
        console.error('[useAdminUsers] Load failed:', err);
        if (mounted.current) setError(err?.message ?? String(err));
      } finally {
        if (mounted.current) setLoading(false);
        inFlight.current = null;
      }
    })();
    return inFlight.current;
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();

    const timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void refresh();
    }, ADMIN_REFRESH_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);

    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return { users, loading, error, loadedAt, refresh };
};

export default useAdminUsers;
