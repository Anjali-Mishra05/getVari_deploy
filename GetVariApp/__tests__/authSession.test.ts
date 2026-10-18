/**
 * The session has to survive a cold start, because tapping a hydration
 * reminder *is* a cold start. Every assertion here stands in for "the user
 * tapped the notification and was asked to sign up again".
 */

// `var` + a `mock` prefix: jest hoists the factories above these declarations,
// and only names starting with "mock" may be referenced from inside one.
var mockStore = new Map<string, string>();
var mockSupabaseSession: { user: { id: string } } | null = null;
var mockProfileRow: { id: string; updated_at?: string; profile?: any } | null = null;
/** When set, the profile lookup fails the way an unreachable backend does. */
var mockLookupError = false;
/** Every write to the profiles table: [operation, payload]. */
var mockProfileWrites: Array<[string, any]> = [];

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
            maybeSingle: async () =>
              mockLookupError
                ? { data: null, error: { message: 'network request failed' } }
                : { data: mockProfileRow, error: null },
            order: () => query,
            limit: () => query,
            then: (resolve: any, reject: any) =>
              Promise.resolve({ data: rows, error: null }).then(resolve, reject),
          };
          return query;
        },
      }),
      update: (payload: any) => {
        mockProfileWrites.push(['update', payload]);
        return { eq: async () => ({ error: null }) };
      },
      insert: async (payload: any) => {
        mockProfileWrites.push(['insert', payload]);
        return { error: null };
      },
      upsert: async (payload: any) => {
        mockProfileWrites.push(['upsert', payload]);
        return { error: null };
      },
      delete: () => {
        mockProfileWrites.push(['delete', null]);
        return { eq: async () => ({ error: null }) };
      },
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
  mockLookupError = false;
  mockProfileWrites = [];
});

/** A profile row holding the details onboarding saves. */
const savedProfile = (id: string) => ({
  id,
  updated_at: '2026-09-05T10:00:00.000Z',
  profile: { fullName: 'Anjali Mishra', age: 30, weightKg: 62, sleepSchedule: { sleepStart: '23:30', wakeUp: '07:00' } },
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

  it('recovers Home from an existing saved profile when the local flag is gone', async () => {
    const first = coldStart();
    const { userId } = await first.verifyOtp(await first.sendOtp('+919876543210'), '884200');
    // A row with the details onboarding saves. A bare row no longer counts:
    // the Firebase path creates an empty one for every new account.
    mockProfileRow = savedProfile(userId);

    const afterRestart = coldStart();
    expect(await afterRestart.resolveStartupRoute()).toBe('Home');
  });

  it('only sends a device that never signed in to Login', async () => {
    expect(await coldStart().resolveStartupRoute()).toBe('Login');
  });
});

describe('new user vs existing user vs new session', () => {
  const PHONE = '+919876543210';
  const signIn = async (auth: any) => auth.verifyOtp(await auth.sendOtp(PHONE), '884200');

  it('a genuinely new user: login -> profile details -> dashboard', async () => {
    const auth = coldStart();
    const { userId } = await signIn(auth);
    expect(await auth.routeAfterLogin()).toBe('Onboarding');

    // Onboarding saves the details and stamps the account.
    mockProfileRow = savedProfile(userId);
    await auth.markOnboardingComplete();
    expect(await auth.resolveStartupRoute()).toBe('Home');
  });

  it('an existing user: app launch restores the session and goes straight to the dashboard', async () => {
    const first = coldStart();
    const { userId } = await signIn(first);
    mockProfileRow = savedProfile(userId);
    await first.markOnboardingComplete();

    const relaunched = coldStart();
    expect(await relaunched.getCurrentUserId()).toBe(userId);
    expect(await relaunched.resolveStartupRoute()).toBe('Home');
    expect(await relaunched.hasCompletedOnboarding()).toBe(true);
  });

  it('an existing user: logout -> login again goes straight to the dashboard, not onboarding', async () => {
    const first = coldStart();
    const { userId } = await signIn(first);
    mockProfileRow = savedProfile(userId);
    await first.markOnboardingComplete();

    await first.logout();
    expect(await coldStart().resolveStartupRoute()).toBe('Login');

    const again = coldStart();
    const session = await signIn(again);
    expect(session.userId).toBe(userId);
    // The new session carries no stamp of its own; the account is still known.
    expect(session.onboardedAt).toBeUndefined();
    expect(await again.routeAfterLogin()).toBe('Home');
    expect(await again.hasCompletedOnboarding()).toBe(true);
  });

  it('logout -> login is recognised even when the backend cannot be reached', async () => {
    const first = coldStart();
    const { userId } = await signIn(first);
    mockProfileRow = savedProfile(userId);
    await first.markOnboardingComplete();
    await first.logout();

    mockLookupError = true;
    const again = coldStart();
    await signIn(again);
    expect(await again.routeAfterLogin()).toBe('Home');
  });

  it('logout keeps the saved profile: nothing is written or deleted, and the same account id comes back', async () => {
    const first = coldStart();
    const { userId } = await signIn(first);
    mockProfileRow = savedProfile(userId);
    await first.markOnboardingComplete();

    mockProfileWrites = [];
    await first.logout();
    expect(mockProfileWrites).toEqual([]);

    const again = coldStart();
    expect((await signIn(again)).userId).toBe(userId);
    // The profile row the dashboard reads is the same one, details intact.
    expect(mockProfileRow?.profile.fullName).toBe('Anjali Mishra');
  });

  it('a reinstall (no local records) with a saved profile on the server still goes to the dashboard', async () => {
    const first = coldStart();
    const { userId } = await signIn(first);
    mockProfileRow = savedProfile(userId);

    mockStore.clear(); // reinstall: session, id map and onboarding record gone
    const reinstalled = coldStart();
    expect((await signIn(reinstalled)).userId).toBe(userId);
    expect(await reinstalled.routeAfterLogin()).toBe('Home');
  });

  it('a genuinely new account whose row is empty (Firebase creates one at sign-in) still gets onboarding', async () => {
    const auth = coldStart();
    const { userId } = await signIn(auth);
    mockProfileRow = { id: userId, profile: {} };
    expect(await auth.routeAfterLogin()).toBe('Onboarding');
    expect(await coldStart().resolveStartupRoute()).toBe('Onboarding');
  });

  it('a new user whose lookup fails is not waved through to the dashboard', async () => {
    const auth = coldStart();
    await signIn(auth);
    mockLookupError = true;
    expect(await auth.routeAfterLogin()).toBe('Onboarding');
  });

  it('one account finishing onboarding does not mark a different account on the same phone', async () => {
    const first = coldStart();
    const { userId } = await signIn(first);
    mockProfileRow = savedProfile(userId);
    await first.markOnboardingComplete();
    await first.logout();

    mockProfileRow = null;
    const other = coldStart();
    await other.verifyOtp(await other.sendOtp('+919111111111'), '884200');
    expect(await other.routeAfterLogin()).toBe('Onboarding');
  });

  it('authentication failure: a wrong code is rejected and the app stays on Login', async () => {
    const auth = coldStart();
    await expect(auth.verifyOtp(await auth.sendOtp(PHONE), '000000')).rejects.toThrow();
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

/**
 * The dark/light choice belongs to the device, not to a session. Signing out
 * and back in — the real `AuthService` calls, against the same storage — must
 * leave it exactly as the user set it, and a fresh install must start dark.
 */
describe('the theme is independent of sign-in and sign-out', () => {
  const PHONE = '+919876543210';
  const THEME_KEY = 'getvari_theme_mode';
  const signIn = async (auth: any) => auth.verifyOtp(await auth.sendOtp(PHONE), '884200');
  /** A restart: every module's memory is gone, storage is not. */
  const relaunch = async () => {
    const auth = coldStart();
    const theme = require('../src/theme/theme');
    await theme.loadThemeMode();
    return { auth, theme };
  };

  it('1. fresh install: nothing saved, so the app opens in Dark Mode', async () => {
    expect(mockStore.has(THEME_KEY)).toBe(false);
    const { theme } = await relaunch();
    expect(theme.getThemeMode()).toBe('dark');
    // Opening the app does not save a preference on the user's behalf.
    expect(mockStore.has(THEME_KEY)).toBe(false);
  });

  it('2. Light Mode -> logout: the Login screen is still in Light Mode', async () => {
    const { auth, theme } = await relaunch();
    const { userId } = await signIn(auth);
    mockProfileRow = savedProfile(userId);
    await auth.markOnboardingComplete();

    theme.setThemeMode('light');
    await Promise.resolve();
    await auth.logout();

    expect(mockStore.get(THEME_KEY)).toBe('light');
    expect(theme.getThemeMode()).toBe('light'); // same run: straight to Login
    const afterRestart = await relaunch();
    expect(await afterRestart.auth.resolveStartupRoute()).toBe('Login');
    expect(afterRestart.theme.getThemeMode()).toBe('light');
  });

  it('3. ...and through OTP, profile details and onto the Dashboard it stays Light', async () => {
    const first = await relaunch();
    first.theme.setThemeMode('light');
    await Promise.resolve();

    // A new user: Login -> OTP -> profile details -> Dashboard.
    const { userId } = await signIn(first.auth);
    expect(first.theme.getThemeMode()).toBe('light');
    expect(await first.auth.routeAfterLogin()).toBe('Onboarding');
    mockProfileRow = savedProfile(userId);
    await first.auth.markOnboardingComplete();
    expect(await first.auth.resolveStartupRoute()).toBe('Home');
    expect(first.theme.getThemeMode()).toBe('light');

    // Logout, then the same account signs in again and lands on the Dashboard.
    await first.auth.logout();
    const again = await relaunch();
    expect(again.theme.getThemeMode()).toBe('light');
    await signIn(again.auth);
    expect(await again.auth.routeAfterLogin()).toBe('Home');
    expect(again.theme.getThemeMode()).toBe('light');
    expect(mockStore.get(THEME_KEY)).toBe('light');
  });

  it('4. Dark Mode -> logout -> login: the whole flow stays Dark', async () => {
    const first = await relaunch();
    const { userId } = await signIn(first.auth);
    mockProfileRow = savedProfile(userId);
    await first.auth.markOnboardingComplete();
    first.theme.setThemeMode('light');
    first.theme.setThemeMode('dark'); // the user switches back
    await Promise.resolve();
    await Promise.resolve();

    await first.auth.logout();
    expect(mockStore.get(THEME_KEY)).toBe('dark');
    const again = await relaunch();
    expect(again.theme.getThemeMode()).toBe('dark');
    await signIn(again.auth);
    expect(await again.auth.routeAfterLogin()).toBe('Home');
    expect(again.theme.getThemeMode()).toBe('dark');
  });

  it('a different account signing in on the same phone does not change it either', async () => {
    const first = await relaunch();
    await signIn(first.auth);
    first.theme.setThemeMode('light');
    await Promise.resolve();
    await first.auth.logout();

    const other = await relaunch();
    await other.auth.verifyOtp(await other.auth.sendOtp('+919812345678'), '884200');
    expect(other.theme.getThemeMode()).toBe('light');
  });

  it('nothing in the sign-in or sign-out code touches the theme preference', () => {
    const fs = require('fs');
    const path = require('path');
    for (const file of ['services/AuthService.ts', 'components/ProfileSheet.tsx', 'screens/LoginScreen.tsx', 'screens/OtpScreen.tsx']) {
      const source = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
      expect(source).not.toMatch(/setThemeMode|toggleThemeMode|getvari_theme_mode|AsyncStorage\.clear/);
    }
  });
});
