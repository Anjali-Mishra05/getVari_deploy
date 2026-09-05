// `import type` deliberately: this module is imported by a plain node test,
// and a value import would drag the hook's React Native dependency graph in
// with it.
import type { SensorOverride } from '../hooks/useHydrationTelemetry';

/**
 * The specification's worked examples, as data.
 *
 * Kept apart from the panel that renders them so the numbers can be checked by
 * a plain node test: `__tests__/riskSpecPresets.test.ts` solves each preset
 * against the profile it names and asserts the documented score. If the engine
 * and the document ever diverge, that test fails rather than an intern
 * discovering it on a phone and having no way to tell which side moved.
 *
 * The expected scores match the assertions in `algoSpecCompliance.test.ts`.
 */
export interface RiskSpecPreset {
  id: string;
  title: string;
  /** Score the document says this case produces. */
  expected: number;
  expectedStatus: string;
  /** The profile the documented score assumes. */
  needs: { weightKg: number; conditions: string[]; city: string };
  readings: Required<SensorOverride>;
}

export const RISK_SPEC_PRESETS: RiskSpecPreset[] = [
  {
    id: 'uc1',
    title: 'UC1 · Diabetic, 85 kg, Mumbai',
    expected: 64,
    expectedStatus: 'High Risk',
    needs: { weightKg: 85, conditions: ['diabetes'], city: 'Mumbai' },
    readings: { heartRate: 90, activityLoad: 60, temperature: 30, humidity: 65, gapHours: 1.5 },
  },
  {
    id: 'uc2',
    title: 'UC2 · Healthy, 70 kg, London',
    expected: 45,
    expectedStatus: 'Mild Risk',
    needs: { weightKg: 70, conditions: [], city: 'London' },
    readings: { heartRate: 90, activityLoad: 60, temperature: 18, humidity: 50, gapHours: 1.5 },
  },
  {
    id: 'uc3',
    title: 'UC3 · Renal, 65 kg, Bangalore',
    expected: 37,
    expectedStatus: 'Mild Risk',
    needs: { weightKg: 65, conditions: ['ckd'], city: 'Bangalore' },
    readings: { heartRate: 75, activityLoad: 15, temperature: 25, humidity: 45, gapHours: 2.5 },
  },
];

export default RISK_SPEC_PRESETS;
