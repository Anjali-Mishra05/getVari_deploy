# Implementation Plan - Dynamic Demo User Sessions

The user wants every login session using the demo code `884200` to create a brand new, unique record in Supabase instead of updating the same fixed "Demo" row.

## User Review Required

> [!WARNING]
> With this change, every time you log out and log back in with the demo code, you will start with a **fresh account**. You will not see your previous logs or profile because a new unique ID will be generated for that session. This matches your request to have "various IDs" in the database.

## Proposed Changes

### 1. Authentication Service

#### [MODIFY] [src/services/AuthService.ts](file:///Users/sereenathomas/StudioProjects/getVari/GetVariApp/src/services/AuthService.ts)
- Update `verifyOtp`: If the bypass code `884200` is used, generate a new random UUID (or unique timestamp-based ID) and store it as the `demoUserId` in the Keychain session.
- Update `getCurrentUserId`: Retrieve and return this session-specific unique ID instead of the fixed `0000...` ID.

### 2. Verification

- Every "Onboarding" completion and every "Log Drink" will now be associated with the unique ID generated at the start of that specific login session.

## Verification Plan

### Manual Verification
1. Open the app and log in with `884200`.
2. Complete onboarding and log a drink.
3. Log out of the app (or reset it).
4. Log in again with `884200`.
5. Complete onboarding with different values.
6. **Check Supabase**: Verify that two distinct rows now exist in `getvari_profiles` with two different IDs.
