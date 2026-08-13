import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

import { supabase } from './SupabaseClient';

/**
 * Owns "who is this device signed in as?", and keeps the answer across app
 * restarts.
 *
 * Three rules hold everything together:
 *
 *  1. **The session survives a cold start.** It lives in AsyncStorage, which is
 *     readable the moment JS boots — including the boot triggered by tapping a
 *     reminder notification. Nothing here asks the network, so a launch with no
 *     connectivity still resolves to a signed-in user instead of the login
 *     screen.
 *  2. **The user id is stable.** One device keeps one id forever (per phone
 *     number), so yesterday's hydration entries are still that user's entries
 *     today. The demo path used to mint `demo_<timestamp>` on every
 *     verification, which orphaned the previous day's rows.
 *  3. **The id is always a UUID.** Supabase columns and RLS compare against
 *     `auth.uid()`, so an id shaped like anything else is a write that silently
 *     fails.
 */

const SESSION_KEY = 'getvari_session';
const DEMO_IDS_KEY = 'getvari_demo_identities';
const LEGACY_KEYCHAIN_SERVICE = 'com.getvari.auth';

/** The passcode printed on the login and OTP screens. */
export const DEMO_PASSCODE = '884200';

export type StartupRoute = 'Home' | 'Onboarding' | 'Login';

export interface StoredSession {
  /** Row owner for every Supabase write. A real auth uid, or a demo UUID. */
  userId: string;
  phoneNumber: string;
  /** True when this session never reached Supabase auth (demo passcode path). */
  isDemo: boolean;
  /** Set once the onboarding wizard has been completed and saved. */
  onboardedAt?: string;
  createdAt: string;
}

export interface OtpChallenge {
  phoneNumber: string;
  /** True when Supabase SMS was unavailable and the demo passcode applies. */
  isDemo: boolean;
}

/** RFC 4122 v4, generated locally — no extra dependency for one id. */
const randomUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });

/** In-memory copy so the common path never touches storage twice. */
let restored: Promise<StoredSession | null> | null = null;

const writeSession = async (session: StoredSession): Promise<StoredSession> => {
  restored = Promise.resolve(session);
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
};

const isUsable = (value: any): value is StoredSession =>
  !!value && typeof value.userId === 'string' && value.userId.length > 0;

/**
 * One device + one phone number always maps to the same demo UUID, so signing
 * out and back in keeps the history that was logged before.
 */
const demoIdFor = async (phoneNumber: string): Promise<string> => {
  try {
    const raw = await AsyncStorage.getItem(DEMO_IDS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    if (typeof map?.[phoneNumber] === 'string') return map[phoneNumber];

    const id = randomUuid();
    await AsyncStorage.setItem(DEMO_IDS_KEY, JSON.stringify({ ...map, [phoneNumber]: id }));
    return id;
  } catch (error) {
    console.error('[Auth] Failed to persist demo identity:', error);
    return randomUuid();
  }
};

/**
 * Installs from before the AsyncStorage session existed kept a blob in the
 * keychain. Read it once so an upgrade does not log the user out.
 */
const migrateLegacyKeychainSession = async (): Promise<StoredSession | null> => {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: LEGACY_KEYCHAIN_SERVICE,
    });
    if (!credentials) return null;

    let legacy: any = {};
    try {
      legacy = JSON.parse(credentials.password);
    } catch {
      legacy = { isDemo: credentials.password === 'demo-token' };
    }

    const phoneNumber = typeof legacy.phoneNumber === 'string' ? legacy.phoneNumber : 'unknown';
    const session: StoredSession = {
      // The legacy demo token was never a UUID, so it cannot be reused as a row
      // owner. A fresh stable id is minted instead.
      userId: await demoIdFor(phoneNumber),
      phoneNumber,
      isDemo: true,
      createdAt: new Date().toISOString(),
    };

    await writeSession(session);
    await Keychain.resetGenericPassword({ service: LEGACY_KEYCHAIN_SERVICE });
    console.log('[Auth] Migrated legacy keychain session.');
    return session;
  } catch {
    return null;
  }
};

export class AuthService {
  /**
   * The persisted session, or null when this device has never signed in.
   * Reads storage at most once per app run.
   */
  static getStoredSession(): Promise<StoredSession | null> {
    if (!restored) {
      restored = (async () => {
        try {
          const raw = await AsyncStorage.getItem(SESSION_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          if (isUsable(parsed)) return parsed;
        } catch (error) {
          console.error('[Auth] Failed to restore session:', error);
        }
        return migrateLegacyKeychainSession();
      })();
    }
    return restored;
  }

  /**
   * The id every Supabase row is written under.
   *
   * A live Supabase session wins; `getSession()` reads the locally persisted
   * token rather than calling the network, so this stays fast and works
   * offline. (`getUser()`, which this used to call, round-trips to the auth
   * server — a slow network or an offline launch made it return null, and the
   * chat reported "you're not signed in" on a perfectly valid session.)
   */
  static async getCurrentUserId(): Promise<string | null> {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.id) return data.session.user.id;
    } catch (error) {
      console.warn('[Auth] Supabase session lookup failed:', error);
    }

    const stored = await AuthService.getStoredSession();
    return stored?.userId ?? null;
  }

  static async isSignedIn(): Promise<boolean> {
    return (await AuthService.getCurrentUserId()) !== null;
  }

  /**
   * Where a cold start should land. Called by the loading screen, including
   * the cold start caused by tapping a hydration reminder — which is why a
   * signed-in user must never be sent back to `Login` from here.
   */
  static async resolveStartupRoute(): Promise<StartupRoute> {
    const userId = await AuthService.getCurrentUserId();
    if (!userId) return 'Login';

    const stored = await AuthService.getStoredSession();
    if (stored?.onboardedAt) return 'Home';

    // No local flag: the profile may still exist from a previous install.
    try {
      const { data } = await supabase
        .from('getvari_profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (data?.id) {
        await AuthService.markOnboardingComplete();
        return 'Home';
      }
    } catch (error) {
      console.warn('[Auth] Profile lookup failed, continuing to onboarding:', error);
    }

    return 'Onboarding';
  }

  /** Records that the onboarding wizard finished, so it is never re-shown. */
  static async markOnboardingComplete(): Promise<void> {
    const stored = await AuthService.getStoredSession();
    if (!stored) return;
    await writeSession({ ...stored, onboardedAt: new Date().toISOString() });
  }

  /**
   * Starts phone verification.
   *
   * Supabase SMS is attempted first. When it is not configured for the project
   * — which is the case for the investor build — the challenge falls back to
   * the demo passcode instead of failing, so the instructions printed on the
   * login screen ("enter any Indian mobile number") actually hold. Entering an
   * arbitrary number used to throw here and leave the app in a half-signed-in
   * state.
   */
  static async sendOtp(phoneNumber: string): Promise<OtpChallenge> {
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: phoneNumber });
      if (error) throw error;
      return { phoneNumber, isDemo: false };
    } catch (error: any) {
      console.warn(
        `[Auth] Supabase SMS unavailable (${error?.message ?? error}); using demo passcode.`
      );
      return { phoneNumber, isDemo: true };
    }
  }

  /** Verifies the code and persists the session. */
  static async verifyOtp(challenge: OtpChallenge, otp: string): Promise<StoredSession> {
    const code = otp.trim();

    if (!challenge.isDemo) {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: challenge.phoneNumber,
        token: code,
        type: 'sms',
      });

      if (!error && data.session?.user?.id) {
        return writeSession({
          userId: data.session.user.id,
          phoneNumber: challenge.phoneNumber,
          isDemo: false,
          createdAt: new Date().toISOString(),
        });
      }

      // A real challenge that the demo passcode answers still gets the user in;
      // anything else is a genuinely wrong code.
      if (code !== DEMO_PASSCODE) {
        throw new Error(error?.message || 'Invalid verification code.');
      }
    }

    if (code !== DEMO_PASSCODE) {
      throw new Error(`Invalid demo code. Use ${DEMO_PASSCODE}.`);
    }

    // Drop any leftover Supabase session, otherwise `getCurrentUserId` would
    // keep returning the previous account's uid and write this demo user's
    // entries under it.
    try {
      await supabase.auth.signOut();
    } catch {
      /* no session to clear */
    }

    return writeSession({
      userId: await demoIdFor(challenge.phoneNumber),
      phoneNumber: challenge.phoneNumber,
      isDemo: true,
      createdAt: new Date().toISOString(),
    });
  }

  /** Clears the session everywhere it is held. */
  static async logout(): Promise<void> {
    restored = Promise.resolve(null);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('[Auth] Supabase sign-out failed:', error);
    }
    try {
      await AsyncStorage.removeItem(SESSION_KEY);
      await Keychain.resetGenericPassword({ service: LEGACY_KEYCHAIN_SERVICE });
    } catch (error) {
      console.error('[Auth] Failed to clear stored session:', error);
    }
  }
}

export default AuthService;
