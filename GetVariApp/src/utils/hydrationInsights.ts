import { AIInsight, HydrationRiskDetails, SensorData } from '../types';

/**
 * The on-device insight generator behind "GetVari Core AI Insights".
 *
 * The web dashboard asks the Express server, which asks Gemini and falls back
 * to rules when the key is missing or rate-limited. The app has no route to
 * that server, so it runs the fallback locally — same two insights, same
 * shape, no network. `source` stays `'rule_engine'` so the card labels it
 * "Adaptive rule" rather than claiming a model wrote it; a future backend call
 * only has to return `'gemini_brain'` for the badge to change.
 *
 * The same constraints the server prompt imposes apply here: no diagnostic
 * language, no medical certainty, everything framed as *estimated* risk.
 */

export interface InsightInputs {
  sensorData: SensorData;
  risk: HydrationRiskDetails;
  /** Hours since the last logged drink, after absorption credit. */
  hoursSinceDrink: number;
  totalMl: number;
  targetMl: number;
}

/** Why the risk is where it is, in one clause, from the dominant load. */
const dominantDriver = (risk: HydrationRiskDetails): string => {
  const drivers = [
    { text: 'elevated cardiovascular strain', weighted: risk.heartLoad * 0.3 },
    { text: 'sustained physical exertion', weighted: risk.activityLoad * 0.25 },
    { text: 'ambient thermal load', weighted: risk.temperatureLoad * 0.2 },
    { text: 'low sweat-evaporation potential', weighted: risk.humidityLoad * 0.1 },
    { text: 'a prolonged gap since your last intake', weighted: risk.timeLoad * 0.15 },
  ];
  return drivers.reduce((top, item) => (item.weighted > top.weighted ? item : top)).text;
};

/** Prescribed volume, rounded to something a bottle or glass can deliver. */
const prescribedMl = (inputs: InsightInputs): number => {
  const fromGoal = Math.max(0, inputs.targetMl - inputs.totalMl);
  const fromRisk = (inputs.risk.glassesRequired ?? 0) * 250;
  const suggested = Math.max(fromRisk, Math.min(650, fromGoal));
  return Math.max(250, Math.round(suggested / 50) * 50);
};

/**
 * Exactly two insights — the risk read, and what to do about it — matching the
 * pair the server prompt is constrained to produce.
 */
export const generateInsights = (inputs: InsightInputs): AIInsight[] => {
  const { sensorData, risk, hoursSinceDrink } = inputs;
  const timestamp = new Date().toISOString();
  const stamp = Date.now();

  const strainPhrase =
    sensorData.activityLoad >= 50 ? 'high physical strain' : 'low physical strain';
  const riskPhrase =
    risk.score <= 25
      ? 'hydration reserves are holding'
      : risk.score <= 50
      ? 'hydration reserves are beginning to draw down'
      : 'hydration reserves are running low';

  const driver = dominantDriver(risk);
  const riskInsight: AIInsight = {
    id: `insight_risk_${stamp}`,
    category: 'hydration',
    title: 'Hydration Risk Insight',
    text:
      `Sensor fusion analysis indicates ${riskPhrase} despite ${strainPhrase}. ` +
      `${driver[0].toUpperCase()}${driver.slice(1)} is the dominant contributor at an ` +
      `estimated ${risk.score}/100 risk.`,
    timestamp,
    source: 'rule_engine',
  };

  const amount = prescribedMl(inputs);
  const recoveryInsight: AIInsight = {
    id: `insight_recovery_${stamp}`,
    category: 'recovery',
    title: 'Recovery Recommendation',
    text:
      risk.score <= 25
        ? `Your routine is working — roughly ${amount}ml spread across the next few hours keeps this baseline steady.`
        : `Based on an estimated risk of ${risk.score} and ${hoursSinceDrink.toFixed(
            1
          )}h since your last sync, consuming ${amount}ml of water may help reduce hydration risk over the next recovery cycle.`,
    timestamp,
    source: 'rule_engine',
  };

  return [riskInsight, recoveryInsight];
};

export default generateInsights;
