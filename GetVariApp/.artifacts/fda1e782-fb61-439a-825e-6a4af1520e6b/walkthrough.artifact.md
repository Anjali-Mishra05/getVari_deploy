# Walkthrough - Dynamic Demo User Sessions

I have updated the authentication logic so that every time you log in with the demo code `884200`, a brand new unique ID is generated. This ensures that every testing session creates its own distinct row in your Supabase database instead of updating the same one.

## Changes Made

### 1. Unique ID Generation
- **[MODIFY] AuthService.ts**:
    - Updated `verifyOtp` to generate a session-specific ID using the current timestamp and a random number (e.g., `demo_1722612345678_123`).
    - This ID is now stored in the secure Keychain as the user's identifier for that session.

### 2. Session Logic
- **[MODIFY] AuthService.ts**:
    - Updated `getCurrentUserId` to retrieve and return this session-specific ID.
    - All subsequent calls to save profiles or log hydration will use this unique ID.

## Verification Results

### How to test:
1.  **Logout**: If you are already logged in, log out or clear the app storage.
2.  **Login 1**: Enter any number and use `884200`. Complete onboarding.
3.  **Check Supabase**: You will see a new ID (starting with `demo_`) in `getvari_profiles`.
4.  **Logout & Login 2**: Repeat the process.
5.  **Check Supabase**: You will now see a **second** unique ID in the database with the new values.

> [!TIP]
> This is perfect for demonstrating the app to multiple investors or for testing different biometric profiles side-by-side in your dashboard.

> [!IMPORTANT]
> Because each login creates a new ID, your "Hydration History" will be empty every time you log back in. This is expected since you are acting as a brand-new user for each demo session.
