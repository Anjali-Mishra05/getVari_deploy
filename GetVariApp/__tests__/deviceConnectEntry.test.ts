/**
 * The dashboard header's "+" (connect device) and the connection screen it opens —
 * the same one onboarding's last step shows.
 *
 *   npx jest --config jest.config.logic.js __tests__/deviceConnectEntry.test.ts
 */

jest.mock('react-native', () => {
  const { createElement } = jest.requireActual('react');
  const host = (name: string) => (props: any) => createElement(name, props, props.children);
  return {
    View: host('View'),
    Text: host('Text'),
    TouchableOpacity: host('TouchableOpacity'),
    ActivityIndicator: host('ActivityIndicator'),
    StyleSheet: { create: (styles: unknown) => styles },
    Alert: { alert: jest.fn() },
    Linking: { openSettings: jest.fn(), sendIntent: jest.fn() },
    NativeModules: {},
    Platform: { OS: 'android', Version: 34 },
  };
});
jest.mock('react-native-css-interop', () => {
  const { createElement } = jest.requireActual('react');
  return { __esModule: true, createInteropElement: createElement };
});
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_t, name) => (name === '__esModule' ? false : String(name)) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-ble-plx', () => ({ BleManager: jest.fn().mockImplementation(() => ({ stopDeviceScan: jest.fn() })) }));
jest.mock('react-native-permissions', () => ({ checkMultiple: jest.fn(), requestMultiple: jest.fn(), PERMISSIONS: { ANDROID: {} }, RESULTS: {} }));
jest.mock('../src/utils/runtimePermissions', () => ({ ensureRuntimePermissions: jest.fn() }));
jest.mock('../src/theme/theme', () => ({ themed: (c: string) => c, tone: (dark: unknown) => dark, useThemeMode: () => 'dark' }));

import fs from 'fs';
import path from 'path';
import React from 'react';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';

import DashboardNav from '../src/components/dashboard/DashboardNav';
import { DeviceConnectPanel, DeviceConnection } from '../src/components/DeviceConnect';

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

const render = (element: React.ReactElement): ReactTestRenderer => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
};
const pressables = (renderer: ReactTestRenderer) =>
  renderer.root.findAll(node => (node.type as unknown) === 'TouchableOpacity');
const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

describe('The dashboard header', () => {
  const home = read('src/screens/HomeScreen.tsx');

  test('has the + (connect device) button immediately after Log water', () => {
    // The header's right-hand group: notifications, log, then connect device.
    const group = home.slice(home.indexOf('testID="header-log"'));
    const nextControl = group.slice(group.indexOf('<TouchableOpacity'));
    expect(nextControl.slice(0, nextControl.indexOf('</TouchableOpacity>'))).toContain('testID="header-connect-device"');
    expect(home.indexOf('testID="header-log"')).toBeLessThan(home.indexOf('testID="header-connect-device"'));
  });

  test('the + shows a plus icon and opens the connection sheet', () => {
    const button = home.slice(home.indexOf('testID="header-connect-device"') - 400, home.indexOf('testID="header-connect-device"') + 120);
    expect(button).toContain('onPress={() => setDeviceConnectOpen(true)}');
    expect(button).toContain('accessibilityLabel="Connect a device"');
    expect(button).toContain('<Plus ');
    expect(home).toContain('<DeviceConnectSheet visible={deviceConnectOpen} onClose={closeDeviceConnect} />');
  });
});

describe('The bottom nav is unchanged', () => {
  test('keeps its four items, with no connect-device entry', () => {
    const renderer = render(
      React.createElement(DashboardNav, {
        active: 'dashboard',
        onSelect: jest.fn(),
        onLogWater: jest.fn(),
        onOpenProfile: jest.fn(),
        profileInitial: 'A',
      })
    );
    expect(pressables(renderer).map(item => item.props.accessibilityLabel)).toEqual([
      'Dashboard',
      'Log water',
      'Analytics',
      'Profile and account settings',
    ]);
  });
});

describe('The shared connection screen', () => {
  const connection = (overrides: Partial<DeviceConnection> = {}): DeviceConnection => ({
    bleState: 'idle',
    devices: [],
    connectedDevice: null,
    scan: jest.fn(() => Promise.resolve()),
    connect: jest.fn(() => Promise.resolve()),
    stopScan: jest.fn(),
    ...overrides,
  });
  const texts = (renderer: ReactTestRenderer): string[] =>
    renderer.root
      .findAll(node => (node.type as unknown) === 'Text')
      .map(node => [].concat(node.props.children).filter(c => typeof c === 'string').join(''));

  test('Scan BLE starts a scan', () => {
    const c = connection();
    const renderer = render(React.createElement(DeviceConnectPanel, { connection: c }));
    expect(texts(renderer)).toContain('Scan BLE');
    expect(texts(renderer)).toContain('Sensor Synaptic Connect');
    act(() => {
      void pressables(renderer)[0].props.onPress();
    });
    expect(c.scan).toHaveBeenCalledTimes(1);
  });

  test('a found device connects when tapped', () => {
    const device: any = { id: 'AA:BB', name: 'GetVari Node', rssi: -60 };
    const c = connection({ bleState: 'devicesFound', devices: [device] });
    const renderer = render(React.createElement(DeviceConnectPanel, { connection: c }));
    const row = pressables(renderer).find(item => item.findAll(n => (n.props.children as unknown) === 'GetVari Node').length > 0)!;
    act(() => {
      void row.props.onPress();
    });
    expect(c.connect).toHaveBeenCalledWith(device);
  });

  test('a connected device is shown as connected, and the scan button is disabled', () => {
    const c = connection({ bleState: 'connected', connectedDevice: { id: 'AA:BB', name: 'GetVari Node' } as any });
    const renderer = render(React.createElement(DeviceConnectPanel, { connection: c, showHeading: false }));
    expect(texts(renderer)).toContain('Connected');
    expect(texts(renderer)).not.toContain('Sensor Synaptic Connect');
    expect(pressables(renderer)[0].props.disabled).toBe(true);
  });
});

describe('First-time setup is unchanged', () => {
  const onboarding = read('src/screens/OnboardingScreen.tsx');

  test('still has seven steps, the last one the same connection screen', () => {
    expect(onboarding).toContain('const totalSteps = 7;');
    expect(onboarding).toMatch(/\{step === 7 && \([\s\S]*?<DeviceConnectPanel connection=\{deviceConnection\} \/>/);
    expect(onboarding).toContain("label={step === totalSteps ? 'Finalize connection' : 'Next'}");
  });

  test('still saves the device paired during setup', () => {
    expect(onboarding).toContain('connectedDeviceId: connectedDevice?.id || null,');
  });
});
