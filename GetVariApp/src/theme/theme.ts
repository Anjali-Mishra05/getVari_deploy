import { createContext, useContext, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The app's one appearance setting: dark or light.
 *
 * There is exactly one copy of the mode — the variable below — and every
 * control that shows or changes it reads and writes that copy. The dashboard
 * toggle and the hamburger-menu toggle therefore cannot disagree: neither
 * owns a state of its own to drift.
 *
 * ## How a screen follows it
 *
 * The dashboard was written dark-only, in utility classes. Rather than
 * rewriting every card, a class string is passed through `themed()`, which in
 * dark mode returns it untouched — so dark mode renders exactly what it always
 * did — and in light mode swaps each dark-assuming class for its light
 * counterpart from `LIGHT_CLASSES`. Colours set in `style` use `tone()`.
 *
 * A screen follows the mode by calling `useThemeMode()` at its root, which
 * re-renders it, and so everything under it, when the mode changes.
 */

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'getvari_theme_mode';

let mode: ThemeMode = 'dark';
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getThemeMode = (): ThemeMode => mode;

const apply = (next: ThemeMode) => {
  if (next === mode) return;
  mode = next;
  listeners.forEach(listener => listener());
};

/** Sets the mode for every screen and remembers it for the next launch. */
export const setThemeMode = (next: ThemeMode): void => {
  apply(next);
  AsyncStorage.setItem(STORAGE_KEY, next).catch(error =>
    console.warn('[Theme] Could not store the appearance:', error)
  );
};

export const toggleThemeMode = (): void => setThemeMode(mode === 'dark' ? 'light' : 'dark');

/**
 * Restores the mode chosen on an earlier launch. Dark when nothing is stored.
 *
 * The preference belongs to the device, not to an account: nothing in sign-in
 * or sign-out reads, writes or clears it, so it is the same before, during
 * and after a logout.
 */
export const loadThemeMode = async (): Promise<ThemeMode> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') apply(stored);
  } catch (error) {
    console.warn('[Theme] Could not read the stored appearance:', error);
  }
  return mode;
};

/** The current mode; the calling component re-renders when it changes. */
export const useThemeMode = (): ThemeMode => useSyncExternalStore(subscribe, getThemeMode, getThemeMode);

/** `dark` in dark mode, `light` in light mode — for colours set in `style`. */
export const tone = <T,>(dark: T, light: T): T => (mode === 'light' ? light : dark);

/** The accent as text or an icon: the brand cyan is too pale to read on white. */
export const accent = (): string => tone('#00f2fe', '#0891b2');

/**
 * The accent as a fill — a button, an active state, a badge. On a light
 * surface the neon cyan glares, so the same hue is used a few steps deeper.
 */
export const accentFill = (): string => tone('#00f2fe', '#0891b2');

/** Text or an icon drawn on `accentFill()`. */
export const onAccent = (): string => tone('#020617', '#ffffff');

/**
 * A StyleSheet whose colours follow the mode.
 *
 * `build` is run once per mode, on first use, and the result is kept. The
 * object handed back reads through to whichever sheet matches the current
 * mode, so a component keeps writing `styles.row` and needs no other change.
 */
export const themedStyles = <T extends object>(build: () => T): T => {
  const built: Partial<Record<ThemeMode, T>> = {};
  return new Proxy({} as T, {
    get: (_target, key) => (built[mode] ?? (built[mode] = build()))[key as keyof T],
  });
};

/**
 * Marks a subtree as following the mode.
 *
 * The shared controls — the sheet, the dialog, the button, the fields — are
 * also used on sign-in and onboarding, which are dark in both modes. They ask
 * `useScopedTheme()` rather than the mode itself, and so only turn light
 * inside a screen that has opted in by providing this.
 */
export const ThemeScope = createContext(false);

export interface ScopedTheme {
  light: boolean;
  /** `dark`, or `light` when this subtree follows the mode and it is light. */
  pick: <T>(dark: T, light: T) => T;
  /** `themed()` under the same condition. */
  cls: (className: string) => string;
}

const mapClasses = (className: string): string => {
  const hit = cache.get(className);
  if (hit !== undefined) return hit;
  const mapped = className
    .split(/(\s+)/)
    .map(part => LIGHT_CLASSES[part] ?? part)
    .join('');
  cache.set(className, mapped);
  return mapped;
};

export const useScopedTheme = (): ScopedTheme => {
  const scoped = useContext(ThemeScope);
  const light = useThemeMode() === 'light' && scoped;
  return {
    light,
    pick: (dark, lightValue) => (light ? lightValue : dark),
    cls: className => (light ? mapClasses(className) : className),
  };
};

/**
 * Each dark-assuming class the dashboard uses, and what stands in for it on a
 * light background. Written out in full, not derived, because the stylesheet
 * is compiled from the class names that literally appear in the source.
 *
 * A class that is not listed reads the same in both modes and is left alone.
 */
export const LIGHT_CLASSES: Record<string, string> = {
  // Three opaque levels, so the hierarchy holds whatever sits behind a view:
  // an off-white page, white cards on it, and a faint grey for the tiles and
  // controls inside a card. Dark mode gets its depth from translucent white
  // over black; the same trick in reverse only makes a light screen look
  // grey and washed out.
  // Page
  'bg-[#02050e]': 'bg-[#f5f5f3]',
  'bg-[#01040a]': 'bg-[#f5f5f3]',
  // Cards
  'bg-[#0a101a]': 'bg-white',
  'bg-[#09131f]': 'bg-white',
  'bg-[#050c18]': 'bg-white',
  'bg-black/30': 'bg-white',
  'bg-black/40': 'bg-white',
  'bg-black/50': 'bg-white',
  'bg-black/60': 'bg-white',
  'bg-white/[0.01]': 'bg-white',
  'bg-cyan-950/5': 'bg-white',
  'bg-cyan-950/10': 'bg-white',
  // Tiles, fields and wells inside a card
  'bg-neutral-900': 'bg-zinc-100',
  'bg-white/[0.02]': 'bg-zinc-50',
  'bg-white/[0.03]': 'bg-zinc-50',
  'bg-white/[0.04]': 'bg-zinc-50',
  'bg-white/5': 'bg-zinc-100',
  'bg-white/10': 'bg-zinc-200',
  'bg-cyan-950/30': 'bg-zinc-50',
  'bg-cyan-950/60': 'bg-zinc-100',
  'bg-cyan-500/10': 'bg-zinc-100',
  'bg-emerald-950/60': 'bg-emerald-50',
  // Accent fills, and what is written on them.
  'bg-[#00f2fe]': 'bg-cyan-600',
  'border-[#00f2fe]': 'border-cyan-600',
  'text-[#020617]': 'text-white',
  'text-[#01040a]': 'text-white',
  'shadow-cyan-500/25': 'shadow-none',
  'shadow-2xl': 'shadow-sm',
  // Borders: one subtle grey for cards and tiles, one step firmer for fields.
  'border-[#02050e]': 'border-[#f5f5f3]',
  'border-white/[0.03]': 'border-zinc-200',
  'border-white/[0.04]': 'border-zinc-200',
  'border-white/[0.05]': 'border-zinc-200',
  'border-white/5': 'border-zinc-200',
  'border-white/8': 'border-zinc-200',
  'border-white/10': 'border-zinc-300',
  'border-white/20': 'border-zinc-300',
  'border-cyan-400/75': 'border-cyan-600',
  'border-cyan-400/30': 'border-zinc-300',
  'border-cyan-500/10': 'border-zinc-200',
  'border-cyan-500/15': 'border-zinc-200',
  'border-cyan-800/30': 'border-zinc-200',
  // Text
  'text-white': 'text-zinc-900',
  'text-white/80': 'text-zinc-800',
  'text-neutral-100': 'text-zinc-900',
  'text-neutral-200': 'text-zinc-800',
  'text-neutral-300': 'text-zinc-700',
  'text-neutral-400': 'text-zinc-600',
  'text-neutral-500': 'text-zinc-500',
  'text-neutral-600': 'text-zinc-500',
  'text-neutral-700': 'text-zinc-500',
  'text-red-400': 'text-red-600',
  'text-red-200': 'text-red-700',
  'text-amber-300/90': 'text-amber-700',
  'text-amber-500/80': 'text-amber-700',
  'text-amber-500/90': 'text-amber-700',
  'text-[#00f2fe]': 'text-cyan-700',
  'text-cyan-300': 'text-cyan-700',
  'text-cyan-400': 'text-cyan-700',
  'text-cyan-500': 'text-cyan-700',
  'text-amber-300': 'text-amber-700',
  'text-amber-300/70': 'text-amber-700/80',
  'text-amber-400': 'text-amber-700',
  'text-amber-500': 'text-amber-700',
  'text-amber-500/70': 'text-amber-700/80',
  'text-emerald-400': 'text-emerald-700',
  'text-indigo-300': 'text-indigo-700',
  'text-rose-400': 'text-rose-600',
};

const cache = new Map<string, string>();

/** `className`, as it should read in the current mode. */
export const themed = (className: string): string => (mode === 'light' ? mapClasses(className) : className);

export default { getThemeMode, setThemeMode, toggleThemeMode, loadThemeMode, useThemeMode, tone, themed };
