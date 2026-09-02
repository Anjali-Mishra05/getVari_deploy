import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { getAuth, signInWithPhoneNumber, signOut } from '@react-native-firebase/auth';

import { supabase } from './SupabaseClient';

/**
 * Owns "who is this device signed in as?", and keeps the answer across app
 * restarts.
 *
 * Four rules hold everything together:
 *
 *  1. **The session survives a cold start.** It lives in AsyncStorage, which is
 *     readable the moment JS boots — including the boot triggered by tapping a
 *     reminder notification. Nothing here asks the network, so a launch with no
 *     connectivity still resolves to a signed-in user instead of the login
 *     screen.
 *  2. **The user id is stable.** One device keeps one id forever (per phone
 *     number), so yesterday's hydration entries are still that user's entries
 *     today. Minting a fresh id on every verification orphaned the previous
 *     day's rows.
 *  3. **The id is always a UUID.** `getvari_profiles.id` is a uuid column and
 *     RLS compares against `auth.uid()`, so an id shaped like anything else —
 *     `demo_919876543210`, say — is a write that silently fails.
 *  4. **Firebase is the real transport, demo is the fallback.** Phone auth is
 *     attempted first; when the project has no SMS configured (the investor
 *     build) the challenge degrades to the printed passcode rather than
 *     throwing, so "enter any Indian mobile number" actually holds.
 */

const SESSION_KEY = 'getvari_session';
const DEMO_IDS_KEY = 'getvari_demo_identities';
const LEGACY_KEYCHAIN_SERVICE = 'com.getvari.auth';
const PROFILES_TABLE = 'getvari_profiles';

/** The passcode printed on the login and OTP screens. */
export const DEMO_PASSCODE = '884200';

export type StartupRoute = 'Home' | 'Onboarding' | 'Login';

export interface StoredSession {
  /** Row owner for every Supabase write. A real auth uid, or a demo UUID. */
  userId: string;
  phoneNumber: string;
  /** True when this session never reached a real provider (demo passcode). */
  isDemo: boolean;
  /** Present only for sessions that completed Firebase phone auth. */
  firebaseUid?: string;
  /** Set once the onboarding wizard has been completed and saved. */
  onboardedAt?: string;
  createdAt: string;
}

/**
 * Handed from the login screen to the OTP screen.
 *
 * On the Firebase path it carries the provider's confirmation object, which is
 * what actually verifies the code; on the demo path there is nothing to carry
 * but the number.
 */
export type AuthChallenge = {
  phoneNumber: string;
  /** True when Firebase SMS was unavailable and the demo passcode applies. */
  isDemo: boolean;
  /**
   * Present only on the Firebase path. Typed structurally rather than as
   * `FirebaseAuthTypes.ConfirmationResult`, because the v26 SDK does not
   * re-export that namespace and only `confirm` is used here.
   */
  confirm?: (code: string) => Promise<{ user?: { uid?: string } | null } | null>;
};

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

    const phoneNumber =
      typeof legacy.phoneNumber === 'string'
        ? legacy.phoneNumber
        : typeof legacy.phone_number === 'string'
        ? legacy.phone_number
        : 'unknown';

    const session: StoredSession = {
      // Neither the legacy demo token nor the `demo_<digits>` id written by the
      // Firebase-only build was ever a UUID, so neither can be reused as a row
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

/**
 * Finds (or creates) the profile row a verified Firebase user owns, and
 * returns its UUID.
 *
 * Matching runs uid first, then phone number, so a user who signed in on an
 * earlier build keeps the rows they already have.
 */
const resolveProfileIdForFirebaseUser = async (
  uid: string,
  phoneNumber: string
): Promise<string> => {
  const { data: byUid } = await supabase
    .from(PROFILES_TABLE)
    .select('id')
    .eq('firebase_uid', uid)
    .maybeSingle();
  if (byUid?.id) return byUid.id;

  const { data: byPhone } = await supabase
    .from(PROFILES_TABLE)
    .select('id')
    .eq('phone_number', phoneNumber)
    .maybeSingle();
  if (byPhone?.id) {
    await supabase.from(PROFILES_TABLE).update({ firebase_uid: uid }).eq('id', byPhone.id);
    return byPhone.id;
  }

  // A brand-new user. The id is minted here rather than taken from the uid,
  // because the column is a uuid and a Firebase uid is not one.
  const id = randomUuid();
  await supabase.from(PROFILES_TABLE).insert({
    id,
    firebase_uid: uid,
    phone_number: phoneNumber,
    profile: {},
    updated_at: new Date().toISOString(),
  });
  return id;
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
      if (data?.session?.user?.id) return data.session.user.id;
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
        .from(PROFILES_TABLE)
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
   * Firebase phone auth is attempted first. When it is unavailable — no SMS
   * configured, no google-services file, no network — the challenge falls back
   * to the demo passcode instead of failing, so the instructions printed on the
   * login screen actually hold. Entering an arbitrary number used to throw here
   * and leave the app in a half-signed-in state.
   */
  static async sendOtp(phoneNumber: string): Promise<AuthChallenge> {
    try {
      const auth = getAuth();
      if (!auth) throw new Error('Firebase Auth not available');

      const confirmation = await signInWithPhoneNumber(auth, phoneNumber);
      if (!confirmation) throw new Error('Firebase returned no confirmation');

      return Object.assign(confirmation, { phoneNumber, isDemo: false });
    } catch (error: any) {
      console.warn(
        `[Auth] Firebase SMS unavailable (${error?.message ?? error}); using demo passcode.`
      );
      return { phoneNumber, isDemo: true };
    }
  }

  /** Verifies the code and persists the session. */
  static async verifyOtp(challenge: AuthChallenge, otp: string): Promise<StoredSession> {
    const code = otp.trim();

    if (!challenge.isDemo && typeof challenge.confirm === 'function') {
      try {
        const credential = await challenge.confirm(code);
        const user = credential?.user;

        if (user?.uid) {
          const userId = await resolveProfileIdForFirebaseUser(user.uid, challenge.phoneNumber);
          return writeSession({
            userId,
            phoneNumber: challenge.phoneNumber,
            isDemo: false,
            firebaseUid: user.uid,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (error: any) {
        // A real challenge that the demo passcode answers still gets the user
        // in; anything else is a genuinely wrong code.
        if (code !== DEMO_PASSCODE) {
          throw new Error(error?.message || 'Invalid verification code.');
        }
      }

      if (code !== DEMO_PASSCODE) {
        throw new Error('Invalid verification code.');
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
      await signOut(getAuth());
    } catch {
      /* not signed in to Firebase */
    }
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
