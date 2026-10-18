/**
 * The shared dark/light mode: one state, persisted, and a light counterpart
 * for every dark-assuming colour class the dashboard uses.
 *
 * Also the three in-app documents: each has the sections it is meant to.
 *
 *   npx jest --config jest.config.logic.js __tests__/theme.test.ts
 */

import fs from 'fs';
import path from 'path';

const mockStore = new Map<string, string>();
let mockFailWrites = false;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => Promise.resolve(mockStore.has(key) ? mockStore.get(key)! : null),
    setItem: (key: string, value: string) => {
      if (mockFailWrites) return Promise.reject(new Error('disk full'));
      mockStore.set(key, value);
      return Promise.resolve();
    },
  },
}));

// React is only used for the scoped-theme probe; the build's JSX runtime is
// not needed for it.
jest.mock('react-native-css-interop', () => {
  const { createElement } = jest.requireActual('react');
  return { __esModule: true, createInteropElement: createElement };
});
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));

import {
  LIGHT_CLASSES,
  getThemeMode,
  loadThemeMode,
  setThemeMode,
  ThemeScope,
  accent,
  themed,
  themedStyles,
  toggleThemeMode,
  tone,
  useScopedTheme,
} from '../src/theme/theme';
import INFO_DOCUMENTS from '../src/content/infoContent';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const KEY = 'getvari_theme_mode';

beforeEach(async () => {
  mockFailWrites = false;
  setThemeMode('dark');
  await Promise.resolve();
  mockStore.clear();
});

describe('one shared mode', () => {
  test('starts dark, toggles, and is the same value for every reader', () => {
    expect(getThemeMode()).toBe('dark');
    toggleThemeMode();
    expect(getThemeMode()).toBe('light');
    expect(tone('d', 'l')).toBe('l');
    toggleThemeMode();
    expect(getThemeMode()).toBe('dark');
    expect(tone('d', 'l')).toBe('d');
  });

  test('the choice is stored and restored on the next launch', async () => {
    setThemeMode('light');
    await Promise.resolve();
    expect(mockStore.get(KEY)).toBe('light');

    // A new launch: memory is back to the default, storage still has it.
    setThemeMode('dark');
    await Promise.resolve();
    mockStore.set(KEY, 'light');
    expect(await loadThemeMode()).toBe('light');
    expect(getThemeMode()).toBe('light');
  });

  test('nothing stored, or something unreadable, leaves it dark', async () => {
    expect(await loadThemeMode()).toBe('dark');
    mockStore.set(KEY, 'sepia');
    expect(await loadThemeMode()).toBe('dark');
  });

  test('a failed write still changes the mode for this session', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFailWrites = true;
    setThemeMode('light');
    await Promise.resolve();
    await Promise.resolve();
    expect(getThemeMode()).toBe('light');
    warn.mockRestore();
  });
});

describe('class names', () => {
  test('dark mode returns the class string untouched', () => {
    const classes = 'flex-1 bg-black/40 text-white border border-white/5';
    expect(themed(classes)).toBe(classes);
  });

  test('light mode swaps only the dark-assuming classes', () => {
    setThemeMode('light');
    expect(themed('flex-1 bg-black/40 text-white border border-white/5 text-[11px]')).toBe(
      'flex-1 bg-white text-zinc-900 border border-zinc-200 text-[11px]'
    );
    // Colours that read on both backgrounds are left alone.
    expect(themed('text-emerald-500 bg-amber-500/10')).toBe('text-emerald-500 bg-amber-500/10');
    // The neon accent fill becomes a deeper one, with white written on it.
    expect(themed('bg-[#00f2fe] text-[#020617]')).toBe('bg-cyan-600 text-white');
    // Tinted panels turn neutral rather than light blue, and opaque rather
    // than see-through: page, card and tile are three solid levels.
    expect(themed('bg-[#02050e]')).toBe('bg-[#f5f5f3]');
    expect(themed('bg-white/[0.03] border-white/5')).toBe('bg-zinc-50 border-zinc-200');
    expect(themed('bg-cyan-950/30 border-cyan-500/15')).toBe('bg-zinc-50 border-zinc-200');
  });

  /**
   * The dashboard files are scanned for colour classes that assume a dark
   * background (white or pale text, white-tinted or black surfaces and
   * borders). Each must have a light counterpart, or it would be invisible in
   * light mode — which is how a class added later gets caught.
   */
  test('every dark-assuming colour class in the themed files has a light counterpart', () => {
    const root = path.join(__dirname, '..', 'src');
    const files = [
      'screens/HomeScreen.tsx',
      // The sign-in flow follows the mode too.
      ...['Splash', 'Loading', 'Login', 'Otp', 'Onboarding', 'PermissionGate'].map(name => `screens/${name}Screen.tsx`),
      'components/GlassCard.tsx',
      'components/analytics/AnalyticsView.tsx',
      ...fs
        .readdirSync(path.join(root, 'components', 'dashboard'))
        .filter(name => name.endsWith('.tsx'))
        .map(name => `components/dashboard/${name}`),
    ];
    const darkAssuming =
      /^(text-white(\/\d+)?|text-neutral-\d+|text-(cyan|amber|emerald|indigo|rose|sky|blue|violet)-(200|300|400)(\/\d+)?|(bg|border)-white\/\S+|bg-black\/\d+|bg-neutral-9\d\d|(bg|border)-\[#02050e\]|bg-cyan-950\/\d+|text-\[#00f2fe\])$/;

    const missing = new Set<string>();
    for (const file of files) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      if (!source.includes('themed(')) continue;
      for (const match of source.matchAll(/themed\((['"`])([\s\S]*?)\1\)/g)) {
        for (const token of match[2].split(/[\s'"`?:{}$]+/)) {
          if (darkAssuming.test(token) && !(token in LIGHT_CLASSES)) missing.add(`${token} (${file})`);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });
});

describe('styles and shared controls', () => {
  test('a themed StyleSheet reads the sheet for the current mode', () => {
    let builds = 0;
    const styles = themedStyles(() => {
      builds++;
      return { label: { color: tone('#ffffff', '#0f172a') } };
    });
    expect(styles.label.color).toBe('#ffffff');
    setThemeMode('light');
    expect(styles.label.color).toBe('#0f172a');
    setThemeMode('dark');
    expect(styles.label.color).toBe('#ffffff');
    expect(builds).toBe(2); // once per mode, then reused
  });

  test('the accent darkens on a light surface', () => {
    expect(accent()).toBe('#00f2fe');
    setThemeMode('light');
    expect(accent()).toBe('#0891b2');
  });

  /**
   * The sheet, dialog, button and fields are shared with sign-in and
   * onboarding, which stay dark. They turn light only inside a screen that
   * opted in, and follow the one shared mode there.
   */
  test('shared controls turn light only inside a screen that follows the mode', () => {
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
    const seen: Record<string, string> = {};
    const Probe = ({ name }: { name: string }) => {
      const { pick, cls } = useScopedTheme();
      seen[name] = `${pick('dark', 'light')} ${cls('text-white')}`;
      return null;
    };
    const tree = React.createElement(
      React.Fragment,
      null,
      React.createElement(Probe, { name: 'outside' }),
      React.createElement(ThemeScope.Provider, { value: true }, React.createElement(Probe, { name: 'inside' })),
      React.createElement(
        ThemeScope.Provider,
        { value: true },
        React.createElement(ThemeScope.Provider, { value: false }, React.createElement(Probe, { name: 'pinned' }))
      )
    );
    act(() => {
      TestRenderer.create(tree);
    });
    expect(seen).toEqual({
      outside: 'dark text-white',
      inside: 'dark text-white',
      pinned: 'dark text-white',
    });

    act(() => setThemeMode('light'));
    expect(seen).toEqual({
      outside: 'dark text-white',
      inside: 'light text-zinc-900',
      pinned: 'dark text-white',
    });
  });
});

describe('every app-owned surface follows the one mode', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

  test('the full-screen reminder takes its colours from the shared mode, not a fixed dark', () => {
    const source = read('src/components/ReminderFullScreen.tsx');
    expect(source).toContain('useThemeMode()');
    expect(source).not.toMatch(/const (BACKDROP|ACCENT) = '#/);
    // Outside the palette (and the mode-independent risk / error colours),
    // nothing is drawn in a literal colour.
    const literal = source
      .split('\n')
      .filter(line => /'#[0-9a-fA-F]{6}'|rgba\(/.test(line) && !line.includes('tone('))
      .map(line => line.trim());
    expect(literal).toEqual([
      "if (score >= 70) return '#ef4444';",
      "if (score >= 40) return '#f59e0b';",
      "return '#10b981';",
      "color: '#f43f5e',",
    ]);
  });

  test('the reminder is not pinned dark where the dashboard mounts it', () => {
    const source = read('src/screens/HomeScreen.tsx');
    const mount = source.indexOf('<ReminderFullScreen');
    const pinnedBefore = source.lastIndexOf('<ThemeScope.Provider value={false}>', mount);
    const closedBefore = source.lastIndexOf('</ThemeScope.Provider>', mount);
    // No still-open "dark in both modes" scope around the reminder.
    expect(pinnedBefore).toBeLessThanOrEqual(closedBefore);
  });

  test('the manual water-log sheet subscribes to the shared mode and keeps no state of its own', () => {
    const source = read('src/components/QuickLogSheet.tsx');
    expect(source).toContain('useThemeMode()');
    expect(source).not.toMatch(/useColorScheme|Appearance\./);
  });

  test('nothing is drawn before the saved mode has been restored', () => {
    const source = read('App.tsx');
    expect(source).toContain('loadThemeMode().finally(() => setThemeReady(true))');
    expect(source).toContain('if (!themeReady) return');
  });

  test('section cards get a visible outline in dark mode only', () => {
    const source = read('src/components/GlassCard.tsx');
    expect(source).toContain("adaptive && getThemeMode() === 'dark'");
    expect(source).toContain("const DARK_BORDER = 'rgba(255,255,255,0.09)'");
    // Light mode still takes its border from the mapped classes.
    expect(themed('border border-white/8')).toBe('border border-white/8');
    setThemeMode('light');
    expect(themed('border border-white/8')).toBe('border border-zinc-200');
  });
});

describe('in-app documents', () => {
  test('Help & Support covers every topic it is meant to', () => {
    expect(INFO_DOCUMENTS.help.sections.map(section => section.heading)).toEqual([
      'Getting Started',
      'Wearable / Device',
      'Hydration Risk Score',
      'Daily Water Requirement',
      'Fluid Logging',
      'Notifications & Reminders',
      'Wearable Battery',
      'Basic Troubleshooting',
    ]);
  });

  test('each document has a title, an intro and non-empty sections', () => {
    for (const topic of ['about', 'terms', 'privacy', 'help'] as const) {
      const document = INFO_DOCUMENTS[topic];
      expect(document.title.length).toBeGreaterThan(0);
      expect(document.intro.length).toBeGreaterThan(0);
      expect(document.sections.length).toBeGreaterThan(0);
      for (const section of document.sections) {
        expect(section.heading.length).toBeGreaterThan(0);
        expect(section.body.length).toBeGreaterThan(0);
        for (const paragraph of section.body) expect(paragraph.trim().length).toBeGreaterThan(0);
      }
    }
    expect(INFO_DOCUMENTS.terms.title).toBe('Terms & Conditions');
    expect(INFO_DOCUMENTS.privacy.title).toBe('Privacy Policy');
    expect(INFO_DOCUMENTS.help.title).toBe('Help & Support');
  });

  test('the Privacy Policy makes no retention, deletion, encryption or selling claims', () => {
    const text = JSON.stringify(INFO_DOCUMENTS.privacy).toLowerCase();
    for (const word of ['encrypt', 'delete', 'retention', 'retain', 'sell', 'gdpr', 'anonymi']) {
      expect(text).not.toContain(word);
    }
  });
});
