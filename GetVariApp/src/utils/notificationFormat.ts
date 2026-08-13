/**
 * Time formatting for the notification log.
 *
 * Written by hand rather than via `toLocaleTimeString` so the output is
 * identical on every device and in tests — Hermes' Intl data varies by
 * platform, and a log the user scans for "when did this arrive" is not worth
 * that variance.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "11:52 PM" */
export const formatClock = (ms: number): string => {
  const date = new Date(ms);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  // 0 and 12 both display as 12 on a 12-hour clock.
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

/** Midnight at the start of the day containing `ms`. */
const startOfDay = (ms: number): number => {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/**
 * How the delivery time is labelled in the list. Recent arrivals read as an
 * elapsed duration ("4m ago"), which is what matters for a reminder that just
 * fired; anything older switches to an absolute time.
 */
export const formatDeliveredAt = (ms: number, now: number = Date.now()): string => {
  const elapsed = now - ms;

  if (elapsed < 0) return formatClock(ms);
  if (elapsed < MINUTE_MS) return 'Just now';
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`;

  const today = startOfDay(now);
  if (ms >= today) return formatClock(ms);
  if (ms >= startOfDay(today - 1)) return `Yesterday, ${formatClock(ms)}`;

  const date = new Date(ms);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${formatClock(ms)}`;
};

/**
 * The open/unopened badge. A tap is reported with the time it happened, so
 * "delivered 9:02, opened 9:40" is legible at a glance.
 */
export const formatPressState = (pressedAt: number | null): string =>
  pressedAt === null ? 'Not opened' : `Opened · ${formatClock(pressedAt)}`;
