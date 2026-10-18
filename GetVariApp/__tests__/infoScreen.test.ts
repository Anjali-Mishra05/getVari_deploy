/**
 * The four information screens — About, Terms & Conditions, Privacy Policy,
 * Help & Support — share one layout: a title, a summary card and one card per
 * section. Help lists its topics collapsed and opens one at a time.
 *
 *   npx jest --config jest.config.logic.js __tests__/infoScreen.test.ts
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const { createElement } = jest.requireActual('react');
  const host = (name: string) => (props: any) => createElement(name, props, props.children);
  return {
    View: host('View'),
    Text: host('Text'),
    ScrollView: host('ScrollView'),
    StatusBar: host('StatusBar'),
    TouchableOpacity: host('TouchableOpacity'),
    StyleSheet: { create: (styles: any) => styles },
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { createElement } = jest.requireActual('react');
  return { SafeAreaView: (props: any) => createElement('SafeAreaView', props, props.children) };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {} },
}));
jest.mock('react-native-css-interop', () => {
  const { createElement } = jest.requireActual('react');
  return { __esModule: true, createInteropElement: createElement };
});
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: (_target, name) => (name === '__esModule' ? false : () => null) })
);

import InfoScreen from '../src/screens/InfoScreen';
import INFO_DOCUMENTS, { InfoTopic } from '../src/content/infoContent';
import { setThemeMode } from '../src/theme/theme';

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

const render = (topic?: string, goBack = () => {}) => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      React.createElement(InfoScreen, { navigation: { goBack }, route: { params: { topic } } })
    );
  });
  return tree;
};
const byTestID = (tree: TestRenderer.ReactTestRenderer, testID: string) =>
  tree.root.find(node => typeof node.type === 'string' && node.props.testID === testID);
const texts = (tree: TestRenderer.ReactTestRenderer): string[] =>
  tree.root
    .findAll(node => (node.type as any) === 'Text')
    .map(node => [node.props.children].flat().join(''));
const flatStyle = (style: any): any => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

beforeEach(() => act(() => setThemeMode('dark')));

describe.each(['about', 'terms', 'privacy'] as InfoTopic[])('%s', topic => {
  const document = INFO_DOCUMENTS[topic];

  test('shows its title, its summary and every section, all expanded', () => {
    const tree = render(topic);
    expect(byTestID(tree, 'info-title').props.children).toBe(document.title);
    const shown = texts(tree);
    expect(shown).toContain(document.intro);
    for (const section of document.sections) {
      expect(shown).toContain(section.heading);
      // The last line of each section is on screen: nothing is collapsed.
      const last = section.body[section.body.length - 1].replace(/^(• |\d+\.\s+)/, '');
      expect(shown).toContain(last);
    }
  });
});

test('the legal documents number their sections', () => {
  const shown = texts(render('terms'));
  INFO_DOCUMENTS.terms.sections.forEach((_section, index) => expect(shown).toContain(String(index + 1)));
});

test('bullets and numbered steps are drawn without their markers', () => {
  const shown = texts(render('help'));
  expect(shown).toContain('1.');
  expect(shown).toContain('Sign in with your mobile number.');
  expect(shown.some(text => text.startsWith('• ') || /^\d+\.\s/.test(text))).toBe(false);
});

describe('Help & Support', () => {
  const topics = INFO_DOCUMENTS.help.sections;

  test('lists every topic, with only the first one open', () => {
    const tree = render('help');
    const shown = texts(tree);
    for (const section of topics) expect(shown).toContain(section.heading);
    expect(byTestID(tree, 'help-topic-0').props.accessibilityState).toEqual({ expanded: true });
    expect(byTestID(tree, 'help-topic-1').props.accessibilityState).toEqual({ expanded: false });
    expect(shown).not.toContain(topics[1].body[0]);
  });

  test('tapping a topic opens it and closes the one that was open', () => {
    const tree = render('help');
    act(() => byTestID(tree, 'help-topic-3').props.onPress());
    expect(byTestID(tree, 'help-topic-3').props.accessibilityState).toEqual({ expanded: true });
    expect(byTestID(tree, 'help-topic-0').props.accessibilityState).toEqual({ expanded: false });
    expect(texts(tree)).toContain(topics[3].body[0]);

    // Tapping it again closes it.
    act(() => byTestID(tree, 'help-topic-3').props.onPress());
    expect(byTestID(tree, 'help-topic-3').props.accessibilityState).toEqual({ expanded: false });
  });
});

test('the back arrow goes back', () => {
  const goBack = jest.fn();
  const tree = render('privacy', goBack);
  act(() => byTestID(tree, 'info-back').props.onPress());
  expect(goBack).toHaveBeenCalledTimes(1);
});

test('an unknown topic falls back to Help rather than a blank screen', () => {
  expect(byTestID(render('nonsense'), 'info-title').props.children).toBe('Help & Support');
});

test('the screen follows the shared mode: dark text on a light page in light mode', () => {
  const tree = render('about');
  const titleColor = () => flatStyle(byTestID(tree, 'info-title').props.style).color;
  expect(titleColor()).toBe('#ffffff');
  act(() => setThemeMode('light'));
  expect(titleColor()).toBe('#18181b');
});
