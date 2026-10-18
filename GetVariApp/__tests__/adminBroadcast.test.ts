/**
 * Messages the admin panel sends to every user, as the app collects them.
 *
 * The app reads its own rows from `getvari_admin_alerts` and shows each one
 * once: never twice, never another user's, and never lost when it could not be
 * shown (sleep window, notifications off).
 */

const mockStore = new Map<string, string>();
let mockRows: any[] = [];
let mockError: { message: string } | null = null;
const mockFilters: Record<string, unknown> = {};
const mockDisplay = jest.fn(async (..._args: any[]) => true);

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
  },
}));

jest.mock('../src/services/NotificationService', () => ({
  __esModule: true,
  default: { displayNotification: (...args: any[]) => mockDisplay(...args) },
}));

jest.mock('../src/services/SupabaseClient', () => ({
  __esModule: true,
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      mockFilters.fn = name;
      Object.assign(mockFilters, args);
      return { data: mockError ? null : mockRows, error: mockError };
    },
  },
}));

import { checkAdminBroadcasts } from '../src/services/AdminBroadcastService';

const row = (id: string) => ({ id, title: `Title ${id}`, message: `Body ${id}`, sent_at: new Date().toISOString() });

beforeEach(() => {
  mockStore.clear();
  mockRows = [];
  mockError = null;
  mockDisplay.mockReset();
  mockDisplay.mockResolvedValue(true);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('admin send-to-all messages on the device', () => {
  test('a new message is shown once, with the admin text, and not again on the next check', async () => {
    mockRows = [row('a')];
    expect(await checkAdminBroadcasts('user-1')).toBe(1);
    expect(mockDisplay).toHaveBeenCalledTimes(1);
    expect(mockDisplay.mock.calls[0][0]).toBe('Title a');
    expect(mockDisplay.mock.calls[0][1]).toBe('Body a');

    expect(await checkAdminBroadcasts('user-1')).toBe(0);
    expect(mockDisplay).toHaveBeenCalledTimes(1);
  });

  test('only this user’s recent messages are asked for, through the per-user function', async () => {
    await checkAdminBroadcasts('user-1');
    expect(mockFilters.fn).toBe('getvari_my_admin_messages');
    expect(mockFilters.p_user_id).toBe('user-1');
    const since = new Date(String(mockFilters.p_since)).getTime();
    expect(Date.now() - since).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
  });

  test('it is shown immediately, and leaves the spacing of automatic notifications alone', async () => {
    mockRows = [row('a')];
    await checkAdminBroadcasts('user-1');
    expect(mockDisplay.mock.calls[0][4]).toEqual(
      expect.objectContaining({ immediate: true, untracked: true, notificationKey: 'admin_broadcast' })
    );
  });

  test('a message that could not be shown is kept for the next check', async () => {
    mockRows = [row('a'), row('b')];
    mockDisplay.mockResolvedValue(false); // sleep window, or notifications off
    expect(await checkAdminBroadcasts('user-1')).toBe(0);
    expect(mockDisplay).toHaveBeenCalledTimes(1); // stops at the first one held back

    mockDisplay.mockResolvedValue(true);
    expect(await checkAdminBroadcasts('user-1')).toBe(2);
    expect(mockDisplay.mock.calls.slice(1).map(call => call[0])).toEqual(['Title a', 'Title b']);
  });

  test('two checks at once show a message once', async () => {
    mockRows = [row('a')];
    const results = await Promise.all([checkAdminBroadcasts('user-1'), checkAdminBroadcasts('user-1')]);
    expect(results.reduce((sum, n) => sum + n, 0)).toBe(1);
    expect(mockDisplay).toHaveBeenCalledTimes(1);
  });

  test('nothing is shown without a user, or when the read fails', async () => {
    mockRows = [row('a')];
    expect(await checkAdminBroadcasts(null)).toBe(0);
    mockError = { message: 'permission denied' };
    expect(await checkAdminBroadcasts('user-1')).toBe(0);
    expect(mockDisplay).not.toHaveBeenCalled();
  });
});
