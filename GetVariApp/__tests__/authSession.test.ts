/**
 * The session has to survive a cold start, because tapping a hydration
 * reminder *is* a cold start. Every assertion here stands in for "the user
 * tapped the notification and was asked to sign up again".
 */

// `var` + a `mock` prefix: jest hoists the factories above these declarations,
// and only names starting with "mock" may be referenced from inside one.
var mockStore = new Map<string, string>();
var mockSupabaseSession: { user: { id: string } } | null = null;
var mockProfileRow: { id: string } | null = null;

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

jest.mock('../src/services/SupabaseClient', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSupabaseSession } }),
      signInWithOtp: async () => ({ error: { message: 'SMS provider not configured' } }),
      verifyOtp: async () => ({ data: { session: null }, error: { message: 'unsupported' } }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mockProfileRow, error: null }),
        }),
      }),
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
