import { HydrationRiskDetails } from '../types';

/**
 * When the freshly solved score is allowed to replace the one on screen.
 *
 * ## Why this is its own module
 *
 * The rule decides what the user actually reads, and every clause in it exists
 * because an earlier version got it wrong — so it needs tests. It cannot live
 * in `useHydrationTelemetry`, because that module reaches AuthService and
 * TelemetryHistoryService and so pulls a React Native native-module graph into
 * any suite that imports it. Same split as `appConfigStore`: by dependency,
 * not by feature.
 */

/**
 * How far the score must move before drift alone republishes it.
 *
 * The score is a weighted sum of band-mapped loads, so residual noise inside a
 * band moves it by a point or two. Anything under three points is not a
 * different recommendation.
 */
export const MIN_SCORE_DELTA = 3;

/** How often drift alone may move the published score. */
export const MIN_REPUBLISH_MS = 60 * 1000;

export interface PublishDecision {
  live: HydrationRiskDetails;
  published: HydrationRiskDetails;
  /** Milliseconds since the published score last changed. */
  sinceLastMs: number;
  /** Set by anything the user did themselves. Always wins. */
  forced: boolean;
}

const scored = (risk: HydrationRiskDetails) => risk.score !== null;

/**
 * - `forced` covers everything the user did themselves — logging a drink,
 *   editing their profile, pinning readings in the test panel. A change
 *   someone made is never withheld, whatever its size: withholding it reads as
 *   the app having ignored them.
 * - A band change is never withheld either. Escalation matters for safety;
 *   de-escalation matters because it is usually the user's own drink taking
 *   effect, and holding that back is what made the score feel disconnected
 *   from the recovery engine.
 * - Everything else is sensor drift, and is throttled on both size and time.
 */
export const shouldPublishRisk = ({
  live,
  published,
  sinceLastMs,
  forced,
}: PublishDecision): boolean => {
  if (forced) return true;
  if (live.status !== published.status) return true;
  // A score arriving or disappearing changes what the screen can say at all,
  // so it is published even when the status label happens to match.
  if (scored(live) !== scored(published)) return true;

  const movedEnough =
    scored(live) &&
    scored(published) &&
    Math.abs((live.score as number) - (published.score as number)) >= MIN_SCORE_DELTA;

  return movedEnough && sinceLastMs >= MIN_REPUBLISH_MS;
};

export default shouldPublishRisk;
