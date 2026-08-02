import { supabase } from './SupabaseClient';
import * as Keychain from 'react-native-keychain';

export class AuthService {
  /**
   * Triggers Supabase Phone Authentication (SMS OTP).
   */
  static async sendOtp(phoneNumber: string): Promise<any> {
    try {
      // Demo Bypass for User Testing
      if (phoneNumber === '+919004223553') {
        console.log('Demo Mode: Bypassing Supabase SMS for +919004223553');
        return { isDemo: true, phoneNumber };
      }

      const { error } = await supabase.auth.signInWithOtp({
        phone: phoneNumber,
      });

      if (error) throw error;

      return { isDemo: false, phoneNumber };
    } catch (error) {
      console.error('Send OTP Error:', error);
      throw error;
    }
  }

  /**
   * Verifies the OTP code with Supabase.
   */
  static async verifyOtp(
    confirmation: any,
    otp: string
  ): Promise<void> {
    try {
      let sessionData: any = { isDemo: false, token: null };

      if (confirmation.isDemo) {
        if (otp === '884200') {
          // Generate a unique ID for this specific demo session
          const uniqueDemoId = `demo_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          sessionData = { isDemo: true, token: uniqueDemoId };
        } else {
          throw new Error('Invalid demo code. Use 884200');
        }
      } else {
        const { data, error } = await supabase.auth.verifyOtp({
          phone: confirmation.phoneNumber,
          token: otp,
          type: 'sms',
        });

        if (error) throw error;
        if (!data.session) throw new Error('Verification failed');

        sessionData = { isDemo: false, token: data.session.access_token };
      }

      // Store entire session object in Keychain to avoid overwriting
      await Keychain.setGenericPassword('user_session', JSON.stringify(sessionData), {
        service: 'com.getvari.auth',
      });

    } catch (error) {
      console.error('Verify OTP Error:', error);
      throw error;
    }
  }

  /**
   * Retrieves the current user UUID.
   */
  static async getCurrentUserId(): Promise<string | null> {
    try {
      // 1. Check Supabase native auth first
      const { data } = await supabase.auth.getUser();
      if (data.user?.id) return data.user.id;

      // 2. Fallback to check Keychain for Demo status
      const credentials = await Keychain.getGenericPassword({
        service: 'com.getvari.auth',
      });

      if (credentials) {
        try {
          const session = JSON.parse(credentials.password);
          if (session.isDemo) {
            // Return the unique session ID generated during verifyOtp
            return session.token;
          }
        } catch (parseError) {
          // Fallback for unexpected formats
          if (credentials.password === 'demo-token') {
            return 'demo_legacy_user';
          }
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Clears session from Supabase and Keychain.
   */
  static async logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
      await Keychain.resetGenericPassword({
        service: 'com.getvari.auth',
      });
    } catch (error) {
      console.error('Logout Error:', error);
    }
  }
}
