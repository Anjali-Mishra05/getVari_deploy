const mockStore = new Map<string, string>();

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 31 },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => Promise.resolve(mockStore.has(k) ? mockStore.get(k)! : null),
    setItem: (k: string, v: string) => {
      mockStore.set(k, v);
      return Promise.resolve();
    },
    removeItem: (k: string) => {
      mockStore.delete(k);
      return Promise.resolve();
    },
    clear: () => {
      mockStore.clear();
      return Promise.resolve();
    },
  },
}));

const mockDisplayNotification = jest.fn((..._args: any[]) => Promise.resolve());
const mockRequestPermission = jest.fn((..._args: any[]) => Promise.resolve(true));

const mockMsSinceLastNotification = jest.fn(() => Promise.resolve(Infinity));

jest.mock('../src/services/NotificationService', () => ({
  __esModule: true,
  SIMULATED_SCHEDULE_SLOTS: [
    { hour: 9, minute: 0, trigger: 'regular_reminder', type: 'hydration_reminder' },
    { hour: 11, minute: 0, trigger: 'elevated_risk', type: 'simulated_alert' },
    { hour: 11, minute: 30, trigger: 'risk_improved', type: 'simulated_alert' },
    { hour: 12, minute: 30, trigger: 'focus_alert', type: 'simulated_alert' },
    { hour: 14, minute: 30, trigger: 'priority_alert', type: 'simulated_alert' },
    { hour: 16, minute: 0, trigger: 'focus_alert', type: 'simulated_alert' },
    { hour: 17, minute: 0, trigger: 'regular_reminder', type: 'hydration_reminder' },
    { hour: 18, minute: 30, trigger: 'priority_alert', type: 'simulated_alert' },
    { hour: 20, minute: 0, trigger: 'elevated_risk', type: 'simulated_alert' },
    { hour: 20, minute: 30, trigger: 'risk_improved', type: 'simulated_alert' },
    { hour: 22, minute: 30, trigger: 'regular_reminder', type: 'hydration_reminder' },
  ],
  default: {
    requestPermission: (...args: any[]) => mockRequestPermission.apply(null, args as []),
    displayNotification: (...args: any[]) => mockDisplayNotification.apply(null, args as []),
    scheduleHydrationReminders: () => Promise.resolve(),
    scheduleSimulatedNotifications: () => Promise.resolve(),
    isSleeping: () => Promise.resolve(false),
    msSinceLastNotification: (...args: any[]) => mockMsSinceLastNotification.apply(null, args as []),
    noteNotificationShown: () => Promise.resolve(),
    noteIntakeLogged: () => Promise.resolve(),
  },
}));

const mockGetHistory = jest.fn(() => Promise.resolve([] as any[]));

jest.mock('../src/services/TelemetryHistoryService', () => ({
  __esModule: true,
  default: {
    getHistory: (...args: any[]) => mockGetHistory.apply(null, args as []),
    isFresh: () => true,
  },
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {},
  AndroidImportance: { HIGH: 4 },
}));

jest.mock('@react-native-firebase/messaging', () => ({}));

import NotificationEngine from '../src/services/NotificationEngine';
import MockTelemetryService from '../src/services/MockTelemetryService';
import { SIMULATED_SCHEDULE_SLOTS } from '../src/services/NotificationService';
import type { SensorData, UserProfile, HydrationLog, HydrationRiskDetails } from '../src/types';
import {
  calculateTTLLoad,
  calculateFDI,
  classifyFDI,
  calculateCircadianLoad,
  calculateCDI,
  classifyCDI,
} from '../src/utils/focusCognitiveDrop';

const baseProfile = (over: Partial<UserProfile> = {}): UserProfile => ({
  age: 30,
  gender: 'female',
  weightKg: 62,
  activityLevel: 'moderate',
  fitnessGoal: 'maintain',
  workEnvironment: 'indoor',
  waterHabit: 'average',
  targetDailyMl: 2500,
  sleepSchedule: { sleepStart: '23:00', wakeUp: '07:00' },
  ...over,
});

const baseSensor = (over: Partial<SensorData> = {}): SensorData => ({
  heartRate: null,
  steps: null,
  activityLoad: null,
  temperature: null,
  humidity: null,
  sweatGSR: null,
  hydrationScore: 80,
  batteryLevel: null,
  rssi: -50,
  lastUpdated: new Date().toISOString(),
  ...over,
});

const risk = (score: number | null): HydrationRiskDetails => ({
  score,
  status: 'Mild Risk',
  color: '',
  bgColor: '',
  textGlow: '',
  meaning: '',
  suggestedAction: '',
  heartLoad: null,
  activityLoad: null,
  temperatureLoad: null,
  humidityLoad: null,
  timeLoad: null,
} as HydrationRiskDetails);

const evaluateFocusIntake = async (scenario: {
  at: Date;
  sensor?: Partial<SensorData>;
  score?: number | null;
  logs?: HydrationLog[];
  profile?: UserProfile;
  clearState?: boolean;
}) => {
  jest.setSystemTime(scenario.at);
  if (scenario.clearState !== false) {
    mockStore.clear();
  }
  mockDisplayNotification.mockClear();
  return NotificationEngine.evaluate({
    sensorData: baseSensor(scenario.sensor),
    profile: scenario.profile ?? baseProfile(),
    todayLogs: scenario.logs ?? [{
      id: 'focus-test-log',
      timestamp: new Date(scenario.at.getTime() - 60 * 60 * 1000).toISOString(),
      reportedAt: new Date(scenario.at.getTime() - 60 * 60 * 1000).toISOString(),
      amountMl: 2000,
      source: 'manual',
    }],
    solvedRisk: risk(scenario.score === undefined ? null : scenario.score),
  });
};

describe('Focus / Cognitive Drop Engine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockStore.clear();
    mockDisplayNotification.mockClear();
    mockRequestPermission.mockClear().mockResolvedValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });
  test.each([
    [15, 10],
    [16, 25],
    [30, 25],
    [31, 45],
    [45, 45],
    [46, 60],
    [60, 60],
    [61, 80],
    [90, 80],
    [91, 95],
  ])('TTL bucket boundary %d minutes => %d', (minutes, expected) => {
    expect(calculateTTLLoad(minutes)).toBe(expected);
  });

  test.each([
    [new Date(2026, 0, 1, 6, 59), 90],
    [new Date(2026, 0, 1, 7, 0), 65],
    [new Date(2026, 0, 1, 9, 59), 65],
    [new Date(2026, 0, 1, 10, 0), 15],
    [new Date(2026, 0, 1, 13, 59), 15],
    [new Date(2026, 0, 1, 14, 0), 60],
    [new Date(2026, 0, 1, 15, 59), 60],
    [new Date(2026, 0, 1, 16, 0), 20],
    [new Date(2026, 0, 1, 21, 59), 20],
    [new Date(2026, 0, 1, 22, 0), 85],
    [new Date(2026, 0, 1, 3, 59), 85],
    [new Date(2026, 0, 1, 4, 0), 90],
  ])('CL boundary %s => %d', (date, expected) => {
    expect(calculateCircadianLoad(date)).toBe(expected);
  });

  test('FDI formula and classifications are correct', () => {
    expect(calculateFDI(0, 15)).toBe(4);
    expect(classifyFDI(calculateFDI(0, 15))).toBe('Focused');

    expect(Number.isNaN(calculateTTLLoad(undefined))).toBe(true);
    expect(Number.isNaN(calculateFDI(50, undefined))).toBe(true);
    expect(Number.isNaN(calculateFDI(50, null))).toBe(true);

    const slipping = calculateFDI(50, 15);
    expect(slipping).toBe(34);
    expect(classifyFDI(slipping)).toBe('Focus Slipping');

    const lost = calculateFDI(80, 91);
    expect(lost).toBe(86);
    expect(classifyFDI(lost)).toBe('Focus Lost');

    // Exact boundaries
    // 0.6*25 + 0.4*25 = 15 + 10 = 25.00
    const edgeSlipping = calculateFDI(25, 30); // TTL for 30 is 25
    expect(edgeSlipping).toBe(25);
    expect(classifyFDI(edgeSlipping)).toBe('Focus Slipping');

    // 0.6*60 + 0.4*60 = 36 + 24 = 60.00
    const edgeLost = calculateFDI(60, 60); // TTL for 60 is 60
    expect(edgeLost).toBe(60);
    expect(classifyFDI(edgeLost)).toBe('Focus Lost');
  });

  test('CDI formula and classifications are correct', () => {
    const sharp = calculateCDI(0, 0, 0, new Date(2026, 0, 1, 10, 30));
    expect(sharp).toBe(3);
    expect(classifyCDI(sharp)).toBe('Cognitively Sharp');

    const decline = calculateCDI(50, 60, 70, new Date(2026, 0, 1, 14, 0));
    expect(decline).toBe(55.75);
    expect(classifyCDI(decline)).toBe('Cognitive Decline Risk');

    const impairment = calculateCDI(80, 90, 90, new Date(2026, 0, 1, 15, 0));
    expect(impairment).toBe(78.5);
    expect(classifyCDI(impairment)).toBe('Cognitive Impairment Risk');

    // Exact boundaries
    // DL=20, Thermal=40, Circadian=20 (16:00-22:00)
    // 0.55*20 + 0.25*40 + 0.20*20 = 11 + 10 + 4 = 25.00
    const edgeDecline = calculateCDI(20, 26, 54, new Date(2026, 0, 1, 17, 0)); // Thermal (26+54)/2 = 40
    expect(edgeDecline).toBe(25);
    expect(classifyCDI(edgeDecline)).toBe('Cognitive Decline Risk');

    // DL=60, Thermal=60, Circadian=60 (14:00-16:00)
    // 0.55*60 + 0.25*60 + 0.20*60 = 33 + 15 + 12 = 60.00
    const edgeImpairment = calculateCDI(60, 50, 70, new Date(2026, 0, 1, 15, 0)); // Thermal (50+70)/2 = 60
    expect(edgeImpairment).toBe(60);
    expect(classifyCDI(edgeImpairment)).toBe('Cognitive Impairment Risk');
  });

  test('FDI and CDI are scheduled simulation slots in SIMULATED_SCHEDULE_SLOTS', async () => {
    const focusSlots = SIMULATED_SCHEDULE_SLOTS.filter(s => s.trigger === 'focus_alert');
    const prioritySlots = SIMULATED_SCHEDULE_SLOTS.filter(s => s.trigger === 'priority_alert');

    expect(focusSlots).toHaveLength(2); // 12:30 PM and 4:00 PM
    expect(prioritySlots).toHaveLength(2); // 2:30 PM and 6:30 PM

    expect(focusSlots.map(s => `${s.hour}:${s.minute}`)).toEqual(['12:30', '16:0']);
    expect(prioritySlots.map(s => `${s.hour}:${s.minute}`)).toEqual(['14:30', '18:30']);
  });

  test('CDI/FDI simulation slots are not dynamically re-raised by evaluate()', async () => {
    const fdi = await evaluateFocusIntake({
      at: new Date(2026, 0, 1, 12, 30),
      score: 75,
      sensor: { lastSignificantMotionMinutesAgo: 91 },
    });
    expect(fdi.raised).not.toContain('focus_alert');

    const cdi = await evaluateFocusIntake({
      at: new Date(2026, 0, 1, 14, 30),
      score: 75,
      sensor: { temperature: 45, humidity: 100 },
    });
    expect(cdi.raised).not.toContain('priority_alert');
  });

  test('CDI/FDI and High Risk are absolutely suppressed during sleep', async () => {
    const profile = baseProfile({
      sleepSchedule: { sleepStart: '23:00', wakeUp: '07:00' }
    });
    const sleepTime = new Date(2026, 0, 1, 1, 0); // 1 AM

    const evaluation = await evaluateFocusIntake({
      at: sleepTime,
      score: 90,
      sensor: {
        lastSignificantMotionMinutesAgo: 91,
        temperature: 35,
        humidity: 80
      },
      profile,
    });

    // All should be raised for diagnostics/tests
    expect(evaluation.raised).toContain('high_risk');
    expect(evaluation.raised).not.toContain('focus_alert');

    // BUT nothing should be delivered
    expect(evaluation.delivered).toHaveLength(0);

    // Cooldown state should NOT be updated for sleep-suppressed alerts
    const state = JSON.parse(mockStore.get('getvari_notification_engine_state') || '{}');
    expect(state.lastAlerts?.high_risk).toBeUndefined();
    expect(state.lastAlerts?.focus_lost).toBeUndefined();
  });
});
