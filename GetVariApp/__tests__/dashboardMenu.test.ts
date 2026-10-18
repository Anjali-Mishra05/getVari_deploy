/**
 * The hamburger menu lists About, Terms & Conditions, Privacy Policy, Help &
 * Support and Dark Mode / Light Mode, in that order; the three documents open
 * through `onOpenTopic`; and the theme switch reads and writes the one shared
 * theme mode rather than a state of its own.
 *
 *   npx jest --config jest.config.logic.js __tests__/dashboardMenu.test.ts
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockStore = new Map<string, string>();

jest.mock('react-native', () => {
  const { createElement } = jest.requireActual('react');
  const host = (name: string) => (props: any) => createElement(name, props, props.children);
  return {
    View: host('View'),
    Text: host('Text'),
    TouchableOpacity: host('TouchableOpacity'),
    Switch: host('Switch'),
    StyleSheet: { create: (styles: any) => styles },
  };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => Promise.resolve(mockStore.has(key) ? mockStore.get(key)! : null),
    setItem: (key: string, value: string) => {
      mockStore.set(key, value);
      return Promise.resolve();
    },
  },
}));
jest.mock('react-native-css-interop', () => {
  const { createElement } = jest.requireActual('react');
  return { __esModule: true, createInteropElement: createElement };
});
// The component's JSX compiles against nativewind's runtime; plain React is
// all a render test needs.
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('lucide-react-native', () => {
  const icon = () => null;
  return { ChevronRight: icon, FileText: icon, Info: icon, LifeBuoy: icon, Moon: icon, ShieldCheck: icon, Sun: icon };
});
jest.mock('../src/components/ui/Sheet', () => ({
  __esModule: true,
  default: (props: any) =>
    props.visible ? jest.requireActual('react').createElement('Sheet', { title: props.title }, props.children) : null,
}));

import DashboardMenu from '../src/components/dashboard/DashboardMenu';
import { getThemeMode, setThemeMode, toggleThemeMode } from '../src/theme/theme';

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

const opened: string[] = [];
const render = (visible = true) => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      React.createElement(DashboardMenu, {
        visible,
        onClose: () => {},
        onOpenTopic: (topic: string) => opened.push(topic),
      })
    );
  });
  return tree;
};
const rows = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAll(node => (node.type as any) === 'TouchableOpacity');
const row = (tree: TestRenderer.ReactTestRenderer, testID: string) =>
  rows(tree).find(node => node.props.testID === testID)!;
const themeSwitch = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.find(node => (node.type as any) === 'Switch');
const textOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAll(node => (node.type as any) === 'Text').map(node => node.props.children);

beforeEach(() => {
  opened.length = 0;
  mockStore.clear();
  act(() => setThemeMode('dark'));
});

test('lists the five entries in order, with their full names', () => {
  const tree = render();
  expect(rows(tree).map(node => node.props.testID)).toEqual([
    'menu-about',
    'menu-terms',
    'menu-privacy',
    'menu-help',
    'menu-theme',
  ]);
  expect(textOf(tree)).toEqual(
    expect.arrayContaining(['About', 'Terms & Conditions', 'Privacy Policy', 'Help & Support', 'Dark Mode / Light Mode'])
  );
});

test('renders nothing while closed', () => {
  expect(render(false).toJSON()).toBeNull();
});

test('About, Terms, Privacy and Help each open their own document', () => {
  const tree = render();
  act(() => row(tree, 'menu-about').props.onPress());
  act(() => row(tree, 'menu-terms').props.onPress());
  act(() => row(tree, 'menu-privacy').props.onPress());
  act(() => row(tree, 'menu-help').props.onPress());
  expect(opened).toEqual(['about', 'terms', 'privacy', 'help']);
  // No version here: it lives on the Profile page only.
  expect(JSON.stringify(tree.toJSON())).not.toMatch(/version|android/i);
});

describe('the theme switch uses the shared theme state', () => {
  test('it shows the shared mode', () => {
    const tree = render();
    expect(themeSwitch(tree).props.value).toBe(false);
    expect(row(tree, 'menu-theme').props.accessibilityState).toEqual({ checked: false });
    expect(textOf(tree)).toContain('Dark');
  });

  test('switching it in the menu changes the shared mode', () => {
    const tree = render();
    act(() => themeSwitch(tree).props.onValueChange(true));
    expect(getThemeMode()).toBe('light');
    expect(themeSwitch(tree).props.value).toBe(true);

    // Pressing the row is the same control.
    act(() => row(tree, 'menu-theme').props.onPress());
    expect(getThemeMode()).toBe('dark');
    expect(themeSwitch(tree).props.value).toBe(false);
  });

  test('a change made elsewhere (the dashboard toggle) shows in the open menu at once', () => {
    const tree = render();
    act(() => toggleThemeMode()); // what the dashboard's button calls
    expect(themeSwitch(tree).props.value).toBe(true);
    expect(textOf(tree)).toContain('Light');
    act(() => toggleThemeMode());
    expect(themeSwitch(tree).props.value).toBe(false);
  });
});
