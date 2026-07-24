import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import * as Keychain from 'react-native-keychain';

const BACKEND_URL = 'https://your-backend-api.com'; // Replace with your production URL

export class AuthService {
  /**
   * Triggers Firebase Phone Authentication.
   * On Android, this might be automatic. On iOS, it usually requires a reCAPTCHA.
   */
  static async sendOtp(phoneNumber: string): Promise<FirebaseAuthTypes.ConfirmationResult> {
    try {
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

      const idToken = await userCredential.user.getIdToken();

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
