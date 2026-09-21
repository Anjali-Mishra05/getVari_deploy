/**
 * "Refresh Core" on the insights card: each tap must show different insights.
 */
import { generateInsights, InsightInputs } from '../src/utils/hydrationInsights';

const inputs = (overrides: Partial<InsightInputs> = {}): InsightInputs => ({
  sensorData: {
    heartRate: 88,
    steps: 3200,
    activityLoad: 30,
    temperature: 34,
    humidity: 75,
    sweatGSR: null,
    hydrationScore: 60,
    batteryLevel: 80,
    rssi: -60,
    lastUpdated: new Date().toISOString(),
    lastSignificantMotionMinutesAgo: 70,
  },
  risk: {
    score: 55,
    status: 'High Risk',
    color: '',
    bgColor: '',
    textGlow: '',
    meaning: '',
    suggestedAction: '',
    glassesRequired: 2,
    heartLoad: 40,
    activityLoad: 30,
    temperatureLoad: 70,
    humidityLoad: 60,
    timeLoad: 50,
  },
  hoursSinceDrink: 2.5,
  totalMl: 900,
  targetMl: 2800,
  ...overrides,
});

const titles = (variant: number, i = inputs()) => generateInsights(i, variant).map(x => x.title);

describe('Core AI Insights refresh', () => {
  test('the first view is the risk read and the recommendation', () => {
    expect(titles(0)).toEqual(['Hydration Risk Insight', 'Recovery Recommendation']);
  });

  test('each refresh shows a different pair', () => {
    const seen = [0, 1, 2, 3].map(v => titles(v).join('|'));
    expect(new Set(seen).size).toBe(4);
    for (let v = 0; v < 8; v++) {
      const [a, b] = titles(v);
      expect(a).not.toBe(b);
    }
  });

  test('still rotates when most sensors are missing', () => {
    const sparse = inputs({
      sensorData: {
        ...inputs().sensorData,
        heartRate: null,
        steps: null,
        activityLoad: null,
        temperature: null,
        humidity: null,
        lastSignificantMotionMinutesAgo: null,
      },
      risk: { ...inputs().risk, score: null },
      targetMl: null,
    });
    expect(titles(0, sparse).join('|')).not.toBe(titles(1, sparse).join('|'));
  });

  test('no insight claims certainty', () => {
    for (let v = 0; v < 8; v++) {
      for (const { text } of generateInsights(inputs(), v)) {
        expect(text).not.toMatch(/\b(will|definitely|guaranteed?)\b/i);
      }
    }
  });
});
