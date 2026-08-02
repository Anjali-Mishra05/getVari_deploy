# Implementation Plan - Final Keyboard & UI Fix

Resolve the persistent keyboard issue where the input box is covered or disappears on Android, and ensure UI stability.

## User Review Required

> [!IMPORTANT]
> I will be switching the `KeyboardAvoidingView` to use `behavior="padding"` for both iOS and Android. This is generally more reliable within Modals that use `statusBarTranslucent`.

## Proposed Changes

### 1. Fix Keyboard Visibility (Android)

#### [MODIFY] [src/chatbot/AquaSageChat.tsx](file:///Users/sereenathomas/StudioProjects/getVari/GetVariApp/src/chatbot/AquaSageChat.tsx)
- Change `behavior` to `padding` for Android.
- Adjust `keyboardVerticalOffset` to account for the Status Bar and Navigation Bar on Android.
- Change the chat window height from a percentage (`height: '82%'`) to a more flexible `maxHeight` or `flex: 1` structure when the keyboard is active, to prevent the window from shrinking too much or pushing the input off-screen.

### 2. UI Stability

#### [MODIFY] [src/chatbot/AquaSageChat.tsx](file:///Users/sereenathomas/StudioProjects/getVari/GetVariApp/src/chatbot/AquaSageChat.tsx)
- Ensure the teaser bubble and FAB are completely static when the modal is open.
- Refine the slide animation to be even more "solid" (less bouncy).

## Verification Plan

### Manual Verification
1.  **Typing Test**: Open the chat on an Android emulator/device.
2.  **Keyboard Check**: Tap the input box. Verify the input box stays visible and "follows" the keyboard up.
3.  **Stability Check**: Close and open the chat multiple times. Verify no jitter or "fluctuation" occurs.
