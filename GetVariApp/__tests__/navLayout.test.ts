/**
 * The docked bottom bar, the chat button and the dashboard's scroll padding
 * against the system navigation: gesture handle, 3-button bar, or none.
 *
 *   npx jest --config jest.config.logic.js __tests__/navLayout.test.ts
 */

import fs from 'fs';
import path from 'path';

import {
  CHAT_GAP,
  NAV_HEIGHT,
  SHEET_SAFE_EDGES,
  chatButtonBottom,
  dashboardBottomPadding,
  footerBottomPadding,
  navBottomOffset,
  sideInset,
} from '../src/utils/navLayout';

/** Bottom insets Android reports, in dp: none, gesture handles, 3-button bars. */
const NONE = 0;
const GESTURE = [16, 20, 24];
const BUTTONS = [40, 48, 56];

describe('the bar against the system navigation', () => {
  test('no inset: the bar sits on the bottom edge, with nothing added under its items', () => {
    expect(navBottomOffset(NONE)).toBe(0);
    expect(chatButtonBottom(NONE)).toBe(76);
    expect(dashboardBottomPadding(NONE)).toBe(152);
  });

  test('a gesture handle or 3-button navigation: the items sit exactly above it, with no band of empty space', () => {
    for (const inset of [...GESTURE, ...BUTTONS]) {
      expect(navBottomOffset(inset)).toBe(inset);
      expect(chatButtonBottom(inset)).toBe(inset + 76);
      expect(dashboardBottomPadding(inset)).toBe(inset + 152);
    }
  });

  test('whatever the inset, nothing overlaps: system area < bar < chat button < end of content', () => {
    for (let inset = 0; inset <= 120; inset += 4) {
      const barBottom = navBottomOffset(inset);
      const barTop = barBottom + NAV_HEIGHT;
      expect(barBottom).toBeGreaterThanOrEqual(inset);
      expect(chatButtonBottom(inset)).toBe(barTop + CHAT_GAP);
      expect(dashboardBottomPadding(inset)).toBeGreaterThan(chatButtonBottom(inset));
    }
  });

  test('a missing or nonsensical inset is treated as none', () => {
    for (const bad of [undefined, null, NaN, -12, Infinity]) {
      expect(navBottomOffset(bad as any)).toBe(0);
      expect(sideInset(bad as any)).toBe(0);
    }
  });

  test('a sheet footer keeps its padding unless the system navigation is taller', () => {
    expect(footerBottomPadding(44, 0)).toBe(44);
    expect(footerBottomPadding(44, 24)).toBe(44);
    expect(footerBottomPadding(44, 48)).toBe(56);
  });

  test('a pinned footer line clears a 3-button bar and does not move for a gesture handle', () => {
    // The loading screen's footer: 40px off the bottom.
    expect(footerBottomPadding(40, NONE)).toBe(40);
    for (const inset of GESTURE) expect(footerBottomPadding(40, inset)).toBe(40);
    for (const inset of BUTTONS) expect(footerBottomPadding(40, inset)).toBeGreaterThan(inset);
  });
});

describe('the dashboard: the three places that must agree use the one rule', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

  test('the bar is docked edge to edge and pads its items from the insets', () => {
    const source = read('src/components/dashboard/DashboardNav.tsx').replace(/\r\n/g, '\n');
    expect(source).toMatch(/left: 0,\n\s*right: 0,\n\s*bottom: 0,/);
    expect(source).toContain('const bottomInset = navBottomOffset(insets.bottom);');
    expect(source).toContain('height: NAV_HEIGHT + bottomInset,');
    expect(source).toContain('paddingBottom: bottomInset,');
    expect(source).not.toMatch(/bottom: 32\b/);
  });

  test('the chat button and the scroll padding follow the bar', () => {
    expect(read('src/chatbot/AquaSageChat.tsx')).toContain('bottom: chatButtonBottom(insets.bottom)');
    expect(read('src/screens/HomeScreen.tsx')).toContain('paddingBottom: dashboardBottomPadding(insets.bottom)');
  });
});

describe('app-wide: every surface is clear of the system navigation', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const SAFE_AREA_IMPORT = "import { SafeAreaView } from 'react-native-safe-area-context';";

  const sources = (dir: string): string[] =>
    fs.readdirSync(path.join(__dirname, '..', dir), { withFileTypes: true }).flatMap(entry => {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return entry.name === 'admin-web' ? [] : sources(file);
      return file.endsWith('.tsx') ? [file] : [];
    });

  test('every bottom sheet: the shared panel is a safe-area view on its bottom and side edges', () => {
    const sheet = read('src/components/ui/Sheet.tsx');
    expect(sheet).toContain(SAFE_AREA_IMPORT);
    expect(sheet).toContain('edges={SHEET_SAFE_EDGES}');
    expect([...SHEET_SAFE_EDGES]).toEqual(['bottom', 'left', 'right']);
  });

  test('every sheet in the app is built on the shared one, so none can opt out', () => {
    for (const file of [
      'src/components/ProfileSheet.tsx',
      'src/components/ProfileEditSheet.tsx',
      'src/components/QuickLogSheet.tsx',
      'src/components/DeviceConnectSheet.tsx',
      'src/components/NotificationCenter.tsx',
      'src/components/CityPickerModal.tsx',
      'src/components/TimeField.tsx',
      'src/components/SensorTestPanel.tsx',
      'src/components/dashboard/DashboardMenu.tsx',
    ]) {
      const source = read(file);
      expect(`${file}: ${/<Sheet\b/.test(source)}`).toBe(`${file}: true`);
      expect(`${file}: ${/<Modal\b/.test(source)}`).toBe(`${file}: false`);
    }
  });

  test('every dialog: the shared card is centred inside the safe area', () => {
    const dialog = read('src/components/ui/Dialog.tsx');
    expect(dialog).toContain(SAFE_AREA_IMPORT);
    expect(dialog).toContain('<SafeAreaView style={styles.safeArea} pointerEvents="box-none">');
    for (const file of ['src/components/dashboard/FluidLogConfirmModal.tsx', 'src/components/dashboard/FluidLogSuccessModal.tsx']) {
      expect(read(file)).toMatch(/<Dialog\b/);
    }
  });

  test('only the four shared hosts open a native modal window', () => {
    const hosts = sources('src').filter(file => /<Modal\b/.test(read(file))).sort();
    expect(hosts).toEqual([
      'src/chatbot/AquaSageChat.tsx',
      'src/components/ReminderFullScreen.tsx',
      'src/components/ui/Dialog.tsx',
      'src/components/ui/Sheet.tsx',
    ]);
  });

  test('no screen uses the React Native SafeAreaView, which does nothing on Android, except the two with nothing at an edge', () => {
    const offenders = sources('src')
      .filter(file => /import \{[^}]*\bSafeAreaView\b[^}]*\} from 'react-native';/.test(read(file)))
      .sort();
    // Splash and Loading centre one block; Loading's footer line is positioned
    // from the insets itself (below).
    expect(offenders).toEqual(['src/screens/LoadingScreen.tsx', 'src/screens/SplashScreen.tsx']);
  });

  test('sign-in, OTP, onboarding, the permission gate, the info pages and the reminder sit inside the safe area', () => {
    for (const file of [
      'src/screens/LoginScreen.tsx',
      'src/screens/OtpScreen.tsx',
      'src/screens/OnboardingScreen.tsx',
      'src/screens/PermissionGateScreen.tsx',
      'src/screens/InfoScreen.tsx',
      'src/components/ReminderFullScreen.tsx',
    ]) {
      expect(`${file}: ${read(file).includes(SAFE_AREA_IMPORT)}`).toBe(`${file}: true`);
    }
  });

  test('the loading screen footer takes its clearance from the insets', () => {
    expect(read('src/screens/LoadingScreen.tsx')).toContain('bottom: footerBottomPadding(40, insets.bottom)');
  });

  test('the chat sheet pads its input row from its own window, not the main one', () => {
    const source = read('src/chatbot/AquaSageChat.tsx').replace(/\r\n/g, '\n');
    // A provider inside the Modal measures that window's insets...
    const modal = source.slice(source.indexOf('<Modal'), source.indexOf('</Modal>'));
    expect(modal).toContain('<SafeAreaProvider>');
    expect(modal).toContain('<ChatFooter keyboardOpen={keyboardHeight > 0}');
    // ...and the footer reads them from there, with its usual padding as the floor.
    const footer = source.slice(source.indexOf('const ChatFooter'), source.indexOf('const AquaSageChat'));
    expect(footer).toContain('const insets = useSafeAreaInsets();');
    expect(footer).toContain("footerBottomPadding(Platform.OS === 'android' ? 44 : 48, insets.bottom)");
    // Unchanged where no inset is required, and 16 with the keyboard up.
    expect(footerBottomPadding(44, NONE)).toBe(44);
    expect(footer).toMatch(/keyboardOpen\s*\?\s*16/);
  });

  test('the shared sheet and dialog rely on the native safe-area view alone, so no inset is applied twice', () => {
    // The native view measures its own overlap with the system bars in its
    // own window; adding a JS inset on top would count it a second time.
    for (const file of ['src/components/ui/Sheet.tsx', 'src/components/ui/Dialog.tsx']) {
      const source = read(file);
      expect(`${file}: ${source.includes('useSafeAreaInsets')}`).toBe(`${file}: false`);
      expect(`${file}: ${source.includes('insets.bottom')}`).toBe(`${file}: false`);
    }
    // Nor do the sheets built on it add one of their own.
    for (const file of ['src/components/ProfileSheet.tsx', 'src/components/ProfileEditSheet.tsx', 'src/components/QuickLogSheet.tsx']) {
      expect(`${file}: ${read(file).includes('insets.bottom')}`).toBe(`${file}: false`);
    }
  });
});
