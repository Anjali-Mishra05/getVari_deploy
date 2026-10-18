/**
 * The admin's "Send Alert" on one user's profile.
 *
 * It goes to that user only, whatever their status, and it calls nobody
 * Critical who is not.
 */

let mockSession: any = null;
const mockInserted: any[] = [];
let mockInsertError: any = null;

jest.mock('../src/services/SupabaseClient', () => ({
  __esModule: true,
  supabase: {
    auth: { getSession: async () => ({ data: { session: mockSession }, error: null }) },
    from: (table: string) => ({
      insert: async (row: any) => {
        mockInserted.push({ table, row });
        return { error: mockInsertError };
      },
    }),
  },
}));

import { buildUserAlert, sendCriticalAlert } from '../src/admin-web/services/AdminAlertService';

const adminSession = { user: { app_metadata: { is_admin: true }, user_metadata: {} } };
const user = (status: string) => ({ id: `user-${status}`, status } as any);

beforeEach(() => {
  mockSession = adminSession;
  mockInserted.length = 0;
  mockInsertError = null;
});

describe('admin Send Alert to one user', () => {
  test.each(['Hydrated', 'Mild Risk', 'High Risk'])(
    'a %s user is sent a neutral message that never says "critical"',
    async status => {
      const alert = buildUserAlert(status as any);
      expect(alert.severity).toBe('info');
      expect(`${alert.title} ${alert.message}`).not.toMatch(/critical/i);

      await sendCriticalAlert(user(status));
      expect(mockInserted).toHaveLength(1);
      expect(mockInserted[0].row).toEqual(expect.objectContaining({ severity: 'info', title: alert.title }));
    }
  );

  test('a Critical user is sent the critical alert, unchanged', async () => {
    await sendCriticalAlert(user('Critical'));
    expect(mockInserted[0].row).toEqual(
      expect.objectContaining({
        severity: 'critical',
        title: 'Critical hydration alert',
        message: 'Your hydration status is critical. Please hydrate immediately and follow the in-app guidance.',
      })
    );
  });

  test('exactly one row is written, for the selected user only', async () => {
    await sendCriticalAlert(user('Hydrated'));
    expect(mockInserted).toHaveLength(1);
    expect(mockInserted[0].table).toBe('getvari_admin_alerts');
    expect(Array.isArray(mockInserted[0].row)).toBe(false);
    expect(mockInserted[0].row.user_id).toBe('user-Hydrated');
    expect(mockInserted[0].row.status).toBe('sent');
  });

  test('without a session, or without the trusted admin flag, nothing is written', async () => {
    mockSession = null;
    await expect(sendCriticalAlert(user('Hydrated'))).rejects.toThrow(/Authentication required/);

    // `user_metadata` can be edited by the account itself, so it proves nothing.
    mockSession = { user: { app_metadata: {}, user_metadata: { is_admin: true } } };
    await expect(sendCriticalAlert(user('Hydrated'))).rejects.toThrow(/Permission denied/);

    expect(mockInserted).toHaveLength(0);
  });

  test('a database refusal is reported as a failure, not as sent', async () => {
    mockInsertError = { code: '23514', message: 'violates check constraint' };
    await expect(sendCriticalAlert(user('Hydrated'))).rejects.toThrow(/insert failed \(23514\)/);
  });
});
