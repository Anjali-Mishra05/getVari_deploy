import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import * as Keychain from 'react-native-keychain';
import { Platform } from 'react-native';

// Use your local IP for physical device testing
// Fallback to localhost if not specified in .env
const BACKEND_URL = process.env.BACKEND_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');

export class AuthService {
  /**
   * Triggers Firebase Phone Authentication.
   */
  static async sendOtp(phoneNumber: string): Promise<FirebaseAuthTypes.ConfirmationResult> {
    try {
      // Demo Bypass for User Testing
      if (phoneNumber === '+919004223553') {
        console.log('Demo Mode: Bypassing Firebase SMS for +919004223553');
        return {
          confirm: async (code: string) => {
            if (code === '884200') {
              return { user: { getIdToken: async () => 'demo-id-token' } };
            }
            throw new Error('Invalid demo code. Use 884200');
          },
        } as any;
      }

      // Backend validation and throttling check
      const response = await fetch(`${BACKEND_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to authorize OTP request');
      }

      // Trigger Firebase SMS
      return await auth().signInWithPhoneNumber(phoneNumber);
    } catch (error) {
      console.error('Send OTP Error:', error);
      throw error;
    }
  }

  /**
   * Verifies the OTP code with Firebase and exchanges the ID Token for a backend JWT.
   */
  static async verifyOtp(
    confirmation: FirebaseAuthTypes.ConfirmationResult,
    otp: string
  ): Promise<void> {
    try {
      const userCredential = await confirmation.confirm(otp);
      if (!userCredential) throw new Error('Verification failed');

      // If in demo mode, skip backend JWT exchange or use a mock
      const idToken = await userCredential.user.getIdToken();
      if (idToken === 'demo-id-token') {
        await Keychain.setGenericPassword('user_session', 'demo-jwt-token', {
          service: 'com.getvari.auth',
        });
        return;
      }

      // Exchange Firebase ID Token for Backend JWT
      const response = await fetch(`${BACKEND_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Backend verification failed');
      }

      const { token } = await response.json();

      // Securely store JWT in Keychain
      await Keychain.setGenericPassword('user_session', token, {
        service: 'com.getvari.auth',
      });
    } catch (error) {
      console.error('Verify OTP Error:', error);
      throw error;
    }
  }

  /**
   * Retrieves the stored backend JWT.
   */
  static async getStoredToken(): Promise<string | null> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: 'com.getvari.auth',
      });
      return credentials ? credentials.password : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Clears session from Firebase and Keychain.
   */
  static async logout(): Promise<void> {
    try {
      await auth().signOut();
      await Keychain.resetGenericPassword({
        service: 'com.getvari.auth',
      });
    } catch (error) {
      console.error('Logout Error:', error);
    }
  }
}
