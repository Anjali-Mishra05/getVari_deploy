# Premium Redesign: Production-Ready React Native App

Redesign the GetVari React Native app to match the premium futuristic prototype, removing all "investor/demo" placeholders and focusing on a commercial-grade health-tech experience.

## User Review Required

> [!IMPORTANT]
> **Asset Assets**: I will recreate the logo animations and visual effects using code (SVGs and Reanimated) to ensure pixel-perfect reproduction of the prototype's "V vessel" fill effect.
> **Navigation Flow**: I am adding Splash and Loading screens as the entry point of the app, followed by Login, OTP, Onboarding, and the Main Dashboard.

## Proposed Changes

### [Component: Shared Components]
#### [NEW] [BrandLogo.tsx](file:///C:/getvari_windows/GetVariApp/src/components/BrandLogo.tsx)
- Implement the animated "V vessel" filling logo using `react-native-reanimated` and `react-native-svg`.
- Supports different sizes and states (fill progress).

#### [NEW] [GlassCard.tsx](file:///C:/getvari_windows/GetVariApp/src/components/GlassCard.tsx)
- Reusable glassmorphism component with configurable opacity, blur (simulated), and borders.

### [Component: Screens Redesign]
#### [NEW] [SplashScreen.tsx](file:///C:/getvari_windows/GetVariApp/src/screens/SplashScreen.tsx)
- Replicate the prototype's initial screen with the filling V logo.

#### [NEW] [LoadingScreen.tsx](file:///C:/getvari_windows/GetVariApp/src/screens/LoadingScreen.tsx)
- Second stage of boot: logo + "Hydration Intelligence" + premium loading animation.

#### [MODIFY] [LoginScreen.tsx](file:///C:/getvari_windows/GetVariApp/src/screens/LoginScreen.tsx)
- Redesign with production copy.
- Pixel-perfect alignment of mobile input and T&C checkbox.

#### [MODIFY] [OtpScreen.tsx](file:///C:/getvari_windows/GetVariApp/src/screens/OtpScreen.tsx)
- Redesign with proper 6-digit OTP grid.
- Countdown and resend logic improvements.

#### [NEW] [OnboardingScreen.tsx](file:///C:/getvari_windows/GetVariApp/src/screens/OnboardingScreen.tsx)
- Port the setup wizard from the web prototype, optimized for mobile.
- Remove all "Bypass" and "Investor" text.

#### [NEW] [HomeScreen.tsx](file:///C:/getvari_windows/GetVariApp/src/screens/HomeScreen.tsx)
- Implement the main dashboard with premium cards, radial progress, and AI insights.

### [Component: App Core]
#### [MODIFY] [App.tsx](file:///C:/getvari_windows/GetVariApp/App.tsx)
- Update navigation stack to include all new screens.
- Implement logic to handle initial boot sequence (Splash -> Loading -> Auth/Home).

---

## Verification Plan

### Automated Tests
- Verify NativeWind class compilation.
- Check Reanimated animation frame rates.

### Manual Verification
- Verify the "V vessel" fill animation timing matches the prototype.
- Ensure all "Confidential/Demo" text is gone.
- Test the full auth flow on a real device.
