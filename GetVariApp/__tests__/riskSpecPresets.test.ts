import { HydrationRiskEngine } from '../src/utils/hydrationRiskEngine';
import { RISK_SPEC_PRESETS } from '../src/utils/riskSpecPresets';
import { UserProfile } from '../src/types';

/**
 * The sensor test panel offers the specification's worked examples as one-tap
 * presets, each labelled with the score the document says it produces. Those
 * labels are the only thing an intern has to check a reading against, so they
 * must not be allowed to rot: this solves every preset against the profile it
 * names and asserts the number printed on the button.
 *
 * A failure here means the panel is telling people to expect a score the
 * engine no longer produces — either the engine changed or the document did,
 * and whichever it was, the button is now lying.
 */

const profileFor = (preset: (typeof RISK_SPEC_PRESETS)[number]): UserProfile =>
  ({
    age: 35,
    gender: 'male',
    weightKg: preset.needs.weightKg,
    activityLevel: 'moderate',
    fitnessGoal: 'optimize_health',
    workEnvironment: 'office',
    waterHabit: 'moderate',
    targetDailyMl: 3000,
    medicalConditions: preset.needs.conditions,
    location: preset.needs.city,
    selectedCity: preset.needs.city,
  }) as unknown as UserProfile;

describe('sensor panel presets reproduce the documented scores', () => {
  for (const preset of RISK_SPEC_PRESETS) {
    it(`${preset.title} scores ${preset.expected} (${preset.expectedStatus})`, () => {
      const result = HydrationRiskEngine.solveRisk(
        {
          heartRate: preset.readings.heartRate,
          activityLoad: preset.readings.activityLoad,
          temperature: preset.readings.temperature,
          humidity: preset.readings.humidity,
          timeSinceWaterIntake: preset.readings.gapHours,
        },
        profileFor(preset)
      );

      expect(result.score).toBe(preset.expected);
      expect(result.status).toBe(preset.expectedStatus);
    });
  }

  it('every preset fills all five channels, so the panel can solve it', () => {
    for (const preset of RISK_SPEC_PRESETS) {
      for (const channel of ['heartRate', 'activityLoad', 'temperature', 'humidity', 'gapHours'] as const) {
        expect(typeof preset.readings[channel]).toBe('number');
      }
    }
  });
});
