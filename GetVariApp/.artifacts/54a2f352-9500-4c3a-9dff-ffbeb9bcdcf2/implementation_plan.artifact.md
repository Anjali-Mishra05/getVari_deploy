# Isolate Admin Panel inside GetVariApp

This plan aims to establish the **Admin Panel** as the primary web application within the `GetVariApp/` directory while preserving all existing **Mobile App** functionality (BLE, onboarding, screens, etc.) and keeping the **original prototype** in the root directory completely unchanged.

## User Review Required

> [!IMPORTANT]
> - The **Root Project** (`C:/getvari_windows/`) will remain untouched.
> - The **`GetVariApp/` Subfolder** will serve both the mobile app code and the new modular Admin Panel.
> - The Admin Panel will be designated as the primary application for `npm run dev` in the `GetVariApp/` folder.
> - Build conflicts will be resolved by focusing the Vite configuration on the Admin Panel and removing unnecessary mobile-web mocks.

## Proposed Changes

### [Admin Panel - GetVariApp (C:/getvari_windows/GetVariApp/)]

#### [MODIFY] [index.html](file:///C:/getvari_windows/GetVariApp/index.html)
- Update the main entry point to load the modular admin panel script: `<script type="module" src="/src/admin-web/main.tsx"></script>`.

#### [DELETE] Redundant Files
- Remove monolithic/duplicate admin files:
    - `admin.html`
    - `admin-web.html`
    - `src/admin.tsx`
    - `src/components/AdminConsole.tsx`

#### [MODIFY] [vite.config.ts](file:///C:/getvari_windows/GetVariApp/vite.config.ts)
- Set `index.html` as the sole build input.
- Remove the `react-native` alias and associated mocks (`mock-react-native.ts`). Since the Admin Panel does not use React Native, removing these mocks resolves the build errors you encountered.

#### [PRESERVE] Mobile App Code
The following mobile-related files will be **KEPT UNCHANGED** inside `GetVariApp/src/`:
- `App.tsx`
- `screens/`
- `chatbot/`
- `utils/`
- `types.ts`
- `components/Onboarding.tsx`, `DeviceSimulator.tsx`, etc.
- (And all other React Native related files: `android/`, `ios/`, `metro.config.js`, etc.)

## Verification Plan

### Manual Verification
- **Admin Panel**: Navigate to `GetVariApp/` and run `npm run dev`. Verify the Admin Command Center loads successfully at `http://localhost:5173/` without React Native related errors.
- **Root Prototype**: Navigate to the root directory and run `npm run dev`. Verify the original prototype remains functional and unchanged.
- **Mobile App**: Ensure mobile-specific files remain present in `GetVariApp/src/`.
