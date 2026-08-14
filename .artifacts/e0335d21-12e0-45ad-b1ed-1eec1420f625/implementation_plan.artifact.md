# Implementation Plan - Fix AI Backend Connectivity

The AquaSage AI chat is unable to reach the backend server. This is typically due to network isolation between the Android device/emulator and the development machine where the FastAPI server is running.

## User Review Required

> [!IMPORTANT]
> The backend server **must** be running for the chat to work. Please ensure you have run `python main.py` in the `Chatbot/backend` directory.

## Proposed Changes

### 1. Backend Configuration

#### [MODIFY] [backend.ts](file:///C:/getvari_windows/GetVariApp/src/config/backend.ts)
- Add more robust logging to `backendCandidates` to help debug which addresses are being tried and why they fail.
- Ensure `10.0.2.2` is prioritized for Android emulators.

### 2. Chat Component

#### [MODIFY] [AquaSageChat.tsx](file:///C:/getvari_windows/GetVariApp/src/chatbot/AquaSageChat.tsx)
- Increase the server discovery timeout from 2.5s to 5s to account for slow initial wake-ups of the Python server.
- Add UI feedback when searching for the server so the user knows discovery is in progress.

### 3. Native Connectivity (Manual Action)
- I will execute `adb reverse tcp:8000 tcp:8000` to bridge the device's port 8000 to the host machine. (Done in research phase, but will verify).

## Verification Plan

### Manual Verification
1.  Ensure the backend server is running: `Invoke-WebRequest -Uri http://localhost:8000/ping` (Already verified as working).
2.  Launch the app and open the AquaSage chat.
3.  Type a message and hit send.
4.  **Result**: The app should correctly discover the server (likely via `10.0.2.2` or `localhost` after reverse) and receive an AI response.
