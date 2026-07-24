# Implementation Plan - React Native Migration & Prototype Reversion

Restore the web prototype to its original UI-only state with mock authentication and provide a production-grade implementation for a **React Native CLI** application.

## User Review Required

> [!IMPORTANT]
> **Prototype Reversion**: I will revert [App.tsx](file:///C:/Users/anjal/Downloads/getvari_windows/src/App.tsx) to use the hardcoded "8842" mock OTP logic. This ensures the web page remains a pixel-perfect UI prototype without real backend dependencies.
>
> **React Native Implementation**: Since React Native uses different components (`View`, `Text`, `TouchableOpacity`) and APIs (`react-native-keychain`, `@react-native-firebase/auth`), I will provide the native implementation as new files.

## Proposed Changes

### 1. Prototype Reversion (Web)

#### [MODIFY] [App.tsx](file:///C:/Users/anjal/Downloads/getvari_windows/src/App.tsx)
- Revert `handleRequestOtp` and `handleVerifyOtp` to use original mock logic.
- Restore the `useEffect` that simulates auto-reading "8842".
- Remove reCAPTCHA injection logic.
- Remove imports of `authService` and `firebase/auth`.

#### [DELETE] [authService.ts](file:///C:/Users/anjal/Downloads/getvari_windows/src/utils/authService.ts)
- Remove the Web SDK based authentication service.

### 2. React Native CLI Implementation

#### [NEW] [AuthService.ts](file:///C:/Users/anjal/Downloads/getvari_windows/.artifacts/c5de1f82-2717-40c8-94ec-cdb8f0efe66e/AuthService.ts)
- Implementation using `@react-native-firebase/auth`.
- Secure JWT storage using `react-native-keychain`.
- Logic for exchanging Firebase ID Token with the Express backend.

#### [NEW] [LoginScreen.tsx](file:///C:/Users/anjal/Downloads/getvari_windows/.artifacts/c5de1f82-2717-40c8-94ec-cdb8f0efe66e/LoginScreen.tsx)
- React Native translation of the prototype's Login UI.
- Pixel-perfect styling using `StyleSheet`.

#### [NEW] [OtpScreen.tsx](file:///C:/Users/anjal/Downloads/getvari_windows/.artifacts/c5de1f82-2717-40c8-94ec-cdb8f0efe66e/OtpScreen.tsx)
- React Native translation of the prototype's OTP UI.

## Verification Plan

### Manual Verification
- Confirm the Web Prototype behaves as a mock UI again (entering "8842" works).
- Review the generated React Native code to ensure it matches the security requirements (E.164, Throttling support, Keychain storage).
- Verify the Backend API remains compatible with the new Native service.
