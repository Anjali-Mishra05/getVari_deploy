/**
 * The fluid logging feed shows three rows at a time and scrolls past that,
 * without dropping or reordering any entry.
 *
 *   npx jest --config jest.config.logic.js __tests__/fluidLoggingFeed.test.ts
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const { createElement } = jest.requireActual('react');
  const host = (name: string) => (props: any) => createElement(name, props, props.children);
  return { View: host('View'), Text: host('Text'), ScrollView: host('ScrollView') };
});
jest.mock('react-native-css-interop', () => {
  const { createElement } = jest.requireActual('react');
  return { __esModule: true, createInteropElement: createElement };
});
// The component's JSX compiles against nativewind's runtime; plain React is
// all a render test needs.
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('lucide-react-native', () => ({ Clock: () => null }));
// The feed reads the dark/light mode, which is persisted here.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {} },
}));
jest.mock('../src/components/GlassCard', () => ({
  __esModule: true,
  default: (props: any) => jest.requireActual('react').createElement('GlassCard', null, props.children),
}));

import FluidLoggingFeed from '../src/components/dashboard/FluidLoggingFeed';
import type { HydrationLog } from '../src/types';

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

const log = (id: string, minute: number): HydrationLog =>
  ({
    id,
    amountMl: 250,
    source: 'manual',
    timestamp: `2026-09-30T08:${String(minute).padStart(2, '0')}:00.000Z`,
  }) as HydrationLog;

const render = (logs: HydrationLog[]) => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(FluidLoggingFeed, { logs }));
  });
  return renderer.root;
};

/**
 * The mocked host components render as plain strings, which `ElementType`
 * does not include — hence the widening before comparing.
 */
const isHost = (n: TestRenderer.ReactTestInstance, name: string) => (n.type as unknown) === name;

/** Row ids in render order: the key-bearing rows are the ones with onLayout or the row class. */
const rowOrder = (root: TestRenderer.ReactTestInstance) =>
  root
    .findAll(n => isHost(n, 'View') && String(n.props.className ?? '').includes('justify-between'))
    .map(n => n.findAll(t => isHost(t, 'Text'))[0].props.children.join(''));

describe('fluid logging feed', () => {
  it('does not scroll with three or fewer entries', () => {
    const root = render([log('a', 1), log('b', 2), log('c', 3)]);
    expect(root.findAll(n => isHost(n, 'ScrollView'))).toHaveLength(0);
    expect(rowOrder(root)).toHaveLength(3);
  });

  it('scrolls, capped at three rows, when there are more', () => {
    const root = render([1, 2, 3, 4, 5, 6].map(m => log(`l${m}`, m)));
    const [scroll] = root.findAll(n => isHost(n, 'ScrollView'));
    expect(scroll).toBeDefined();
    expect(scroll.props.nestedScrollEnabled).toBe(true);
    // The indicator stays on screen rather than only appearing mid-scroll.
    expect(scroll.props.showsVerticalScrollIndicator).toBe(true);
    expect(scroll.props.persistentScrollbar).toBe(true);
    // Three estimated 54px rows and the two 10px gaps between them.
    expect(scroll.props.style.maxHeight).toBe(3 * 54 + 2 * 10);
  });

  it('renders every entry, newest first, with none hidden', () => {
    const logs = [3, 1, 6, 2, 5, 4].map(m => ({ ...log(`l${m}`, m), amountMl: m * 100 }));
    const root = render(logs);
    expect(rowOrder(root)).toEqual(['+600ml', '+500ml', '+400ml', '+300ml', '+200ml', '+100ml']);
  });

  it('sizes the window from the measured row height', () => {
    const root = render([1, 2, 3, 4].map(m => log(`l${m}`, m)));
    const firstRow = root.find(n => isHost(n, 'View') && typeof n.props.onLayout === 'function');
    act(() => firstRow.props.onLayout({ nativeEvent: { layout: { height: 60 } } }));
    const [scroll] = root.findAll(n => isHost(n, 'ScrollView'));
    expect(scroll.props.style.maxHeight).toBe(3 * 60 + 2 * 10);
  });
});
