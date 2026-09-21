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
  /** The daily goal, or null while the profile is still loading. */
  targetMl: number | null;
}

/** Why the risk is where it is, in one clause, from the dominant load. */
const dominantDriver = (risk: HydrationRiskDetails): string => {
  // A missing load weighs nothing. Left un-coerced, an undefined load produced
  // NaN, and `NaN > x` is always false — so that channel could never win, and
  // the insight silently misattributed the cause.
  const weigh = (value: number | null | undefined, weight: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value * weight : 0;

  const drivers = [
    { text: 'elevated cardiovascular strain', weighted: weigh(risk.heartLoad, 0.3) },
    { text: 'sustained physical exertion', weighted: weigh(risk.activityLoad, 0.25) },
    { text: 'ambient thermal load', weighted: weigh(risk.temperatureLoad, 0.2) },
    { text: 'low sweat-evaporation potential', weighted: weigh(risk.humidityLoad, 0.1) },
    { text: 'a prolonged gap since your last intake', weighted: weigh(risk.timeLoad, 0.15) },
  ];
  return drivers.reduce((top, item) => (item.weighted > top.weighted ? item : top)).text;
};

/** Prescribed volume, rounded to something a bottle or glass can deliver. */
const prescribedMl = (inputs: InsightInputs): number => {
  // A goal that has not loaded contributes nothing, rather than a negative
  // deficit that would drag the suggestion down to its floor.
  const fromGoal =
    inputs.targetMl === null ? 0 : Math.max(0, inputs.targetMl - inputs.totalMl);
  const fromRisk = (inputs.risk.glassesRequired ?? 0) * 250;
  const suggested = Math.max(fromRisk, Math.min(650, fromGoal));
  return Math.max(250, Math.round(suggested / 50) * 50);
};

const isNum = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

type Draft = Omit<AIInsight, 'id' | 'timestamp' | 'source'> & { key: string };

/**
 * Every insight the current readings can support, most important first.
 *
 * Each entry only appears when the data behind it exists, so a missing sensor
 * never produces a sentence about a zero. The two general tips at the end are
 * always available, which keeps the pool at four or more so a refresh always
 * has something new to show.
 */
const buildPool = (inputs: InsightInputs): Draft[] => {
  const { sensorData, risk, hoursSinceDrink, totalMl, targetMl } = inputs;
  const pool: Draft[] = [];
  const score = isNum(risk.score) ? risk.score : null;

  if (score !== null) {
    const strainPhrase =
      (sensorData.activityLoad ?? 0) >= 50 ? 'high physical strain' : 'low physical strain';
    const riskPhrase =
      score <= 25
        ? 'hydration reserves are holding'
        : score <= 50
        ? 'hydration reserves are beginning to draw down'
        : 'hydration reserves are running low';
    const driver = dominantDriver(risk);
    pool.push({
      key: 'risk',
      category: 'hydration',
      title: 'Hydration Risk Insight',
      text:
        `Sensor fusion analysis indicates ${riskPhrase} despite ${strainPhrase}. ` +
        `${driver[0].toUpperCase()}${driver.slice(1)} is the dominant contributor at an ` +
        `estimated ${score}/100 risk.`,
    });

    const amount = prescribedMl(inputs);
    pool.push({
      key: 'recovery',
      category: 'recovery',
      title: 'Recovery Recommendation',
      text:
        score <= 25
          ? `Your routine is working — roughly ${amount}ml spread across the next few hours keeps this baseline steady.`
          : `Based on an estimated risk of ${score} and ${hoursSinceDrink.toFixed(
              1
            )}h since your last sync, consuming ${amount}ml of water may help reduce hydration risk over the next recovery cycle.`,
    });
  }

  if (isNum(targetMl) && targetMl > 0) {
    const pct = Math.round((totalMl / targetMl) * 100);
    const left = Math.max(0, Math.round((targetMl - totalMl) / 50) * 50);
    pool.push({
      key: 'progress',
      category: 'hydration',
      title: 'Daily Progress',
      text:
        left === 0
          ? `You have reached today's goal of ${targetMl}ml. Small sips from here keep you topped up without overdoing it.`
          : `You have logged ${totalMl}ml of ${targetMl}ml (${pct}%). About ${left}ml to go — spreading it over the rest of the day may be easier than catching up late.`,
    });
  }

  if (isNum(hoursSinceDrink)) {
    pool.push({
      key: 'gap',
      category: 'hydration',
      title: 'Intake Timing',
      text:
        hoursSinceDrink >= 2
          ? `It has been about ${hoursSinceDrink.toFixed(1)}h since your last drink. A glass now may keep the gap from building into higher risk.`
          : `Your last drink was recent (${hoursSinceDrink.toFixed(1)}h ago). Keeping to a similar rhythm may help your level stay steady.`,
    });
  }

  if (isNum(sensorData.temperature)) {
    const t = Math.round(sensorData.temperature);
    pool.push({
      key: 'temperature',
      category: 'temperature',
      title: 'Heat Load',
      text:
        t >= 32
          ? `At ${t}°C your body may lose more fluid through sweat than you notice. Extra sips and some shade could help.`
          : `At ${t}°C, heat is adding little to your fluid needs right now.`,
    });
  }

  if (isNum(sensorData.humidity)) {
    const h = Math.round(sensorData.humidity);
    pool.push({
      key: 'humidity',
      category: 'temperature',
      title: 'Humidity Effect',
      text:
        h >= 70
          ? `Humidity is ${h}%, so sweat evaporates slowly and cooling is less efficient. You may need more water than usual.`
          : h <= 30
          ? `The air is dry (${h}% humidity), which can draw moisture out through breathing and skin. Regular sips may help.`
          : `Humidity is a comfortable ${h}%, having little effect on your fluid needs.`,
    });
  }

  if (isNum(sensorData.activityLoad) || isNum(sensorData.steps)) {
    const load = sensorData.activityLoad ?? 0;
    const steps = isNum(sensorData.steps) ? ` (${sensorData.steps} steps)` : '';
    pool.push({
      key: 'activity',
      category: 'activity',
      title: 'Activity Read',
      text:
        load >= 50
          ? `Your activity is high${steps}. Replacing fluid as you go may work better than drinking a lot afterwards.`
          : `Your activity is light${steps}, so your fluid needs are close to your baseline.`,
    });
  }

  if (isNum(sensorData.lastSignificantMotionMinutesAgo) && sensorData.lastSignificantMotionMinutesAgo >= 60) {
    const mins = Math.round(sensorData.lastSignificantMotionMinutesAgo);
    pool.push({
      key: 'stillness',
      category: 'activity',
      title: 'Movement Break',
      text: `You have been mostly still for about ${mins} minutes. A short walk and a glass of water may help your focus.`,
    });
  }

  if (isNum(sensorData.heartRate)) {
    const hr = Math.round(sensorData.heartRate);
    pool.push({
      key: 'heart',
      category: 'recovery',
      title: 'Heart Rate Signal',
      text:
        hr >= 100
          ? `Your heart rate is ${hr} bpm. Low fluid levels can raise it, so water and a short rest may help it settle.`
          : `Your heart rate is ${hr} bpm, within a relaxed range.`,
    });
  }

  pool.push(
    {
      key: 'tip_pacing',
      category: 'recovery',
      title: 'Absorption Tip',
      text: 'Sipping 150–250ml every 30–45 minutes is usually absorbed better than drinking a large amount at once.',
    },
    {
      key: 'tip_meals',
      category: 'hydration',
      title: 'Habit Tip',
      text: 'Pairing a glass of water with each meal and break is an easy way to stay on track without thinking about it.',
    }
  );

  return pool;
};

/**
 * Two insights from the pool.
 *
 * `variant` 0 is the risk read and what to do about it — the pair the server
 * prompt is constrained to produce. Each higher variant (one per tap of
 * "Refresh Core") moves to the next two in the pool, wrapping around, so a
 * refresh always shows something different.
 */
export const generateInsights = (inputs: InsightInputs, variant = 0): AIInsight[] => {
  const pool = buildPool(inputs);
  const timestamp = new Date().toISOString();
  const stamp = Date.now();
  const n = pool.length;
  const start = ((variant * 2) % n + n) % n;
  const picks = [pool[start], pool[(start + 1) % n]];

  return picks.map(({ key, ...draft }) => ({
    ...draft,
    id: `insight_${key}_${stamp}`,
    timestamp,
    source: 'rule_engine' as const,
  }));
};

export default generateInsights;
