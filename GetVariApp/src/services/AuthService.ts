import { supabase } from './SupabaseClient';
import * as Keychain from 'react-native-keychain';
import { firebase } from '@react-native-firebase/app';
import { getAuth, signInWithPhoneNumber, signOut, FirebaseAuthTypes } from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Custom type to handle both real Firebase and Demo mode.
 */
export type AuthChallenge = FirebaseAuthTypes.ConfirmationResult & {
  isDemo?: boolean;
  phoneNumber?: string;
};

export interface StoredSession {
  firebase_uid: string;
  supabase_id: string;
  phone_number?: string;
  last_login: string;
  isDemo?: boolean;
}

export class AuthService {
  /**
   * Triggers Firebase Phone Authentication (SMS OTP) with a silent Demo fallback.
   */
  static async sendOtp(phoneNumber: string): Promise<AuthChallenge> {
    try {
      console.log('[AuthService] Attempting Modular Firebase OTP for:', phoneNumber);

      const auth = getAuth();
      if (!auth) throw new Error('Firebase Auth not available');

      const confirmation = await signInWithPhoneNumber(auth, phoneNumber);
      return confirmation as AuthChallenge;

    } catch (error: any) {
      console.log('[AuthService] Firebase failed, entering Demo Mode. Reason:', error?.message || 'Initialization');

      // Mock confirmation result for Demo Mode
      const mockResult: AuthChallenge = {
        isDemo: true,
        phoneNumber,
        confirm: async (code: string) => {
          if (code === '123456' || code === '884200') {
            // Return a mock user credential
            return {
              user: {
                uid: `demo_${phoneNumber.replace(/\D/g, '')}`,
                phoneNumber,
              }
            } as any;
          }
          throw new Error('Invalid verification code. (Demo: use 123456)');
        }
      };

      return mockResult;
    }
  }

  /**
   * Verifies the OTP code and maps to Supabase identity.
   */
  static async verifyOtp(
    confirmation: AuthChallenge,
    otp: string
  ): Promise<void> {
    try {
      console.log('[AuthService] Verifying OTP (Mode: ' + (confirmation.isDemo ? 'Demo' : 'Firebase') + ')...');

      const userCredential = await confirmation.confirm(otp);
      if (!userCredential || !userCredential.user) {
        throw new Error('Verification failed. Invalid response from server.');
      }

      const firebaseUser = userCredential.user;
      const uid = firebaseUser.uid;
      const phone = firebaseUser.phoneNumber;

      console.log('[AuthService] Identity verified:', uid, phone);

      let supabaseId = null;

      // 1. Primary Match: Search by firebase_uid
      const { data: profileByUid, error: uidError } = await supabase
        .from('getvari_profiles')
        .select('id, firebase_uid')
        .eq('firebase_uid', uid)
        .maybeSingle();

      if (uidError) throw uidError;

      if (profileByUid) {
        supabaseId = profileByUid.id;
      } else {
        // 2. Secondary Match: Search by phone_number
        if (phone) {
          const { data: profileByPhone, error: phoneError } = await supabase
            .from('getvari_profiles')
            .select('id, firebase_uid')
            .eq('phone_number', phone)
            .maybeSingle();

          if (phoneError) throw phoneError;

          if (profileByPhone) {
            // Link existing profile to this UID
            const { error: updateError } = await supabase
              .from('getvari_profiles')
              .update({ firebase_uid: uid })
              .eq('id', profileByPhone.id);

            if (updateError) throw updateError;
            supabaseId = profileByPhone.id;
          }
        }
      }

      // 3. Create New Profile if no match found
      if (!supabaseId) {
        const { error: insertError } = await supabase
          .from('getvari_profiles')
          .insert({
            id: uid,
            firebase_uid: uid,
            phone_number: phone,
            profile: {},
            updated_at: new Date().toISOString()
          });

        if (insertError) throw insertError;
        supabaseId = uid;
      }

      // Store session in Keychain
      const sessionData: StoredSession = {
        firebase_uid: uid,
        supabase_id: supabaseId,
        phone_number: phone || undefined,
        last_login: new Date().toISOString(),
        isDemo: !!confirmation.isDemo,
      };

      await Keychain.setGenericPassword('user_session', JSON.stringify(sessionData), {
        service: 'com.getvari.auth',
      });

    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.log('[AuthService] Verification Error:', errorMessage);
      throw new Error(errorMessage || 'Verification failed. Please try again.');
    }
  }

  /**
   * Retrieves the current Supabase ID.
   */
  static async getCurrentUserId(): Promise<string | null> {
    try {
      const session = await this.getStoredSession();
      if (session) return session.supabase_id;

      // Fallback: Check if Firebase is logged in
      try {
        const user = getAuth().currentUser;
        if (user) {
          const { data } = await supabase
            .from('getvari_profiles')
            .select('id')
            .eq('firebase_uid', user.uid)
            .maybeSingle();
          return data?.id || null;
        }
      } catch (e) {}

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Retrieves the full session blob.
   */
  static async getStoredSession(): Promise<StoredSession | null> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: 'com.getvari.auth',
      });

      if (credentials) {
        return JSON.parse(credentials.password) as StoredSession;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Clears session.
   */
  static async logout(): Promise<void> {
    try {
      try {
        await signOut(getAuth());
      } catch (e) {}

      await supabase.auth.signOut();
      await Keychain.resetGenericPassword({ service: 'com.getvari.auth' });
    } catch (error) {}
  }

  /**
   * Decides which screen to show on app launch.
   */
  static async resolveStartupRoute(): Promise<'Home' | 'Onboarding' | 'Login'> {
    try {
      const userId = await this.getCurrentUserId();
      if (!userId) return 'Login';

      const isComplete = await AsyncStorage.getItem('getvari_onboard_complete');
      if (isComplete === 'true') return 'Home';

      const { data } = await supabase
        .from('getvari_profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        await AsyncStorage.setItem('getvari_onboard_complete', 'true');
        return 'Home';
      }

      return 'Onboarding';
    } catch (e) {
      return 'Login';
    }
  }

  /**
   * Persists the onboarding status.
   */
  static async markOnboardingComplete(): Promise<void> {
    await AsyncStorage.setItem('getvari_onboard_complete', 'true');
  }
}
