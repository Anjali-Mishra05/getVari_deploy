/**
 * The admin panel's user details ("View Details" in the User Directory).
 *
 * Opening it for a user whose telemetry rows hold nulls — what the app stores
 * for any reading it did not get — threw during render, and with no error
 * boundary React unmounted the whole admin app, leaving the page's dark body:
 * the reported black screen.
 *
 *   npx jest --config jest.config.logic.js __tests__/adminUserDetails.test.ts
 */

jest.mock('react-native-css-interop', () => {
  const { createElement } = jest.requireActual('react');
  return { __esModule: true, createInteropElement: createElement };
});
// The components compile against nativewind's JSX runtime; plain React is all
// a render test needs.
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('lucide-react', () => new Proxy({}, { get: (_target, name) => (name === '__esModule' ? false : String(name)) }));

const mockGetHistory = jest.fn();
jest.mock('../src/services/TelemetryHistoryService', () => ({
  __esModule: true,
  default: { getHistory: (...args: unknown[]) => mockGetHistory(...args) },
}));
const mockCalculatePBWR = jest.fn();
jest.mock('../src/services/PBWRService', () => ({
  __esModule: true,
  default: { calculatePBWR: (...args: unknown[]) => mockCalculatePBWR(...args) },
}));
// The drawer renders into a portal and locks the page's scroll; neither has a
// DOM to act on here.
jest.mock('react-dom', () => ({ ...jest.requireActual('react-dom'), createPortal: (element: unknown) => element }));
jest.mock('../src/admin-web/utils/overlayManager', () => ({
  addOverlay: () => undefined,
  removeOverlay: () => undefined,
  forceClearLocks: () => undefined,
}));
jest.mock('../src/admin-web/services/AdminAlertService', () => ({ sendCriticalAlert: () => Promise.resolve() }));

import React from 'react';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';

import PBWRAdminSection from '../src/admin-web/components/users/PBWRAdminSection';
import AdminErrorBoundary from '../src/admin-web/components/shared/AdminErrorBoundary';
import UserDetailDrawer from '../src/admin-web/components/users/UserDetailDrawer';

(global as any).IS_REACT_ACT_ENVIRONMENT = true;
(global as any).document = {
  body: {},
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};

const breakdown = {
  isCalibrationPeriod: true,
  finalTarget: 3250,
  pbwrBaseline: 2800,
  activityAdj: 200,
  tempAdj: 150,
  humidityAdj: 0,
  workEnvAdj: 100,
  healthAdj: 0,
  adjustedTotal: 3250,
  upperLimit: 4500,
} as any;

const row = (date: string, values: Partial<Record<'avgTemp' | 'avgHumidity' | 'totalSteps', number | null>>) => ({
  date,
  avgTemp: 31.2,
  avgHumidity: 60,
  totalSteps: 5400,
  avgHeartRate: 72,
  ...values,
});

const render = async (element: React.ReactElement): Promise<ReactTestRenderer> => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
};

/** Every string rendered, joined — enough to assert what the admin reads. */
const text = (renderer: ReactTestRenderer): string => {
  const out: string[] = [];
  const walk = (node: any) => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') return void out.push(node);
    if (Array.isArray(node)) return node.forEach(walk);
    walk(node.children);
  };
  walk(renderer.toJSON());
  return out.join(' ');
};

let consoleError: jest.SpyInstance;
beforeEach(() => {
  mockGetHistory.mockReset();
  mockCalculatePBWR.mockReset();
  // React reports a caught render error on the console; the tests assert on
  // what is rendered instead.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => consoleError.mockRestore());

describe('PBWR section of the user details', () => {
  test('renders days whose readings are missing instead of throwing', async () => {
    mockGetHistory.mockResolvedValue([
      row('2026-10-11', { totalSteps: null }),
      row('2026-10-12', { avgTemp: null, avgHumidity: null }),
      row('2026-10-13', {}),
    ]);
    const renderer = await render(
      React.createElement(PBWRAdminSection, { userId: 'u1', fullProfile: {}, waterIntakeMl: 0, breakdown })
    );
    const shown = text(renderer);
    expect(shown).toContain('2026-10-11');
    expect(shown).toContain('2026-10-12');
    // Missing is shown as missing, not as 0.
    expect(shown).toContain('—');
    // Averages are over the days that have a value.
    expect(shown).toContain('5,400 / day');
    expect(shown).toContain('31.2 °C');
  });

  test('says when there is no history rather than printing NaN', async () => {
    mockGetHistory.mockResolvedValue([]);
    const renderer = await render(
      React.createElement(PBWRAdminSection, { userId: 'u1', fullProfile: {}, waterIntakeMl: 0, breakdown })
    );
    const shown = text(renderer);
    expect(shown).not.toContain('NaN');
    expect(shown).toContain('No telemetry snapshots');
  });

  test('shows an error when the history cannot be read', async () => {
    mockGetHistory.mockRejectedValue(new Error('permission denied'));
    const renderer = await render(
      React.createElement(PBWRAdminSection, { userId: 'u1', fullProfile: {}, waterIntakeMl: 0, breakdown })
    );
    expect(text(renderer)).toContain('Could not load');
  });

  test('explains a missing breakdown instead of vanishing', async () => {
    mockGetHistory.mockResolvedValue([row('2026-10-13', {})]);
    const renderer = await render(
      React.createElement(PBWRAdminSection, { userId: 'u1', fullProfile: {}, waterIntakeMl: 0, breakdown: null })
    );
    expect(text(renderer)).toContain('not available');
  });
});

describe('The admin error boundary', () => {
  const Throws: React.FC = () => {
    throw new Error('boom');
  };

  test('shows the fallback in place of a crashed child, with the reason', async () => {
    const renderer = await render(
      React.createElement(AdminErrorBoundary, { label: 'this user’s details', children: React.createElement(Throws) })
    );
    const shown = text(renderer);
    expect(shown).toContain('this user’s details');
    expect(shown).toContain('boom');
  });

  test('a retry renders the children again', async () => {
    let fail = true;
    const Flaky: React.FC = () => {
      if (fail) throw new Error('boom');
      return React.createElement('span', null, 'recovered');
    };
    const renderer = await render(
      React.createElement(AdminErrorBoundary, { label: 'section', children: React.createElement(Flaky) })
    );
    fail = false;
    const retry = renderer.root.find(node => (node.type as unknown) === 'button');
    await act(async () => retry.props.onClick());
    expect(text(renderer)).toContain('recovered');
  });
});

/** A user as `SupabaseAdminService` builds one, with everything filled in. */
const completeUser = (overrides: Record<string, unknown> = {}): any => ({
  id: 'user-1',
  name: 'Asha Rao',
  gender: 'Female',
  age: 29,
  weightKg: 58,
  phone: '+91 98765 43210',
  email: '',
  status: 'Mild Risk',
  riskScore: 42,
  riskMeaning: 'Slightly behind.',
  hoursSinceDrink: 1.5,
  riskHistory: [30, null, 42],
  waterIntakeMl: 750,
  targetDailyMl: 3250,
  waterHistory: [{ id: 'w1', time: '09:10', amount: 250, source: 'app', isCorrection: false }],
  clock: { offsetMinutes: 330, known: true },
  activityLabel: 'Moderate',
  sleepWindowLabel: '23:00 – 07:00',
  city: 'Pune',
  profileUpdatedAt: '2026-10-17T05:00:00.000Z',
  duplicateRowCount: 0,
  heartRate: 74,
  activityLoad: 35,
  temperature: 31,
  humidity: 62,
  batteryLevel: 84,
  rssi: -58,
  firmwareVersion: null,
  fullProfile: { medicalConditions: ['Asthma'] },
  ...overrides,
});

describe('User details drawer ("View Details")', () => {
  test('opens for a user with complete data, including telemetry days with missing readings', async () => {
    mockCalculatePBWR.mockResolvedValue(breakdown);
    mockGetHistory.mockResolvedValue([row('2026-10-12', { totalSteps: null, avgTemp: null }), row('2026-10-13', {})]);
    const renderer = await render(React.createElement(UserDetailDrawer, { user: completeUser(), onClose: () => undefined }));
    const shown = text(renderer);
    expect(shown).toContain('Asha Rao');
    expect(shown).toContain('Asthma');
    // The profile card, in its three groups, with every field still present.
    const groups = renderer.root.findAll(node => (node.type as unknown) === 'h4').map(node => node.props.children);
    expect(groups).toEqual(['Personal Details', 'Health & Lifestyle', 'Additional Details']);
    expect(shown).not.toContain('Demographic Profile');
    expect(shown).not.toContain('Alerts paused');
    for (const value of ['Female', '29 years', '+91 98765 43210', '58 kg', 'Moderate', '23:00 – 07:00', 'Pune']) {
      expect(shown).toContain(value);
    }
    expect(shown).toContain('2026-10-12');
    expect(shown).toContain('3.25 L');
    expect(shown).not.toContain('Could not display');
    // The "Today's entries" list is no longer shown; the intake card's total
    // and target still are.
    expect(shown).not.toMatch(/TODAY.S ENTRIES/);
    // The per-entry list stays removed ("09:10 +250 ml (app)")…
    expect(shown).not.toContain('(app)');
    // …and the intake card summarises the same entries instead.
    expect(shown).toContain('2500 ml'); // 3250 target − 750 logged
    expect(shown).toContain('09:10 · 250 ml');
    expect(shown).toContain('750');
    expect(renderer.root.findAll(node => node.props['aria-label'] === 'Ingested volume / daily target')).toHaveLength(1);
    // Intake against the target, with the completion the bar shows (750 / 3250 = 23%).
    expect(shown).toMatch(/750\s+ml\s+\/\s+3250 ml/);
    expect(shown).toContain('23% of daily goal');
    expect(shown).toContain('3.25 L target');
    const bar = renderer.root.find(node => node.props.role === 'progressbar');
    expect(bar.props['aria-valuenow']).toBe(23);
    // The Risk Index card: score, status and the one-line summary only.
    expect(shown).toContain('Risk Index');
    expect(shown).toContain('42');
    expect(shown).toContain('Mild Risk');
    expect(shown).toContain('Slightly behind.');
    // The trend chart: one bar per hour, a gap for an hour with no score.
    expect(shown).toMatch(/Last\s+3\s+hours/);
    expect(shown).not.toMatch(/recomputed|not recorded/i);
    const bars = renderer.root.findAll(node => typeof node.props.title === 'string' && /h ago:/.test(node.props.title));
    expect(bars.map(bar => bar.props.title)).toEqual(['2h ago: 30', '1h ago: no score', '0h ago: 42']);
    expect(shown).not.toContain('waking h since the last entry');
    expect(shown).not.toContain('recovery credit');
  });

  test('opens for a user whose profile is incomplete, without inventing values', async () => {
    mockGetHistory.mockResolvedValue([]);
    const user = completeUser({
      name: '',
      gender: '',
      age: NaN,
      weightKg: undefined,
      riskScore: null,
      hoursSinceDrink: NaN,
      riskHistory: undefined,
      waterHistory: undefined,
      targetDailyMl: null,
      clock: undefined,
      profileUpdatedAt: 'not a date',
      heartRate: undefined,
      batteryLevel: null,
      fullProfile: undefined,
    });
    const renderer = await render(React.createElement(UserDetailDrawer, { user, onClose: () => undefined }));
    const shown = text(renderer);
    expect(shown).toContain('Unnamed user');
    // No target: the intake still shows, without an invented goal or percentage.
    expect(shown).toContain('No daily target');
    expect(shown).toContain('None today');
    expect(shown).not.toMatch(/% of daily goal/);
    const age = renderer.root.find(node => (node.type as unknown) === 'dt' && node.props.children === 'Age');
    const ageValue = age.parent!.findAll(node => (node.type as unknown) === 'span')[0];
    expect(ageValue.props.children).toBe('Not set');
    expect(shown).toContain('--');
    expect(shown).toContain('not available');
    expect(shown).not.toContain('NaN');
    expect(shown).not.toContain('undefined');
    expect(shown).not.toContain('Invalid Date');
    // No profile, so no calculation is attempted.
    expect(mockCalculatePBWR).not.toHaveBeenCalled();
  });

  test('a PBWR calculation that throws costs only that section', async () => {
    mockCalculatePBWR.mockImplementation(() => {
      throw new Error('profile has no weight');
    });
    mockGetHistory.mockResolvedValue([]);
    const renderer = await render(React.createElement(UserDetailDrawer, { user: completeUser(), onClose: () => undefined }));
    const shown = text(renderer);
    expect(shown).toContain('could not be calculated');
    expect(shown).toContain('Asha Rao');
  });

  test('anything else that fails to render shows an error inside the open drawer, with Close', async () => {
    mockCalculatePBWR.mockResolvedValue(breakdown);
    mockGetHistory.mockResolvedValue([]);
    const user = completeUser();
    Object.defineProperty(user, 'status', {
      get: () => {
        throw new Error('corrupt row');
      },
    });
    const onClose = jest.fn();
    const renderer = await render(React.createElement(UserDetailDrawer, { user, onClose }));
    const shown = text(renderer);
    expect(shown).toMatch(/Could not display\s+this user’s details/);
    expect(shown).toContain('corrupt row');
    // Still inside the drawer, which can be closed.
    expect(renderer.root.findAll(node => node.props.role === 'dialog')).toHaveLength(1);
    const close = renderer.root.find(node => (node.type as unknown) === 'button' && node.props.children === 'Close');
    close.props.onClick();
    expect(onClose).toHaveBeenCalled();
  });
});
