/**
 * The session has to survive a cold start, because tapping a hydration
 * reminder *is* a cold start. Every assertion here stands in for "the user
 * tapped the notification and was asked to sign up again".
 */

// `var` + a `mock` prefix: jest hoists the factories above these declarations,
// and only names starting with "mock" may be referenced from inside one.
var mockStore = new Map<string, string>();
var mockSupabaseSession: { user: { id: string } } | null = null;
var mockProfileRow: { id: string; updated_at?: string } | null = null;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => void mockStore.set(key, value),
    removeItem: async (key: string) => void mockStore.delete(key),
  },
}));

jest.mock('react-native-keychain', () => ({
  getGenericPassword: async () => false,
  setGenericPassword: async () => true,
  resetGenericPassword: async () => true,
}));

// `@react-native-firebase/*` ships untranspiled ESM, which a plain node
// environment cannot require. Stubbing it here keeps this suite in the same
// shape as the rest of the logic tests — every native module mocked, no
// `transformIgnorePatterns` needed — and none of these assertions exercise
// the phone-auth path anyway; they are about the *session* that survives it.
// Phone auth is deliberately *unavailable* here: that is the investor build's
// real state, and it is the state these assertions are about — the demo
// passcode path and the identity it mints.
jest.mock('@react-native-firebase/app', () => ({
  firebase: { app: () => ({}) },
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => ({ currentUser: null }),
  signInWithPhoneNumber: async () => {
    throw new Error('auth/billing-not-enabled');
  },
  signOut: async () => undefined,
}));

jest.mock('../src/services/SupabaseClient', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSupabaseSession } }),
      signInWithOtp: async () => ({ error: { message: 'SMS provider not configured' } }),
      verifyOtp: async () => ({ data: { session: null }, error: { message: 'unsupported' } }),
      signOut: async () => ({ error: null }),
    },
    // `select().eq()` is both awaitable (the phone lookup orders and limits,
    // then reads an array) and chainable to `.maybeSingle()` (the uid lookup
    // reads one row). The thenable covers the first without breaking the
    // second.
    from: () => ({
      select: () => ({
        eq: () => {
          const rows = mockProfileRow ? [mockProfileRow] : [];
          const query: any = {
            maybeSingle: async () => ({ data: mockProfileRow, error: null }),
            order: () => query,
            limit: () => query,
            then: (resolve: any, reject: any) =>
              Promise.resolve({ data: rows, error: null }).then(resolve, reject),
          };
          return query;
        },
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
      insert: async () => ({ error: null }),
    }),
  },
}));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Re-imports the module so its in-memory cache starts empty, like a restart. */
const coldStart = () => {
  jest.resetModules();
  return require('../src/services/AuthService').AuthService;
};

beforeEach(() => {
  mockStore.clear();
  mockSupabaseSession = null;
  mockProfileRow = null;
});

describe('demo sign-in', () => {
  it('accepts the printed passcode for any phone number', async () => {
    const AuthService = coldStart();

    // The login screen promises "enter any Indian mobile number"; Supabase SMS
    // is not configured, so the challenge must fall back instead of throwing.
    const challenge = await AuthService.sendOtp('+919876543210');
    expect(challenge.isDemo).toBe(true);

    const session = await AuthService.verifyOtp(challenge, '884200');
    expect(session.userId).toMatch(UUID_RE);
  });

  it('rejects a wrong passcode', async () => {
    const AuthService = coldStart();
    const challenge = await AuthService.sendOtp('+919876543210');
    await expect(AuthService.verifyOtp(challenge, '000000')).rejects.toThrow(/884200/);
  });

  it('gives the user id Supabase can actually store', async () => {
    const AuthService = coldStart();
    const challenge = await AuthService.sendOtp('+919000000001');
    const { userId } = await AuthService.verifyOtp(challenge, '884200');

    // A `demo_<timestamp>` id is not a uuid and not stable — both of which
    // silently dropped every hydration write.
    expect(userId).toMatch(UUID_RE);
  });
});

describe('persistence across a restart', () => {
  it('keeps the same user id, so yesterday’s entries are still yours', async () => {
    const first = coldStart();
    const challenge = await first.sendOtp('+919876543210');
    const { userId } = await first.verifyOtp(challenge, '884200');

    const afterRestart = coldStart();
    expect(await afterRestart.getCurrentUserId()).toBe(userId);
  });

  it('re-signing in on the same number reuses the same id', async () => {
    const first = coldStart();
    const { userId } = await first.verifyOtp(await first.sendOtp('+919876543210'), '884200');

    const again = coldStart();
    const second = await again.verifyOtp(await again.sendOtp('+919876543210'), '884200');
    expect(second.userId).toBe(userId);
  });

  /**
   * The reported defect: "when user logs out and tries to re-login with the
   * same number, his previous data is not getting saved."
   *
   * Logging out clears the session but leaves the local phone→id map, so on
   * the same device this always worked. What did not work was any case where
   * that map is gone — a reinstall, cleared app data, or a different handset.
   * The id was then minted locally with no reference to the server, and every
   * row the user already owned was stranded under the old one.
   */
  it('recovers the server profile when the device has forgotten the number', async () => {
    const first = coldStart();
    const { userId } = await first.verifyOtp(await first.sendOtp('+919876543210'), '884200');

    // A new install: no session, no local identity map. The row on the server
    // is all that is left of this user.
    mockStore.clear();
    mockProfileRow = { id: userId, updated_at: '2026-09-05T10:00:00.000Z' };

    const reinstalled = coldStart();
    const session = await reinstalled.verifyOtp(
      await reinstalled.sendOtp('+919876543210'),
      '884200'
    );

    expect(session.userId).toBe(userId);
  });

  it('mints a fresh id when the number is genuinely new to the server', async () => {
    mockProfileRow = null;

    const AuthService = coldStart();
    const session = await AuthService.verifyOtp(await AuthService.sendOtp('+919000000009'), '884200');

    expect(session.userId).toMatch(UUID_RE);
  });

  it('prefers the server id over a stale local one', async () => {
    const first = coldStart();
    const { userId: local } = await first.verifyOtp(await first.sendOtp('+919876543210'), '884200');

    // The same device signs in again, but the server now knows this number by
    // a different row — the one carrying the history worth keeping.
    mockProfileRow = { id: '11111111-2222-4333-8444-555555555555', updated_at: '2026-09-05T12:00:00.000Z' };

    const again = coldStart();
    const session = await again.verifyOtp(await again.sendOtp('+919876543210'), '884200');

    expect(session.userId).toBe('11111111-2222-4333-8444-555555555555');
    expect(session.userId).not.toBe(local);
  });

  it('routes a returning, onboarded user straight to Home', async () => {
    const first = coldStart();
    await first.verifyOtp(await first.sendOtp('+919876543210'), '884200');
    await first.markOnboardingComplete();

    const afterRestart = coldStart();
    expect(await afterRestart.resolveStartupRoute()).toBe('Home');
  });

  it('routes a signed-in user who never onboarded to Onboarding, not Login', async () => {
    const first = coldStart();
    await first.verifyOtp(await first.sendOtp('+919876543210'), '884200');

    const afterRestart = coldStart();
    expect(await afterRestart.resolveStartupRoute()).toBe('Onboarding');
  });

  it('recovers Home from an existing profile row when the local flag is gone', async () => {
    const first = coldStart();
    const { userId } = await first.verifyOtp(await first.sendOtp('+919876543210'), '884200');
    mockProfileRow = { id: userId };

    const afterRestart = coldStart();
    expect(await afterRestart.resolveStartupRoute()).toBe('Home');
  });

  it('only sends a device that never signed in to Login', async () => {
    expect(await coldStart().resolveStartupRoute()).toBe('Login');
  });
});

describe('user id resolution', () => {
  it('prefers a live Supabase session over the stored demo id', async () => {
    const AuthService = coldStart();
    await AuthService.verifyOtp(await AuthService.sendOtp('+919876543210'), '884200');

    mockSupabaseSession = { user: { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } };
    expect(await AuthService.getCurrentUserId()).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  });

  it('falls back to the stored session when Supabase is unreachable', async () => {
    const AuthService = coldStart();
    const { userId } = await AuthService.verifyOtp(
      await AuthService.sendOtp('+919876543210'),
      '884200'
    );

    // A network failure here used to surface as "you're not signed in" in the
    // chat, because the old code asked the auth server on every write.
    expect(await AuthService.getCurrentUserId()).toBe(userId);
  });
});
