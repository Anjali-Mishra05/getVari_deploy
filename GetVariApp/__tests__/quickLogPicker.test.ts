/**
 * The shared water-logging picker used by the "Log water" sheet and the
 * full-screen reminder: the quick amounts with the selected one highlighted,
 * the custom amount field, and the label the "Log" button shows for each.
 *
 *   npx jest --config jest.config.logic.js __tests__/quickLogPicker.test.ts
 */

const mockDismiss = jest.fn();

jest.mock('react-native', () => ({
  Keyboard: { dismiss: () => mockDismiss() },
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity',
  ActivityIndicator: 'ActivityIndicator',
}));
jest.mock('react-native-css-interop', () => {
  const { createElement } = jest.requireActual('react');
  return { __esModule: true, createInteropElement: createElement };
});
// The component's JSX compiles against nativewind's runtime; plain React is
// all a render test needs.
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('lucide-react-native', () => ({ Check: 'Check', Droplets: 'Droplets' }));
jest.mock('../src/theme/theme', () => ({ accent: () => '#00f2fe', tone: (dark: string) => dark }));
jest.mock('../src/services/HydrationService', () => ({ MAX_SINGLE_ENTRY_ML: 5000 }));

import React from 'react';
import TestRenderer, { act, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

import { quickLogAmounts } from '../src/utils/hydrationAmounts';
import QuickLogAmounts, {
  QuickLogSelection,
  quickLogButtonLabel,
  useQuickLogSelection,
} from '../src/components/QuickLogAmounts';

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

let latest: QuickLogSelection;
let changes = 0;

/** The picker as a caller mounts it, with the caller's busy state. */
const Harness: React.FC<{ busy?: boolean; savingMl?: number | null; loggedMl?: number | null }> = ({
  busy = false,
  savingMl = null,
  loggedMl = null,
}) => {
  const selection = useQuickLogSelection(busy, () => {
    changes++;
  });
  latest = selection;
  return React.createElement(QuickLogAmounts, { selection, busy, savingMl, loggedMl });
};

const mount = (props: React.ComponentProps<typeof Harness> = {}): ReactTestRenderer => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Harness, props));
  });
  return renderer;
};

const amountButtons = (renderer: ReactTestRenderer): ReactTestInstance[] =>
  renderer.root.findAll(node => (node.type as unknown) === 'TouchableOpacity' && node.props.accessibilityRole === 'radio');
const checkedMl = (renderer: ReactTestRenderer): string[] =>
  amountButtons(renderer)
    .filter(button => button.props.accessibilityState.checked)
    .map(button => button.props.accessibilityLabel);
const customField = (renderer: ReactTestRenderer): ReactTestInstance =>
  renderer.root.find(node => (node.type as unknown) === 'TextInput');
const typeCustom = (renderer: ReactTestRenderer, text: string) =>
  act(() => customField(renderer).props.onChangeText(text));
const press = (button: ReactTestInstance) => act(() => button.props.onPress());
const hasError = (renderer: ReactTestRenderer): boolean =>
  renderer.root.findAll(node => (node.type as unknown) === 'Text' && node.props.children === 'Enter an amount from 1 to 5000 ml.')
    .length > 0;

beforeEach(() => {
  changes = 0;
  mockDismiss.mockClear();
});

describe('The shared quick-log picker', () => {
  test('offers all four presets with the usual amount selected, and a custom field', () => {
    const renderer = mount();
    const labels = amountButtons(renderer).map(button => button.props.accessibilityLabel);
    expect(labels).toHaveLength(4);
    expect(quickLogAmounts().map(amount => amount.ml)).toEqual([250, 500, 750, 1000]);
    expect(labels.map(label => label.split(',')[0])).toEqual(quickLogAmounts().map(amount => amount.label));
    expect(checkedMl(renderer)).toHaveLength(1);
    expect(latest.selectedMl).not.toBeNull();
    expect(customField(renderer).props.placeholder).toBe('Enter amount');
    expect(quickLogButtonLabel(latest, false)).toMatch(/^Log /);
  });

  test('tapping a preset moves the highlight and the Log label with it', () => {
    const renderer = mount();
    press(amountButtons(renderer)[2]);
    expect(latest.selectedMl).toBe(750);
    expect(checkedMl(renderer)).toHaveLength(1);
    expect(checkedMl(renderer)[0]).toMatch(new RegExp(`^${quickLogAmounts()[2].label}, .*, selected$`));
    expect(quickLogButtonLabel(latest, false)).toBe('Log 750 ml');
    expect(mockDismiss).toHaveBeenCalled();
    expect(changes).toBe(1);

    press(amountButtons(renderer)[3]);
    expect(latest.selectedMl).toBe(1000);
    expect(quickLogButtonLabel(latest, false)).toBe('Log 1 L');
  });

  test('a typed custom amount becomes the selection and clears the preset highlight', () => {
    const renderer = mount();
    typeCustom(renderer, '330');
    expect(latest.selectedMl).toBe(330);
    expect(checkedMl(renderer)).toEqual([]);
    expect(quickLogButtonLabel(latest, false)).toBe('Log 330 ml');
    expect(hasError(renderer)).toBe(false);

    // Picking a preset afterwards replaces what was typed.
    press(amountButtons(renderer)[1]);
    expect(latest.selectedMl).toBe(500);
    expect(customField(renderer).props.value).toBe('');
  });

  test('an amount that cannot be logged disables Log and says why', () => {
    const renderer = mount();
    typeCustom(renderer, '0');
    expect(latest.selectedMl).toBeNull();
    expect(quickLogButtonLabel(latest, false)).toBe('Enter a valid amount');
    expect(hasError(renderer)).toBe(true);

    typeCustom(renderer, '6000');
    expect(latest.selectedMl).toBeNull();

    // Digits only, four at most.
    typeCustom(renderer, '12a34567');
    expect(customField(renderer).props.value).toBe('1234');
    expect(latest.selectedMl).toBe(1234);
  });

  test('clearing the field goes back to the pre-selected amount', () => {
    const renderer = mount();
    const initial = latest.selectedMl;
    typeCustom(renderer, '420');
    typeCustom(renderer, '');
    expect(latest.selectedMl).toBe(initial);
    expect(checkedMl(renderer)).toHaveLength(1);
  });

  test('nothing changes once a write is in flight', () => {
    const renderer = mount({ busy: true, savingMl: 250 });
    const before = latest.selectedMl;
    press(amountButtons(renderer)[2]);
    typeCustom(renderer, '700');
    expect(latest.selectedMl).toBe(before);
    expect(changes).toBe(0);
    expect(amountButtons(renderer).every(button => button.props.disabled)).toBe(true);
    expect(customField(renderer).props.editable).toBe(false);
  });

  test('reset returns to a given amount, or the usual one', () => {
    const renderer = mount();
    typeCustom(renderer, '330');
    act(() => latest.reset(1000));
    expect(latest.selectedMl).toBe(1000);
    expect(customField(renderer).props.value).toBe('');
    act(() => latest.reset());
    expect(checkedMl(renderer)).toHaveLength(1);
  });

  test('the Log label reads "Logged" once the entry is written', () => {
    mount();
    expect(quickLogButtonLabel(latest, true)).toBe('Logged');
  });
});
