/**
 * Short hydration tips for the chat.
 *
 * Exactly one tip closes every assistant message, so the rotation matters:
 * tips are drawn from a shuffled bag rather than picked at random, meaning the
 * user sees every tip once before any repeats, and the first tip of a new bag
 * is never the one that just came out of the old one.
 */

interface TipSeed {
  emoji: string;
  text: string;
}

const TIP_SEEDS: TipSeed[] = [
  { emoji: '💧', text: 'Keep sipping regularly instead of waiting until you feel thirsty.' },
  { emoji: '🌊', text: 'A few sips now beat trying to catch up tonight.' },
  { emoji: '🥤', text: 'Keep your bottle within arm’s reach — you’ll drink more.' },
  { emoji: '🍋', text: 'A slice of lemon or mint makes plain water easier to finish.' },
  { emoji: '⏰', text: 'Pair a glass with something you already do, like every break.' },
  { emoji: '🏃', text: 'Add around 500 ml for every active hour.' },
  { emoji: '🌡️', text: 'Top up before you head into the heat, not after.' },
  { emoji: '😴', text: 'A glass at wake-up rehydrates you fastest.' },
  { emoji: '🧂', text: 'Sweating hard? Electrolytes help your body hold that water.' },
  { emoji: '🍉', text: 'Cucumber and melon count towards your intake too.' },
  { emoji: '☕', text: 'Chase your coffee with a glass of water.' },
  { emoji: '📉', text: 'Dark urine means it’s time to drink sooner rather than later.' },
];

const format = ({ emoji, text }: TipSeed): string => `${emoji} **Tip:** ${text}`;

/** The tips exactly as the user sees them. */
export const HYDRATION_TIPS: string[] = TIP_SEEDS.map(format);

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

let bag: string[] = [];
let lastTip: string | null = null;

/** Returns the next tip, never the same one twice in a row. */
export const nextHydrationTip = (): string => {
  if (bag.length === 0) {
    bag = shuffle(HYDRATION_TIPS);
    // Avoid an immediate repeat across the bag boundary.
    if (bag.length > 1 && bag[0] === lastTip) {
      [bag[0], bag[1]] = [bag[1], bag[0]];
    }
  }

  const tip = bag.shift() as string;
  lastTip = tip;
  return tip;
};

/**
 * Recognises a tip line without enumerating emoji — emoji are surrogate pairs,
 * which a plain character class silently mangles.
 *
 * A line counts as a tip when its first word-ish character starts a bold run
 * that is either labelled "Tip"/"Hydration Tip", or preceded by an emoji (the
 * `💧 **Hook!** sentence` shape the model used to produce).
 */
const isTipLine = (line: string): boolean => {
  const trimmed = line.trim();
  const start = trimmed.search(/[A-Za-z*]/);
  if (start === -1) return false;

  const body = trimmed.slice(start);
  if (!body.startsWith('**')) return false;

  return /^(?:hydration\s+)?tip\b/i.test(body.slice(2)) || start > 0;
};

/**
 * Removes a tip the AI backend appended on its own.
 *
 * The app owns the closing tip so it stays short and keeps rotating; without
 * this, a model that adds its own would leave the user with two.
 */
export const stripTrailingTip = (text: string): string => {
  const lines = text.replace(/\s+$/, '').split('\n');

  while (lines.length) {
    const last = lines[lines.length - 1];
    if (last.trim() === '' || isTipLine(last)) {
      lines.pop();
      continue;
    }
    break;
  }

  return lines.join('\n').replace(/\s+$/, '');
};

/** Appends exactly one fresh tip, replacing any the text already carried. */
export const withHydrationTip = (text: string): string => {
  const body = stripTrailingTip(text).trim();
  const tip = nextHydrationTip();
  return body ? `${body}\n\n${tip}` : tip;
};

/** Test hook — drops the rotation state so runs stay independent. */
export const resetHydrationTips = (): void => {
  bag = [];
  lastTip = null;
};

export default nextHydrationTip;
