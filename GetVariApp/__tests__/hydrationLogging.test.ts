/**
 * Covers the hydration logging workflow end to end at the logic level:
 * amount parsing, natural-language intent, idempotent writes, and the
 * "many notifications, one prompt" rule.
 */

// `var` + `mock` prefix so the hoisted jest.mock factories below can see these.
var mockLogRows: any[] = [];
var mockProfile: any = { targetDailyMl: 3000 };
var mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStore.delete(key);
    }),
  },
}));

jest.mock('../src/services/NotificationService', () => ({
  __esModule: true,
  default: { scheduleHydrationReminders: jest.fn(async () => {}) },
  HYDRATION_REMINDER_TYPE: 'hydration_reminder',
}));

jest.mock('../src/services/AuthService', () => ({
  AuthService: { getCurrentUserId: jest.fn(async () => 'user-1') },
}));

// ChatBus only wraps React Native's DeviceEventEmitter; stubbing it keeps
// these logic tests out of the React Native runtime.
jest.mock('../src/services/ChatBus', () => ({
  __esModule: true,
  default: {
    emitHydrationLogged: jest.fn(),
    onHydrationLogged: jest.fn(),
    openHydrationPrompt: jest.fn(),
    onOpenHydrationPrompt: jest.fn(),
  },
}));

jest.mock('../src/services/SupabaseClient', () => {
  const thenable = (produce: () => { data: any; error: any }) => {
    const query: any = {
      eq: () => query,
      gte: () => query,
      order: () => query,
      single: async () => produce(),
      // The app reads the profile with `maybeSingle` — a user who has not
      // onboarded yet simply has no row, which `single` reports as an error.
      maybeSingle: async () => produce(),
      then: (resolve: any, reject: any) => Promise.resolve(produce()).then(resolve, reject),
    };
    return query;
  };

  return {
    supabase: {
      from: (table: string) => ({
        select: () =>
          table === 'getvari_profiles'
            ? thenable(() => ({ data: { profile: mockProfile }, error: null }))
            : thenable(() => ({ data: [...mockLogRows], error: null })),
        insert: (row: any) => ({
          select: async () => {
            // Stands in for the table's primary key: a repeated row id is
            // rejected instead of creating a second entry.
            if (mockLogRows.some(existing => existing.id === row.id)) {
              return { data: null, error: { code: '23505', message: 'duplicate key value' } };
            }
            mockLogRows.push(row);
            return { data: [row], error: null };
          },
        }),
      }),
    },
  };
});

import { matchIntake, parseIntakeMl } from '../src/utils/parseIntake';
import { detectHydrationLogIntent, looksLikeQuestion } from '../src/utils/hydrationIntent';
import { buildLogConfirmation, formatDailyTotal, formatMl } from '../src/utils/hydrationFormat';
import { QUICK_LOG_AMOUNTS } from '../src/utils/hydrationAmounts';
import {
  HYDRATION_TIPS,
  nextHydrationTip,
  resetHydrationTips,
  stripTrailingTip,
  withHydrationTip,
} from '../src/utils/hydrationTips';

const loadHydrationService = () => require('../src/services/HydrationService').default;
const loadPromptSession = () => require('../src/services/HydrationPromptSession').default;

beforeEach(() => {
  mockLogRows = [];
  mockProfile = { targetDailyMl: 3000 };
  mockStore = new Map();
  jest.resetModules();
  resetHydrationTips();
});

/* ------------------------------------------------------------------ *
 * Amount parsing — ml, L, litre, litres
 * ------------------------------------------------------------------ */

describe('parseIntakeMl', () => {
  it.each([
    ['500 ml', 500],
    ['500ml', 500],
    ['750 ml', 750],
    ['1 litre', 1000],
    ['1.5 litres', 1500],
    ['2 L', 2000],
    ['2l', 2000],
    ['2 liters', 2000],
    ['two glasses', 500],
    ['1 bottle', 500],
  ])('parses %s', (text, expected) => {
    expect(parseIntakeMl(text)).toBe(expected);
  });

  it('finds the amount inside a sentence', () => {
    expect(parseIntakeMl('I just drank 500ml of water')).toBe(500);
    expect(parseIntakeMl('add 2L to my intake')).toBe(2000);
  });

  it('prefers the amount the user led with', () => {
    expect(parseIntakeMl('I drank 500 ml, not 1 litre')).toBe(500);
  });

  // The chat's quick replies send their own label back through the parser, so
  // a label that stops parsing would silently break those buttons.
  it.each(QUICK_LOG_AMOUNTS.map(a => [a.label, a.ml] as const))(
    'reads back the quick-log label %s as its own amount',
    (label, ml) => {
      expect(parseIntakeMl(label)).toBe(ml);
    }
  );

  it('rejects nonsense and impossible amounts', () => {
    expect(parseIntakeMl('hello there')).toBeNull();
    expect(parseIntakeMl('')).toBeNull();
    expect(parseIntakeMl('40 litres')).toBeNull();
  });

  it('reports whether a unit was named', () => {
    expect(matchIntake('500 ml')?.hasUnit).toBe(true);
    expect(matchIntake('3')?.hasUnit).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Natural-language logging — no notification, no button
 * ------------------------------------------------------------------ */

describe('detectHydrationLogIntent', () => {
  it.each([
    ['log my entry as 500 ml', 500],
    ['I drank 750 ml', 750],
    ['log 1 litre', 1000],
    ['I had 1.5 litres of water', 1500],
    ['add 2L to my intake', 2000],
    ['I just drank 500ml', 500],
    ['500 ml', 500],
    ['1.5 litres', 1500],
    ['can you log 250 ml for me?', 250],
  ])('treats "%s" as a logging request', (text, expected) => {
    expect(detectHydrationLogIntent(text)).toEqual({ isLogRequest: true, amountMl: expected });
  });

  it('asks for the amount when none was given', () => {
    expect(detectHydrationLogIntent('log my water')).toEqual({
      isLogRequest: true,
      amountMl: null,
    });
  });

  it.each([
    'should I drink 3 litres a day?',
    'how much is 2 litres in glasses?',
    'is 500 ml enough before a run',
    'what are the benefits of water',
    'tell me a hydration fact',
  ])('leaves the question "%s" to the AI', text => {
    expect(detectHydrationLogIntent(text).isLogRequest).toBe(false);
  });

  it('recognises questions', () => {
    expect(looksLikeQuestion('how much water?')).toBe(true);
    expect(looksLikeQuestion('750 ml')).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Response formatting and tips
 * ------------------------------------------------------------------ */

describe('formatting', () => {
  it('switches to litres past a litre', () => {
    expect(formatMl(750)).toBe('750 ml');
    expect(formatMl(1000)).toBe('1 L');
    expect(formatMl(1750)).toBe('1.75 L');
  });

  it('renders the daily pair', () => {
    expect(formatDailyTotal(1750, 3000)).toBe('1.75 L / 3.00 L');
  });
});

describe('log confirmation', () => {
  const result = (over: any = {}) => ({
    status: 'logged',
    requestId: 'r',
    amountMl: 500,
    totalMl: 1750,
    targetMl: 3000,
    ...over,
  });

  it('is a single scannable line with the amounts in bold', () => {
    const message = buildLogConfirmation(result());

    expect(message).toBe('**✅ 500 ml logged!** Your total today is **1.75 L / 3.00 L**.');
    expect(message).not.toContain('\n');
  });

  it('stays one line with the tip attached', () => {
    const full = withHydrationTip(buildLogConfirmation(result()));
    const paragraphs = full.split('\n\n');

    expect(paragraphs).toHaveLength(2);
    expect(HYDRATION_TIPS).toContain(paragraphs[1]);
  });

  it('celebrates the goal without a second paragraph', () => {
    expect(buildLogConfirmation(result({ totalMl: 3100 }))).toBe(
      '**✅ 500 ml logged!** Your total today is **3.10 L / 3.00 L**. 🎉 **Goal reached!**'
    );
  });

  it('says so plainly when the entry was already saved', () => {
    expect(buildLogConfirmation(result({ status: 'duplicate' }))).toBe(
      '**Already logged — 500 ml.** Your total today is **1.75 L / 3.00 L**.'
    );
  });
});

describe('hydration tips', () => {
  it('uses every tip before repeating any', () => {
    const drawn = HYDRATION_TIPS.map(() => nextHydrationTip());
    expect(new Set(drawn).size).toBe(HYDRATION_TIPS.length);
  });

  it('never repeats a tip back to back', () => {
    let previous = '';
    for (let i = 0; i < 200; i++) {
      const tip = nextHydrationTip();
      expect(tip).not.toBe(previous);
      previous = tip;
    }
  });

  it('is one short line: emoji, bold label, one sentence', () => {
    HYDRATION_TIPS.forEach(tip => {
      expect(tip).toMatch(/^\S+ \*\*Tip:\*\* .+/);
      expect(tip).not.toContain('\n');
      expect(tip.split(' ').length).toBeLessThanOrEqual(16);
    });
  });
});

describe('withHydrationTip', () => {
  it('closes a message with exactly one tip', () => {
    const message = withHydrationTip('**✅ 500 ml logged!** Your total today is **1.75 L / 3.00 L**.');
    const lines = message.split('\n').filter(Boolean);

    expect(lines).toHaveLength(2);
    expect(HYDRATION_TIPS).toContain(lines[1]);
  });

  it('replaces a tip the AI added rather than stacking a second one', () => {
    const answer = 'Water helps regulate **body temperature**.\n\n💧 **Tip:** Sip regularly.';
    const message = withHydrationTip(answer);

    expect(message.match(/\*\*Tip:\*\*/g)).toHaveLength(1);
    expect(message).toContain('body temperature');
    expect(message).not.toContain('Sip regularly');
  });

  it('strips the older "Hydration Tip" phrasing too', () => {
    expect(stripTrailingTip('Answer.\n\n💧 **Hydration Tip:** Drink up.')).toBe('Answer.');
    expect(stripTrailingTip('Answer.\n\n🌊 **Stay ahead of thirst!** Sip now.')).toBe('Answer.');
  });

  it('leaves an answer that has no tip untouched', () => {
    expect(stripTrailingTip('Two litres is a **reasonable** daily target.')).toBe(
      'Two litres is a **reasonable** daily target.'
    );
  });

  it('still produces a tip for an empty message', () => {
    expect(HYDRATION_TIPS).toContain(withHydrationTip(''));
  });
});

/* ------------------------------------------------------------------ *
 * Supabase writes — one entry per request, correct daily total
 * ------------------------------------------------------------------ */

describe('HydrationService.logWater', () => {
  it('writes the entry and returns the updated daily total', async () => {
    const service = loadHydrationService();

    const result = await service.logWater({ amountMl: 750, requestId: 'chat:1' });

    expect(result.status).toBe('logged');
    expect(mockLogRows).toHaveLength(1);
    expect(mockLogRows[0].amount_ml).toBe(750);
    expect(result.totalMl).toBe(750);
    expect(result.targetMl).toBe(3000);
    expect(formatDailyTotal(result.totalMl, result.targetMl)).toBe('0.75 L / 3.00 L');
  });

  it('adds to what is already logged today', async () => {
    const service = loadHydrationService();

    await service.logWater({ amountMl: 1000, requestId: 'chat:1' });
    const second = await service.logWater({ amountMl: 750, requestId: 'chat:2' });

    expect(mockLogRows).toHaveLength(2);
    expect(second.totalMl).toBe(1750);
  });

  it('does not create a second entry for a repeated request id', async () => {
    const service = loadHydrationService();

    const first = await service.logWater({ amountMl: 500, requestId: 'notif:evt-1' });
    const retry = await service.logWater({ amountMl: 500, requestId: 'notif:evt-1' });

    expect(first.status).toBe('logged');
    expect(retry.status).toBe('duplicate');
    expect(mockLogRows).toHaveLength(1);
    expect(retry.totalMl).toBe(500);
  });

  it('collapses concurrent writes of the same request onto one round trip', async () => {
    const service = loadHydrationService();
    const chatBus = require('../src/services/ChatBus').default;

    const results = await Promise.all([
      service.logWater({ amountMl: 500, requestId: 'notif:evt-1' }),
      service.logWater({ amountMl: 500, requestId: 'notif:evt-1' }),
      service.logWater({ amountMl: 500, requestId: 'notif:evt-1' }),
    ]);

    // One insert, one broadcast, and every caller sees the same outcome.
    expect(mockLogRows).toHaveLength(1);
    expect(chatBus.emitHydrationLogged).toHaveBeenCalledTimes(1);
    expect(results[1]).toBe(results[0]);
    expect(results[2]).toBe(results[0]);
    expect(results.every(r => r.status === 'logged' && r.totalMl === 500)).toBe(true);
  });

  it('is still idempotent after a restart clears local state', async () => {
    const service = loadHydrationService();
    await service.logWater({ amountMl: 500, requestId: 'notif:evt-1' });

    // Restart: module state and local dedupe cache are gone, the table is not.
    jest.resetModules();
    mockStore = new Map();
    const restarted = loadHydrationService();

    const replay = await restarted.logWater({ amountMl: 500, requestId: 'notif:evt-1' });

    expect(replay.status).toBe('duplicate');
    expect(mockLogRows).toHaveLength(1);
  });

  it('broadcasts a real write once, and never a duplicate', async () => {
    const service = loadHydrationService();
    const chatBus = require('../src/services/ChatBus').default;

    await service.logWater({ amountMl: 500, requestId: 'notif:evt-1' });
    await service.logWater({ amountMl: 500, requestId: 'notif:evt-1' });

    expect(chatBus.emitHydrationLogged).toHaveBeenCalledTimes(1);
  });

  it('rejects amounts outside the sane range', async () => {
    const service = loadHydrationService();

    expect((await service.logWater({ amountMl: 0, requestId: 'a' })).status).toBe('error');
    expect((await service.logWater({ amountMl: 99999, requestId: 'b' })).status).toBe('error');
    expect(mockLogRows).toHaveLength(0);
  });

  it('reports a missing session instead of throwing', async () => {
    const { AuthService } = require('../src/services/AuthService');
    AuthService.getCurrentUserId.mockResolvedValueOnce(null);
    const service = loadHydrationService();

    expect((await service.logWater({ amountMl: 500, requestId: 'a' })).status).toBe(
      'unauthenticated'
    );
    expect(mockLogRows).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * Notification presses — many taps, one prompt
 * ------------------------------------------------------------------ */

describe('HydrationPromptSession', () => {
  /** Mirrors what the chat does for each incoming reminder press. */
  const handlePress = async (session: any, eventId: string) => {
    if (!(await session.claimEvent(eventId))) return 'ignored';
    return (await session.beginPrompt()) ? 'asked' : 'reopened';
  };

  it('asks once no matter how many reminders are tapped', async () => {
    const session = loadPromptSession();

    const outcomes = [];
    for (let i = 1; i <= 10; i++) {
      outcomes.push(await handlePress(session, `reminder-${i}`));
    }

    expect(outcomes.filter(o => o === 'asked')).toHaveLength(1);
    expect(outcomes.filter(o => o === 'reopened')).toHaveLength(9);
  });

  it('ignores the same press delivered several times', async () => {
    const session = loadPromptSession();

    const first = await handlePress(session, 'reminder-3@1700');
    const replay = await handlePress(session, 'reminder-3@1700');
    const coldStart = await handlePress(session, 'reminder-3@1700');

    expect([first, replay, coldStart]).toEqual(['asked', 'ignored', 'ignored']);
  });

  it('does not re-ask after the user has answered', async () => {
    const session = loadPromptSession();

    expect(await handlePress(session, 'reminder-1')).toBe('asked');
    await session.markResolved();

    expect(await handlePress(session, 'reminder-2')).toBe('reopened');
    expect(await handlePress(session, 'reminder-3')).toBe('reopened');
  });

  it('asks again on the next reminder cycle once water has been logged', async () => {
    const session = loadPromptSession();

    await handlePress(session, 'reminder-1');
    await session.markResolved();
    await session.reset(); // what commitLog does after a successful write

    expect(await handlePress(session, 'reminder-2')).toBe('asked');
  });

  it('re-asks an unanswered user only after the cooldown', async () => {
    const session = loadPromptSession();
    const { REASK_COOLDOWN_MS } = require('../src/services/HydrationPromptSession');
    const start = Date.now();

    await session.claimEvent('reminder-1');
    await session.beginPrompt(start);
    await session.markResolved(start);

    await session.claimEvent('reminder-2');
    expect(await session.beginPrompt(start + REASK_COOLDOWN_MS - 1000)).toBe(false);

    await session.claimEvent('reminder-3');
    expect(await session.beginPrompt(start + REASK_COOLDOWN_MS + 1000)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * The scenario the whole change exists for
 * ------------------------------------------------------------------ */

describe('multiple notifications produce exactly one entry', () => {
  it('three taps, one prompt, one Supabase row', async () => {
    const session = loadPromptSession();
    const service = loadHydrationService();

    // Three reminders fire and the user taps all of them.
    let promptRequestId: string | null = null;
    let prompts = 0;
    for (const eventId of ['reminder-1@100', 'reminder-2@200', 'reminder-3@300']) {
      if (!(await session.claimEvent(eventId))) continue;
      if (await session.beginPrompt()) {
        prompts++;
        promptRequestId = `notif:${eventId}`;
      }
    }
    expect(prompts).toBe(1);

    // The user taps "Log it for me" and answers "750 ml".
    await session.markResolved();
    const amountMl = parseIntakeMl('750 ml');
    const logged = await service.logWater({
      amountMl: amountMl!,
      source: 'ai_chat',
      requestId: promptRequestId!,
    });

    expect(logged.status).toBe('logged');
    expect(mockLogRows).toHaveLength(1);
    expect(mockLogRows[0].source).toBe('ai_chat');

    // The same conversation retried (double tap, replayed press) writes nothing.
    const retry = await service.logWater({
      amountMl: amountMl!,
      source: 'ai_chat',
      requestId: promptRequestId!,
    });
    expect(retry.status).toBe('duplicate');
    expect(mockLogRows).toHaveLength(1);

    // The confirmation the user sees.
    expect(formatMl(logged.amountMl)).toBe('750 ml');
    expect(formatDailyTotal(logged.totalMl, logged.targetMl)).toBe('0.75 L / 3.00 L');
  });

  it('typed logging works with no notification involved', async () => {
    const service = loadHydrationService();

    const intent = detectHydrationLogIntent('I had 1.5 litres of water');
    expect(intent).toEqual({ isLogRequest: true, amountMl: 1500 });

    const result = await service.logWater({
      amountMl: intent.amountMl!,
      source: 'ai_chat',
      requestId: 'chat:msg-42',
    });

    expect(result.status).toBe('logged');
    expect(mockLogRows).toHaveLength(1);
    expect(formatDailyTotal(result.totalMl, result.targetMl)).toBe('1.50 L / 3.00 L');
  });
});
