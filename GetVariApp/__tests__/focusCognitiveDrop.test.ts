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

jest.mock('../src/services/NotificationService', () => ({
  __esModule: true,
  default: {
    requestPermission: (...args: any[]) => mockRequestPermission.apply(null, args as []),
    displayNotification: (...args: any[]) => mockDisplayNotification.apply(null, args as []),
    scheduleHydrationReminders: () => Promise.resolve(),
    isSleeping: () => Promise.resolve(false),
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
    todayLogs: scenario.logs ?? [],
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

  test('one focus/cognitive check per evaluation, from whichever index is higher', async () => {
    const BRAIN = [
      'focus_slipping',
      'focus_lost',
      'focus_steady',
      'cognitive_decline',
      'cognitive_impairment',
      'cognitive_steady',
    ];
    const brainOf = (raised: string[]) => raised.filter(t => BRAIN.includes(t));

    // No motion reading: FDI cannot be computed, so the cognitive index speaks.
    for (const motion of [undefined, null]) {
      const out = await evaluateFocusIntake({
        at: new Date(2026, 0, 1, 9, 0),
        score: 50,
        sensor: { lastSignificantMotionMinutesAgo: motion },
      });
      expect(brainOf(out.raised)).toHaveLength(1);
      expect(brainOf(out.raised)[0]).toMatch(/^cognitive_/);
    }

    const withMotion = await evaluateFocusIntake({
      at: new Date(2026, 0, 1, 9, 0),
      score: 50,
      sensor: { lastSignificantMotionMinutesAgo: 30 },
    });
    expect(brainOf(withMotion.raised)).toHaveLength(1);
    expect(withMotion.delivered).toEqual(brainOf(withMotion.raised));

    // FDI = 0.6·80 + 0.4·80 = 80 beats the CDI here, so focus speaks.
    const lost = await evaluateFocusIntake({
      at: new Date(2026, 0, 1, 9, 0),
      score: 80,
      sensor: { lastSignificantMotionMinutesAgo: 91 },
    });
    expect(lost.raised).toContain('focus_lost');
    expect(lost.raised).toContain('high_risk');
    // One notification per evaluation: the high risk alert outranks it.
    expect(lost.delivered).toEqual(['high_risk']);

    const cognitiveDecline = await evaluateFocusIntake({
      at: new Date(2026, 0, 1, 14, 0),
      score: 50,
      sensor: { temperature: 30, humidity: 70 },
    });
    expect(cognitiveDecline.raised).toContain('cognitive_decline');
    expect(cognitiveDecline.delivered).toContain('cognitive_decline');

    const impairment = await evaluateFocusIntake({
      at: new Date(2026, 0, 1, 15, 0),
      score: 80,
      sensor: { temperature: 35, humidity: 80 },
    });
    expect(impairment.raised).toContain('cognitive_impairment');
    expect(impairment.delivered).toEqual(['high_risk']);

    // Both indices low: still one check, the "steady" read-out.
    const sharp = await evaluateFocusIntake({
      at: new Date(2026, 0, 1, 10, 30),
      score: 0,
      sensor: { lastSignificantMotionMinutesAgo: 5, temperature: 0, humidity: 0 },
    });
    expect(brainOf(sharp.raised)).toHaveLength(1);
    expect(brainOf(sharp.raised)[0]).toMatch(/_steady$/);
  });

  test('FDI full chain from MockTelemetryService', async () => {
    // Sedentary profile -> 45 mins motion gap -> TTL 45 -> FDI 0.6*15 + 0.4*45 = 9 + 18 = 27 (Focus Slipping)
    const mockData = MockTelemetryService.getMockPrimaryTelemetry('user1', 'sedentary');
    expect(mockData.lastSignificantMotionMinutesAgo).toBe(45);

    const slipping = await evaluateFocusIntake({
      at: new Date(2026, 0, 1, 10, 30),
      score: 15,
      sensor: { lastSignificantMotionMinutesAgo: mockData.lastSignificantMotionMinutesAgo },
    });
    expect(slipping.raised).toContain('focus_slipping');
    expect(slipping.delivered).toContain('focus_slipping');

    // Critical Risk profile -> 40 mins motion gap -> TTL 45 -> FDI 0.6*80 + 0.4*45 = 48 + 18 = 66 (Focus Lost)
    const mockDataCrit = MockTelemetryService.getMockPrimaryTelemetry('user2', 'critical_risk');
    expect(mockDataCrit.lastSignificantMotionMinutesAgo).toBe(40);

    const lost = await evaluateFocusIntake({
      at: new Date(2026, 0, 1, 10, 30),
      score: 80,
      sensor: { lastSignificantMotionMinutesAgo: mockDataCrit.lastSignificantMotionMinutesAgo },
    });
    expect(lost.raised).toContain('focus_lost');
  });

  test('CDI full chain with thermal and circadian load', async () => {
    // 14:00 -> Circadian 60
    // Temp 30, Humid 60 -> Thermal (30+60)/2 = 45
    // DL 50
    // CDI = 0.55*50 + 0.25*45 + 0.20*60 = 27.5 + 11.25 + 12 = 50.75 (Cognitive Decline Risk)
    const decline = await evaluateFocusIntake({
      at: new Date(2026, 0, 1, 14, 0),
      score: 50,
      sensor: { temperature: 30, humidity: 60 },
    });
    expect(decline.raised).toContain('cognitive_decline');
    expect(decline.delivered).toContain('cognitive_decline');

    // 04:00 -> Circadian 90
    // Temp 35, Humid 80 -> Thermal (35+80)/2 = 57.5
    // DL 80
    // CDI = 0.55*80 + 0.25*57.5 + 0.20*90 = 44 + 14.375 + 18 = 76.375 (Cognitive Impairment Risk)
    const impairment = await evaluateFocusIntake({
      at: new Date(2026, 0, 1, 4, 0),
      score: 80,
      sensor: { temperature: 35, humidity: 80 },
    });
    expect(impairment.raised).toContain('cognitive_impairment');
  });

  test('focus and cognitive alerts share one 3-hour cooldown', async () => {
    const now = new Date(2026, 0, 1, 10, 0).getTime();
    const MIN = 60 * 1000;

    // 1. focus_slipping only (DL=25 ensures FDI=25 while CDI=16.75 stays low)
    const first = await evaluateFocusIntake({
      at: new Date(now),
      score: 25,
      sensor: { lastSignificantMotionMinutesAgo: 30 },
      clearState: true,
    });
    expect(first.delivered).toEqual(['focus_slipping']);

    // 2. An hour later cognitive_decline is true, but the shared cooldown
    //    holds it: the user just heard about their focus.
    const second = await evaluateFocusIntake({
      at: new Date(now + 60 * MIN),
      score: 50,
      sensor: { lastSignificantMotionMinutesAgo: 30 },
      clearState: false,
    });
    expect(second.raised).not.toContain('cognitive_decline');
    expect(second.raised).not.toContain('focus_slipping');

    // 3. Past three hours, one of them may go out again.
    const third = await evaluateFocusIntake({
      at: new Date(now + 181 * MIN),
      score: 50,
      sensor: { lastSignificantMotionMinutesAgo: 30 },
      clearState: false,
    });
    expect(third.delivered).toHaveLength(1);
    expect(['focus_slipping', 'cognitive_decline']).toContain(third.delivered[0]);
  });

  test('one focus/cognitive check every 3 hours, whatever the risk', async () => {
    const start = new Date(2026, 0, 1, 8, 0).getTime();
    const HOUR = 60 * 60 * 1000;
    const brain = /^(focus|cognitive)_/;
    const deliveredAt: number[] = [];
    // Checked every 30 minutes from 08:00 to 20:00, risk moving about.
    for (let i = 0; i <= 24; i++) {
      const at = start + i * 30 * 60 * 1000;
      const out = await evaluateFocusIntake({
        at: new Date(at),
        score: [10, 35, 55][i % 3],
        sensor: { lastSignificantMotionMinutesAgo: 30 },
        clearState: i === 0,
      });
      if (out.delivered.some(t => brain.test(t))) deliveredAt.push(at);
    }
    // 08:00, 11:00, 14:00, 17:00, 20:00.
    expect(deliveredAt).toHaveLength(5);
    for (let i = 1; i < deliveredAt.length; i++) {
      expect(deliveredAt[i] - deliveredAt[i - 1]).toBe(3 * HOUR);
    }
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
    // One focus/cognitive check per evaluation — here the focus index is higher.
    expect(evaluation.raised).toContain('focus_lost');

    // BUT nothing should be delivered
    expect(evaluation.delivered).toHaveLength(0);

    // Cooldown state should NOT be updated for sleep-suppressed alerts
    const state = JSON.parse(mockStore.get('getvari_notification_engine_state') || '{}');
    expect(state.lastAlerts?.high_risk).toBeUndefined();
    expect(state.lastAlerts?.focus_lost).toBeUndefined();
  });
});
