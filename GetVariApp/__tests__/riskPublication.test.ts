import {
  MIN_REPUBLISH_MS,
  MIN_SCORE_DELTA,
  shouldPublishRisk,
} from '../src/utils/riskPublication';
import { HydrationRiskDetails } from '../src/types';

/**
 * "When user edits details and updates, the new hydration risk score should
 * update."
 *
 * Editing weight, medical conditions or the city changes the engine's weights
 * and multipliers, so the solve moves at once — but what the user reads is the
 * *published* score, and that was throttled to protect the dial from sensor
 * noise. An edit that shifted the score by a point or two therefore changed
 * nothing on screen, which reads as the edit not having saved.
 *
 * The throttle is right for drift and wrong for anything the user did. These
 * cover both halves of that.
 */

const risk = (score: number | null, status: string): HydrationRiskDetails =>
  ({ score, status }) as unknown as HydrationRiskDetails;

describe('a change the user made is never withheld', () => {
  it('publishes a forced update even when the score has not moved at all', () => {
    // The profile-edit case: same band, zero delta, published a moment ago.
    expect(
      shouldPublishRisk({
        live: risk(50, 'Mild Risk'),
        published: risk(50, 'Mild Risk'),
        sinceLastMs: 0,
        forced: true,
      })
    ).toBe(true);
  });

  it('publishes a forced update that moves less than the noise floor', () => {
    expect(
      shouldPublishRisk({
        live: risk(51, 'Mild Risk'),
        published: risk(50, 'Mild Risk'),
        sinceLastMs: 0,
        forced: true,
      })
    ).toBe(true);
  });
});

describe('drift is throttled on both size and time', () => {
  it('withholds a sub-threshold move', () => {
    expect(
      shouldPublishRisk({
        live: risk(50 + (MIN_SCORE_DELTA - 1), 'Mild Risk'),
        published: risk(50, 'Mild Risk'),
        sinceLastMs: MIN_REPUBLISH_MS * 10,
        forced: false,
      })
    ).toBe(false);
  });

  it('withholds a large move that arrives too soon after the last one', () => {
    expect(
      shouldPublishRisk({
        live: risk(60, 'Mild Risk'),
        published: risk(50, 'Mild Risk'),
        sinceLastMs: MIN_REPUBLISH_MS - 1,
        forced: false,
      })
    ).toBe(false);
  });

  it('publishes once it is both big enough and old enough', () => {
    expect(
      shouldPublishRisk({
        live: risk(50 + MIN_SCORE_DELTA, 'Mild Risk'),
        published: risk(50, 'Mild Risk'),
        sinceLastMs: MIN_REPUBLISH_MS,
        forced: false,
      })
    ).toBe(true);
  });
});

describe('a change of advice is never withheld', () => {
  it('publishes an escalation immediately', () => {
    expect(
      shouldPublishRisk({
        live: risk(51, 'High Risk'),
        published: risk(50, 'Mild Risk'),
        sinceLastMs: 0,
        forced: false,
      })
    ).toBe(true);
  });

  it('publishes a de-escalation immediately — usually the user’s own drink', () => {
    expect(
      shouldPublishRisk({
        live: risk(50, 'Mild Risk'),
        published: risk(51, 'High Risk'),
        sinceLastMs: 0,
        forced: false,
      })
    ).toBe(true);
  });

  it('publishes when the engine loses the ability to score', () => {
    expect(
      shouldPublishRisk({
        live: risk(null, 'Insufficient Data'),
        published: risk(50, 'Mild Risk'),
        sinceLastMs: 0,
        forced: false,
      })
    ).toBe(true);
  });

  it('publishes when a score returns after a gap in the data', () => {
    expect(
      shouldPublishRisk({
        live: risk(50, 'Mild Risk'),
        published: risk(null, 'Insufficient Data'),
        sinceLastMs: 0,
        forced: false,
      })
    ).toBe(true);
  });

  it('does not divide by a missing score when both sides are unscored', () => {
    // Both null and the same status: nothing to say, and nothing that throws.
    expect(
      shouldPublishRisk({
        live: risk(null, 'Insufficient Data'),
        published: risk(null, 'Insufficient Data'),
        sinceLastMs: MIN_REPUBLISH_MS * 10,
        forced: false,
      })
    ).toBe(false);
  });
});
