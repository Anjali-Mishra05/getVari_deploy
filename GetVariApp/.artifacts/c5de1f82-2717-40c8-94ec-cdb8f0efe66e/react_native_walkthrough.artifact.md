# React Native CLI Implementation Walkthrough

I have successfully ported the pixel-perfect prototype UI to your React Native CLI project and integrated the secure Phone OTP authentication flow.

## Project Structure Created
I have organized the code following best practices for a scalable React Native application:

- **[`src/services/AuthService.ts`](file:///C:/Users/anjal/Downloads/getvari_windows/GetVariApp/src/services/AuthService.ts)**: Handles Firebase Auth, Backend JWT exchange, and secure Keychain storage.
- **[`src/screens/LoginScreen.tsx`](file:///C:/Users/anjal/Downloads/getvari_windows/GetVariApp/src/screens/LoginScreen.tsx)**: The native implementation of your mobile-responsive login UI.
- **[`src/screens/OtpScreen.tsx`](file:///C:/Users/anjal/Downloads/getvari_windows/GetVariApp/src/screens/OtpScreen.tsx)**: The native 6-digit OTP verification screen.
- **[`App.tsx`](file:///C:/Users/anjal/Downloads/getvari_windows/GetVariApp/App.tsx)**: Root component configured with `react-navigation`.

## Key Features Implemented

### 1. Adaptive Backend Connectivity
The `AuthService` automatically detects the environment:
- **Android Emulator**: Connects to `http://10.0.2.2:3000`.
- **iOS Simulator / Real Device**: Connects to `http://localhost:3000` or your production IP.

### 2. Native UI Translation
- Replaced all HTML tags (`div`, `span`) with Native equivalents (`View`, `Text`).
- Implemented the complex "Glassmorphism" effect using `backgroundColor` with alpha transparency and subtle borders.
- Recreated the "Ambient Glow" backgrounds using absolute positioned `View` components with large blur radii.

### 3. Secure Session Management
- **Firebase Auth**: Integrated `@react-native-firebase/auth` for real SMS delivery.
- **Keychain Storage**: Implemented `react-native-keychain` to store the backend-issued JWT in the device's secure enclave (hardware-encrypted).

## CRITICAL: Final Configuration Steps

To make the app functional, you MUST complete these platform-specific steps:

> [!IMPORTANT]
> **Firebase Setup**:
> 1.  Go to [Firebase Console](https://console.firebase.google.com/).
> 2.  Add an **Android** app (Package name: `com.getvariapp`).
> 3.  Download `google-services.json` and place it in `GetVariApp/android/app/`.
> 4.  Add an **iOS** app (Bundle ID: `com.getvariapp`).
> 5.  Download `GoogleService-Info.plist` and add it to the project via Xcode.

> [!WARNING]
> **SHA-1 Fingerprint**:
> For Phone Auth to work on Android, you must generate a SHA-1 fingerprint from your debug keystore and add it to the Firebase console.
> `cd android && ./gradlew signingReport`

## How to Run
1.  **Ensure Backend is Running**: In the root folder, run `npm run dev`.
2.  **Start Metro Bundler**:
    ```bash
    cd GetVariApp
    npx react-native start
    ```
3.  **Run on Device/Emulator**:
    ```bash
    npx react-native run-android
    # OR
    npx react-native run-ios
    ```
