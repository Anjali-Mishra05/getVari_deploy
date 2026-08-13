/**
 * Covers the delivery log behind the bell icon: that a notification is
 * recorded once however many times it is observed, that a tap lands on the row
 * it belongs to, and how times are rendered.
 */

var mockStore = new Map<string, string>();
var mockEmitted: string[] = [];

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

jest.mock('react-native', () => ({
  DeviceEventEmitter: {
    emit: jest.fn((event: string) => mockEmitted.push(event)),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

import NotificationHistory, {
  HISTORY_LIMIT,
  isActionable,
  readNotificationEventId,
} from '../src/services/NotificationHistory';
import {
  formatClock,
  formatDeliveredAt,
  formatPressState,
} from '../src/utils/notificationFormat';

const reminder = (slot: number, timestamp: number) => ({
  id: `hydration-reminder-${slot}`,
  title: '💧 Log your water',
  body: 'No water logged yet. Tap to log.',
  data: {
    type: 'hydration_reminder',
    eventId: `hydration-reminder-${slot}@${timestamp}`,
  },
});

beforeEach(() => {
  mockStore.clear();
  mockEmitted = [];
});

describe('notification identity', () => {
  it('prefers the event id baked into the notification', () => {
    expect(readNotificationEventId(reminder(2, 1700) as any)).toBe('hydration-reminder-2@1700');
  });

  it('falls back to the notification id, then to a shared bucket', () => {
    expect(readNotificationEventId({ id: 'abc' } as any)).toBe('notification:abc');
    expect(readNotificationEventId(undefined)).toBe('notification:unknown');
    expect(readNotificationEventId(null)).toBe('notification:unknown');
  });
});

describe('recording deliveries', () => {
  it('stores the title, body, kind and delivery time', async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 5_000);

    const [entry] = await NotificationHistory.list();
    expect(entry).toMatchObject({
      id: 'hydration-reminder-1@1000',
      title: '💧 Log your water',
      body: 'No water logged yet. Tap to log.',
      kind: 'hydration_reminder',
      deliveredAt: 5_000,
      pressedAt: null,
    });
  });

  it('records the same delivery once however many paths observe it', async () => {
    // Foreground listener, then a tray sweep, then the background handler.
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 5_000);
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 6_000);
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 7_000);

    const entries = await NotificationHistory.list();
    expect(entries).toHaveLength(1);
    // The first sighting is the accurate one; later sweeps must not move it.
    expect(entries[0].deliveredAt).toBe(5_000);
  });

  it('keeps separate reminders apart', async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 1_000);
    await NotificationHistory.recordDelivery(reminder(2, 2_000) as any, 2_000);

    expect(await NotificationHistory.list()).toHaveLength(2);
  });

  it('returns entries newest first regardless of insertion order', async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 1_000);
    await NotificationHistory.recordDelivery(reminder(3, 3_000) as any, 3_000);
    await NotificationHistory.recordDelivery(reminder(2, 2_000) as any, 2_000);

    expect((await NotificationHistory.list()).map(e => e.deliveredAt)).toEqual([
      3_000, 2_000, 1_000,
    ]);
  });

  it('caps the log, dropping the oldest entries', async () => {
    for (let slot = 1; slot <= HISTORY_LIMIT + 5; slot++) {
      await NotificationHistory.recordDelivery(reminder(slot, slot) as any, slot * 1_000);
    }

    const entries = await NotificationHistory.list();
    expect(entries).toHaveLength(HISTORY_LIMIT);
    expect(entries[0].deliveredAt).toBe((HISTORY_LIMIT + 5) * 1_000);
    expect(entries[entries.length - 1].deliveredAt).toBe(6 * 1_000);
  });

  it('survives corrupt stored data', async () => {
    mockStore.set('getvari_notification_history', 'not json');
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 1_000);
    expect(await NotificationHistory.list()).toHaveLength(1);
  });
});

describe('recording presses', () => {
  it('marks the delivered row as opened, without adding a row', async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 5_000);
    await NotificationHistory.recordPress(reminder(1, 1_000) as any, 9_000);

    const entries = await NotificationHistory.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ deliveredAt: 5_000, pressedAt: 9_000 });
  });

  it('keeps the first tap when the same press arrives twice', async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 5_000);
    await NotificationHistory.recordPress(reminder(1, 1_000) as any, 9_000);
    // Same press replayed through the cold-start path.
    await NotificationHistory.recordPress(reminder(1, 1_000) as any, 12_000);

    const entries = await NotificationHistory.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].pressedAt).toBe(9_000);
  });

  it('creates a row for a press whose delivery was never observed', async () => {
    // The app was killed, so no DELIVERED event ever reached JS.
    await NotificationHistory.recordPress(reminder(4, 8_000) as any, 9_500);

    const [entry] = await NotificationHistory.list();
    // The scheduled instant is a better "delivered at" than the tap time.
    expect(entry).toMatchObject({ deliveredAt: 8_000, pressedAt: 9_500 });
  });

  it('falls back to the tap time when the id carries no timestamp', async () => {
    await NotificationHistory.recordPress({ id: 'welcome', title: 'Hi' } as any, 4_242);

    const [entry] = await NotificationHistory.list();
    expect(entry).toMatchObject({ deliveredAt: 4_242, pressedAt: 4_242, kind: 'local' });
  });

  it('leaves untapped notifications unopened', async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 1_000);
    await NotificationHistory.recordDelivery(reminder(2, 2_000) as any, 2_000);
    await NotificationHistory.recordPress(reminder(2, 2_000) as any, 3_000);

    const entries = await NotificationHistory.list();
    expect(entries.map(e => e.pressedAt)).toEqual([3_000, null]);
  });
});

describe('opening one reminder settles the earlier ones', () => {
  /** Three reminders delivered two minutes apart, none opened yet. */
  const deliverThree = async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 1_000);
    await NotificationHistory.recordDelivery(reminder(2, 2_000) as any, 2_000);
    await NotificationHistory.recordDelivery(reminder(3, 3_000) as any, 3_000);
  };

  const byId = (entries: any[], slot: number, ts: number) =>
    entries.find(e => e.id === `hydration-reminder-${slot}@${ts}`)!;

  it('marks only the tapped one as opened', async () => {
    await deliverThree();
    await NotificationHistory.recordPress(reminder(3, 3_000) as any, 9_000);

    const entries = await NotificationHistory.list();
    expect(byId(entries, 3, 3_000).pressedAt).toBe(9_000);
    // The user never touched these; the log must not claim they did.
    expect(byId(entries, 1, 1_000).pressedAt).toBeNull();
    expect(byId(entries, 2, 2_000).pressedAt).toBeNull();
  });

  it('leaves the earlier ones with no action to offer', async () => {
    await deliverThree();
    await NotificationHistory.recordPress(reminder(3, 3_000) as any, 9_000);

    const entries = await NotificationHistory.list();
    expect(byId(entries, 1, 1_000).supersededAt).toBe(9_000);
    expect(byId(entries, 2, 2_000).supersededAt).toBe(9_000);
    expect(entries.filter(isActionable)).toEqual([]);
  });

  it('leaves newer reminders still actionable', async () => {
    await deliverThree();
    // The user opens the middle one; the newest is still unanswered.
    await NotificationHistory.recordPress(reminder(2, 2_000) as any, 9_000);

    const entries = await NotificationHistory.list();
    expect(byId(entries, 1, 1_000).supersededAt).toBe(9_000);
    expect(isActionable(byId(entries, 3, 3_000))).toBe(true);
  });

  it('does not settle notifications of a different kind', async () => {
    const push = {
      id: 'promo',
      title: 'Weekly summary',
      data: { type: 'push', eventId: 'push:500' },
    };
    await NotificationHistory.recordDelivery(push as any, 500);
    await NotificationHistory.recordDelivery(reminder(2, 2_000) as any, 2_000);
    await NotificationHistory.recordPress(reminder(2, 2_000) as any, 9_000);

    const entries = await NotificationHistory.list();
    // A hydration tap says nothing about an unrelated push.
    expect(isActionable(entries.find(e => e.id === 'push:500')!)).toBe(true);
  });

  it('keeps an already-opened earlier reminder marked as opened', async () => {
    await deliverThree();
    await NotificationHistory.recordPress(reminder(1, 1_000) as any, 5_000);
    await NotificationHistory.recordPress(reminder(3, 3_000) as any, 9_000);

    const entries = await NotificationHistory.list();
    const first = byId(entries, 1, 1_000);
    expect(first.pressedAt).toBe(5_000);
    expect(first.supersededAt).toBeNull();
  });

  it('settles earlier reminders even when the tapped one was never delivered', async () => {
    await deliverThree();
    // Cold start from a reminder whose delivery event never reached JS.
    await NotificationHistory.recordPress(reminder(9, 9_000) as any, 9_500);

    const entries = await NotificationHistory.list();
    expect(entries.filter(isActionable)).toEqual([]);
  });

  it('reports actionable state for each row', () => {
    const base = { id: 'a', title: '', body: '', kind: 'hydration_reminder' as const, deliveredAt: 1 };
    expect(isActionable({ ...base, pressedAt: null, supersededAt: null })).toBe(true);
    expect(isActionable({ ...base, pressedAt: 2, supersededAt: null })).toBe(false);
    expect(isActionable({ ...base, pressedAt: null, supersededAt: 2 })).toBe(false);
  });
});

describe('in-app taps from the bell menu', () => {
  it('opens the row and settles the earlier ones', async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 1_000);
    await NotificationHistory.recordDelivery(reminder(2, 2_000) as any, 2_000);

    await NotificationHistory.recordPressById('hydration-reminder-2@2000', 7_000);

    const entries = await NotificationHistory.list();
    expect(entries.find(e => e.id === 'hydration-reminder-2@2000')!.pressedAt).toBe(7_000);
    expect(entries.find(e => e.id === 'hydration-reminder-1@1000')!.supersededAt).toBe(7_000);
  });

  it('never invents a row for an id that is not in the log', async () => {
    await NotificationHistory.recordPressById('hydration-reminder-9@9000', 7_000);
    expect(await NotificationHistory.list()).toEqual([]);
  });

  it('leaves an already-opened row untouched', async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 1_000);
    await NotificationHistory.recordPress(reminder(1, 1_000) as any, 5_000);
    await NotificationHistory.recordPressById('hydration-reminder-1@1000', 7_000);

    const [entry] = await NotificationHistory.list();
    expect(entry.pressedAt).toBe(5_000);
  });
});

describe('reading rows written before superseding existed', () => {
  it('treats a missing supersededAt as never superseded', async () => {
    mockStore.set(
      'getvari_notification_history',
      JSON.stringify([
        {
          id: 'hydration-reminder-1@1000',
          title: 'old',
          body: '',
          kind: 'hydration_reminder',
          deliveredAt: 1_000,
          pressedAt: null,
        },
      ])
    );

    const [entry] = await NotificationHistory.list();
    expect(entry.supersededAt).toBeNull();
    expect(isActionable(entry)).toBe(true);
  });
});

describe('concurrent writes', () => {
  it('does not lose entries when deliveries overlap', async () => {
    // A reminder firing while another is being pressed: two read-modify-write
    // cycles over one storage key, started without awaiting each other.
    await Promise.all([
      NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 1_000),
      NotificationHistory.recordDelivery(reminder(2, 2_000) as any, 2_000),
      NotificationHistory.recordDelivery(reminder(3, 3_000) as any, 3_000),
      NotificationHistory.recordPress(reminder(1, 1_000) as any, 4_000),
    ]);

    const entries = await NotificationHistory.list();
    expect(entries).toHaveLength(3);
    expect(entries.find(e => e.id === 'hydration-reminder-1@1000')?.pressedAt).toBe(4_000);
  });
});

describe('the unseen badge', () => {
  it('counts everything before the sheet has ever been opened', async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 1_000);
    await NotificationHistory.recordDelivery(reminder(2, 2_000) as any, 2_000);

    expect(await NotificationHistory.unseenCount()).toBe(2);
  });

  it('clears once opened, and counts only later arrivals', async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 1_000);
    await NotificationHistory.markAllSeen(1_500);

    expect(await NotificationHistory.unseenCount()).toBe(0);

    await NotificationHistory.recordDelivery(reminder(2, 2_000) as any, 2_000);
    expect(await NotificationHistory.unseenCount()).toBe(1);
  });

  it('does not count an unopened notification the user has already scrolled past', async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 1_000);
    await NotificationHistory.markAllSeen(1_500);

    // Still never tapped, but no longer new — the badge must not stick.
    const [entry] = await NotificationHistory.list();
    expect(entry.pressedAt).toBeNull();
    expect(await NotificationHistory.unseenCount()).toBe(0);
  });
});

describe('clearing', () => {
  it('empties the log', async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 1_000);
    await NotificationHistory.clear();
    expect(await NotificationHistory.list()).toEqual([]);
  });
});

describe('change notifications', () => {
  it('announces writes so an open list can re-read', async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 1_000);
    expect(mockEmitted).toContain('getvari:notification-history-changed');
  });

  it('stays quiet when a duplicate delivery changes nothing', async () => {
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 1_000);
    mockEmitted = [];
    await NotificationHistory.recordDelivery(reminder(1, 1_000) as any, 2_000);
    expect(mockEmitted).toEqual([]);
  });
});

describe('time formatting', () => {
  const at = (h: number, m: number, day = 15) =>
    new Date(2026, 7, day, h, m, 0, 0).getTime();

  it('renders a 12-hour clock', () => {
    expect(formatClock(at(23, 52))).toBe('11:52 PM');
    expect(formatClock(at(0, 3))).toBe('12:03 AM');
    expect(formatClock(at(12, 0))).toBe('12:00 PM');
    expect(formatClock(at(9, 5))).toBe('9:05 AM');
  });

  it('uses elapsed time for recent arrivals', () => {
    const now = at(12, 0);
    expect(formatDeliveredAt(now - 30 * 1000, now)).toBe('Just now');
    expect(formatDeliveredAt(now - 4 * 60 * 1000, now)).toBe('4m ago');
    expect(formatDeliveredAt(now - 59 * 60 * 1000, now)).toBe('59m ago');
  });

  it('switches to a clock time for older arrivals today', () => {
    expect(formatDeliveredAt(at(9, 5), at(14, 0))).toBe('9:05 AM');
  });

  it('labels yesterday and earlier days', () => {
    expect(formatDeliveredAt(at(22, 10, 14), at(9, 0, 15))).toBe('Yesterday, 10:10 PM');
    expect(formatDeliveredAt(at(22, 10, 9), at(9, 0, 15))).toBe('9 Aug, 10:10 PM');
  });

  it('never reports a future delivery as elapsed time', () => {
    const now = at(12, 0);
    expect(formatDeliveredAt(now + 60 * 1000, now)).toBe('12:01 PM');
  });

  it('describes the open state', () => {
    expect(formatPressState(null)).toBe('Not opened');
    expect(formatPressState(at(23, 52))).toBe('Opened · 11:52 PM');
  });
});
