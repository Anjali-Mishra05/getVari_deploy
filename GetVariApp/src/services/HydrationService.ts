import type {
  HydrationLog,
  HydrationLogResult,
  HydrationSource,
  HydrationTotals,
  VerificationSource,
} from '../types';
import { WATER_LOG_LIMITS } from '../config/edgeCaseConfig';
import TelemetryHistoryService from './TelemetryHistoryService';
import { supabase } from './SupabaseClient';
import { AuthService } from './AuthService';
import NotificationService from './NotificationService';
import ChatBus from './ChatBus';
import DailyTargetService from './DailyTargetService';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The single writer for hydration entries.
 *
 * Every path that can log water — the home screen "+" button, the reminder
 * conversation, a quick-reply button and free-typed messages — goes through
 * `logWater` so they all share one set of guarantees:
 *
 *  1. **Idempotency.** The caller supplies a `requestId` (a notification event
 *     id, a chat message id, …). It is folded into the row's primary key, so a
 *     retry, a double tap or a replayed notification cannot insert a second
 *     row: the database rejects it and the retry is reported as `duplicate`.
 *  2. **One in-flight write per request id**, so two near-simultaneous calls
 *     share a single round trip instead of racing each other.
 *  3. **A fresh daily total** read back from Supabase after the write, so the
 *     number shown to the user is the stored truth rather than a local guess.
 */

const LOGS_TABLE = 'getvari_hydration_logs';
const PROFILES_TABLE = 'getvari_profiles';
const PROCESSED_KEY = 'getvari_hydration_request_ids';
/** How many request ids to remember locally; the PK is the real safety net. */
const PROCESSED_LIMIT = 100;

export const DEFAULT_TARGET_ML = 2500;
export const MAX_SINGLE_ENTRY_ML = 5000;

export interface LogWaterParams {
  amountMl: number;
  source?: HydrationSource;
  /** Idempotency key. Generated when the caller has no natural one. */
  requestId?: string;
  /** Actual intake timestamp for backdating. */
  reportedAt?: string;
  /** Verification status. */
  verificationSource?: VerificationSource;
  /** Skip realism check (e.g. user already confirmed). */
  confirmed?: boolean;
}

/** Row ids are user-scoped so two accounts can share a notification event id. */
const buildRowId = (userId: string, requestId: string): string =>
  `hyd_${userId}_${requestId}`.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 180);

let requestCounter = 0;
export const generateRequestId = (prefix: string): string =>
  `${prefix}:${Date.now().toString(36)}:${(requestCounter++).toString(36)}`;

/** In-flight writes, keyed by row id. */
const inFlight = new Map<string, Promise<HydrationLogResult>>();
/** Row ids written during this app session. */
const processedThisSession = new Set<string>();

const startOfTodayIso = (): string => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
};

const readProcessedIds = async (): Promise<string[]> => {
  try {
    const raw = await AsyncStorage.getItem(PROCESSED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch (error) {
    console.error('[Hydration] Failed to read processed request ids:', error);
    return [];
  }
};

const wasProcessed = async (rowId: string): Promise<boolean> => {
  if (processedThisSession.has(rowId)) return true;
  return (await readProcessedIds()).includes(rowId);
};

const rememberProcessed = async (rowId: string): Promise<void> => {
  processedThisSession.add(rowId);
  try {
    const existing = (await readProcessedIds()).filter(id => id !== rowId);
    existing.push(rowId);
    await AsyncStorage.setItem(
      PROCESSED_KEY,
      JSON.stringify(existing.slice(-PROCESSED_LIMIT))
    );
  } catch (error) {
    console.error('[Hydration] Failed to persist processed request id:', error);
  }
};

/**
 * The stored daily goal. `DEFAULT_TARGET_ML` stands in for a profile that has
 * not loaded or has no goal yet.
 */
const fetchTargetMl = async (userId: string): Promise<number | null> => {
  try {
    /**
     * Today's locked goal first, and the profile's stored figure only as a
     * fallback.
     *
     * These are two runs of the same pipeline — one with the observed
     * telemetry bands, one without — and reading the stored one here is what
     * put "250 / 4552 ml" in a reminder while the dashboard above it read
     * 5,000. `peekTodayTargetMl` never computes: this is called from the
     * background delivery handler, which has no profile to hand and no
     * business fetching one, so it takes the number the dashboard locked in
     * and falls back when the app has not run yet today.
     */
    const locked = await DailyTargetService.peekTodayTargetMl();
    if (locked !== null) return locked;

    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .select('profile')
      .eq('id', userId)
      .maybeSingle();

    if (error) return DEFAULT_TARGET_ML;

    const profile = data?.profile;
    const target = Number(profile?.targetDailyMl);
    return Number.isFinite(target) && target > 0 ? target : DEFAULT_TARGET_ML;
  } catch {
    return DEFAULT_TARGET_ML;
  }
};

const mapRow = (row: any): HydrationLog => ({
  id: row.id,
  timestamp: row.timestamp,
  // Falls back to the write time when the column is absent, so the "no water
  // for 3 hours" rule still has an intake time to measure from.
  reportedAt: row.reported_at ?? row.timestamp,
  amountMl: row.amount_ml,
  source: row.source,
  verificationSource: row.verification_source ?? undefined,
});

/**
 * Today's entries, newest first, with the reason an empty list is empty.
 *
 * A day with nothing logged and a day that could not be read look identical
 * once the rows are gone, and the dashboard has to treat them differently:
 * one is a fact to show, the other is a read to retry. `fetchTodayLogs` keeps
 * degrading silently for every caller that only wants the entries.
 */
export interface TodayLogsResult {
  logs: HydrationLog[];
  /** True when the backend could not be read — offline, timed out, rejected. */
  failed: boolean;
}

export const fetchTodayLogsResult = async (
  userId?: string | null
): Promise<TodayLogsResult> => {
  const id = userId ?? (await AuthService.getCurrentUserId());
  if (!id) return { logs: [], failed: false };

  try {
    const { data, error } = await supabase
      .from(LOGS_TABLE)
      .select('*')
      .eq('user_id', id)
      .gte('timestamp', startOfTodayIso())
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('[Hydration] Failed to fetch today logs:', error.message);
      return { logs: [], failed: true };
    }
    return { logs: (data ?? []).map(mapRow), failed: false };
  } catch (error) {
    // A timed-out or aborted request rejects instead of returning an error.
    console.error('[Hydration] Today logs fetch threw:', error);
    return { logs: [], failed: true };
  }
};

/** Today's entries, newest first. An unreadable backend reads as an empty day. */
export const fetchTodayLogs = async (userId?: string | null): Promise<HydrationLog[]> =>
  (await fetchTodayLogsResult(userId)).logs;

/**
 * Every entry from the start of the day `days - 1` days ago until now, newest
 * first. Backs the Analytics tab. `failed` separates "nothing logged" from
 * "could not read", as `fetchTodayLogsResult` does.
 */
export const fetchLogsForDays = async (
  days: number,
  userId?: string | null
): Promise<TodayLogsResult> => {
  const id = userId ?? (await AuthService.getCurrentUserId());
  if (!id) return { logs: [], failed: false };

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  try {
    const { data, error } = await supabase
      .from(LOGS_TABLE)
      .select('*')
      .eq('user_id', id)
      .gte('timestamp', since.toISOString())
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('[Hydration] Failed to fetch history:', error.message);
      return { logs: [], failed: true };
    }
    return { logs: (data ?? []).map(mapRow), failed: false };
  } catch (error) {
    console.error('[Hydration] History fetch threw:', error);
    return { logs: [], failed: true };
  }
};

/**
 * Calculates the average daily intake over the last 7 days.
 */
export const getRolling7DayIntakeAvg = async (userId: string): Promise<number> => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from(LOGS_TABLE)
    .select('amount_ml, timestamp')
    .eq('user_id', userId)
    .gte('timestamp', sevenDaysAgo.toISOString());

  if (error || !data) return DEFAULT_TARGET_ML; // Use target as fallback base

  // Group by date to find daily totals
  const dailyTotals: Record<string, number> = {};
  data.forEach(log => {
    const date = log.timestamp.split('T')[0];
    dailyTotals[date] = (dailyTotals[date] || 0) + log.amount_ml;
  });

  const totals = Object.values(dailyTotals);
  if (totals.length === 0) return DEFAULT_TARGET_ML;
  return totals.reduce((a, b) => a + b, 0) / totals.length;
};

/** Millilitres logged today plus the user's daily goal. */
export const getTodayTotals = async (userId?: string | null): Promise<HydrationTotals> => {
  const id = userId ?? (await AuthService.getCurrentUserId());
  if (!id) return { totalMl: 0, targetMl: DEFAULT_TARGET_ML };

  const [logs, targetMl] = await Promise.all([fetchTodayLogs(id), fetchTargetMl(id)]);
  return {
    totalMl: logs.reduce((sum, log) => sum + (log.amountMl || 0), 0),
    targetMl,
  };
};

/**
 * True when Postgres/PostgREST rejected the write because a column in the row
 * does not exist on the table — as opposed to a permission, constraint or
 * connectivity failure, which must still surface as an error.
 */
const isUnknownColumnError = (error: { code?: string; message?: string }): boolean =>
  error.code === 'PGRST204' ||
  error.code === '42703' ||
  /column .* does not exist|could not find the .* column/i.test(error.message ?? '');

const performWrite = async (
  userId: string,
  rowId: string,
  requestId: string,
  amountMl: number,
  source: HydrationSource,
  reportedAt?: string,
  verificationSource: VerificationSource = 'user-reported'
): Promise<HydrationLogResult> => {
  // Fast path: this exact request was already written on this device.
  if (await wasProcessed(rowId)) {
    const totals = await getTodayTotals(userId);
    console.log('[Hydration] Ignoring duplicate request:', requestId);
    return { status: 'duplicate', requestId, amountMl, ...totals };
  }

  const timestamp = new Date().toISOString();
  const actualReportedAt = reportedAt || timestamp;

  const baseRow = {
    id: rowId,
    user_id: userId,
    timestamp: timestamp,
    amount_ml: amountMl,
    source,
  };

  const row = {
    ...baseRow,
    reported_at: actualReportedAt,
    verification_source: verificationSource,
  };

  let { data, error } = await supabase.from(LOGS_TABLE).insert(row).select();

  // `reported_at` / `verification_source` were added to the write before they
  // were added to the table. PostgREST answers an unknown column with PGRST204
  // (schema cache) or 42703 (undefined_column) and rejects the whole insert —
  // which is what silently broke *every* path that logs water, chat included.
  // The columns are optional metadata, so a database that predates the
  // migration still gets the entry rather than an error the user can't act on.
  if (error && isUnknownColumnError(error)) {
    console.warn(
      '[Hydration] Table is missing reported_at/verification_source; ' +
        'writing without them. Run supabase/migrations to restore backdating.'
    );
    ({ data, error } = await supabase.from(LOGS_TABLE).insert(baseRow).select());
  }

  if (error && error.code !== '23505') {
    console.error('[Hydration] Insert failed:', error.message, error.details);
    const totals = await getTodayTotals(userId);
    return { status: 'error', requestId, amountMl, error: error.message, ...totals };
  }

  await rememberProcessed(rowId);
  const totals = await getTodayTotals(userId);

  if (error) {
    console.log('[Hydration] Duplicate suppressed by primary key:', rowId);
    return { status: 'duplicate', requestId, amountMl, ...totals };
  }

  const entry = data?.[0] ? mapRow(data[0]) : mapRow(row);
  const result: HydrationLogResult = { status: 'logged', requestId, amountMl, entry, ...totals };

  // Settling the reminders is a side effect of the entry, not part of it, so
  // it is deliberately *not* awaited. Awaiting it made the user's confirmation
  // hostage to the OS: notifee's scheduling stalled behind other native work
  // and the chat sat on "Saving…" indefinitely for a row that was already
  // safely written.
  //
  // The two steps are chained rather than fired together because the order
  // matters. Resolving clears the reminder out of the tray; the reschedule
  // sweeps the tray to catch deliveries that never reached JS. Run the other
  // way round, that sweep would find the reminder this very entry answers and
  // raise it again — the user would log a drink and be asked for one a moment
  // later.
  const settleReminders = async () => {
    // An outstanding reminder is a question, and an entry answers it however
    // the user got there. A correction is not an answer: it takes millilitres
    // back off the day, so it must not settle a reminder asking for more.
    // The amount goes through so the bell menu can say what was actually
    // logged against the reminder, rather than only that it was opened.
    if (amountMl > 0) {
      // Stamped before anything that can stall: the re-queue below is the
      // slow, OS-bound half, and a reminder firing while it is still in
      // flight is exactly the case the stamp exists to catch. See
      // `NotificationService.suppressIfRecentlyHydrated`.
      await NotificationService.noteIntakeLogged();
      await NotificationService.resolveActiveReminder(amountMl);
    }
    await NotificationService.scheduleHydrationReminders();
  };

  settleReminders().catch(reminderError => {
    console.error('[Hydration] Failed to settle reminders:', reminderError);
  });

  ChatBus.emitHydrationLogged(result);
  return result;
};

/**
 * Records an intake entry.
 * Validates against future dates, negative values, and unrealistic amounts.
 */
export const logWater = async (params: LogWaterParams): Promise<HydrationLogResult & { needsConfirmation?: boolean }> => {
  const { amountMl, source = 'ai_chat', requestId, reportedAt, verificationSource, confirmed } = params;
  const id = requestId ?? generateRequestId(source);
  const rounded = Math.round(amountMl);

  // 1. Basic Validation. A correction is the one entry allowed to be negative
  //    — see `adjustIntake`, which is the only caller that sets that source.
  const allowNegative = source === 'correction';
  if (!Number.isFinite(rounded) || (allowNegative ? rounded === 0 : rounded <= 0)) {
    return {
      status: 'error',
      requestId: id,
      amountMl: rounded,
      error: 'Amount must be positive',
      totalMl: 0,
      targetMl: DEFAULT_TARGET_ML,
    };
  }

  // Block future intake
  if (reportedAt && new Date(reportedAt).getTime() > Date.now()) {
    return {
      status: 'error',
      requestId: id,
      amountMl: rounded,
      error: 'Future water intake cannot be logged',
      totalMl: 0,
      targetMl: DEFAULT_TARGET_ML,
    };
  }

  const userId = await AuthService.getCurrentUserId();
  if (!userId) {
    console.warn('[Hydration] Cannot log: no authenticated user.');
    return {
      status: 'unauthenticated',
      requestId: id,
      amountMl: rounded,
      totalMl: 0,
      targetMl: DEFAULT_TARGET_ML,
    };
  }

  // 2. Realism Check vs 7-day rolling average. A correction is bounded by the
  //    day's total instead (it can only give back what was logged), so the
  //    "unusually large" question does not apply to it.
  if (!confirmed && !allowNegative) {
    const rollingAvg = await HydrationService.getRolling7DayIntakeAvg(userId);
    const threshold = Math.max(WATER_LOG_LIMITS.DEFAULT_MAX_SINGLE_ML, rollingAvg * WATER_LOG_LIMITS.UNREALISTIC_FACTOR);

    if (rounded > threshold) {
      return {
        status: 'error',
        requestId: id,
        amountMl: rounded,
        needsConfirmation: true,
        error: 'Unusually large intake detected. Please confirm.',
        totalMl: 0,
        targetMl: DEFAULT_TARGET_ML,
      };
    }
  }

  const rowId = buildRowId(userId, id);
  const existing = inFlight.get(rowId);
  if (existing) return existing;

  const pending = performWrite(userId, rowId, id, rounded, source, reportedAt, verificationSource).catch(error => {
    console.error('[Hydration] Fatal error while logging:', error);
    return {
      status: 'error' as const,
      requestId: id,
      amountMl: rounded,
      error: String(error?.message ?? error),
      totalMl: 0,
      targetMl: DEFAULT_TARGET_ML,
    };
  });

  inFlight.set(rowId, pending);
  try {
    return await pending;
  } finally {
    inFlight.delete(rowId);
  }
};

/**
 * Takes back part of today's intake.
 *
 * The chat could log water but never un-log it, so a user who said "reduce 4
 * litres" had the text read as an *intake* of 4,000ml — which tripped the
 * realism check, returned an error, and left the dashboard unchanged. There
 * was no way at all to correct a mis-log.
 *
 * A correction is written as a negative row rather than by deleting the
 * original: the day's history stays an append-only record, the total falls out
 * of the same sum, and "I logged 2 litres by mistake" is preserved as
 * something the user said rather than erased.
 *
 * @param amountMl A positive number — how much to give back.
 */
export const adjustIntake = async (params: {
  amountMl: number;
  requestId?: string;
  reason?: string;
}): Promise<HydrationLogResult & { adjustedMl?: number }> => {
  const requestId = params.requestId ?? generateRequestId('correction');
  const requested = Math.round(Math.abs(params.amountMl));

  const userId = await AuthService.getCurrentUserId();
  if (!userId) {
    return {
      status: 'unauthenticated',
      requestId,
      amountMl: 0,
      totalMl: 0,
      targetMl: DEFAULT_TARGET_ML,
    };
  }

  const totals = await getTodayTotals(userId);

  if (totals.totalMl <= 0) {
    return {
      status: 'error',
      requestId,
      amountMl: 0,
      error: 'Nothing logged today to take back.',
      ...totals,
    };
  }

  // Never below zero: a day's intake that reads as negative is not a fact
  // about anything. Asking to remove more than was logged clears the day.
  const adjustedMl = Math.min(requested, totals.totalMl);

  const result = await logWater({
    amountMl: -adjustedMl,
    source: 'correction',
    requestId,
    confirmed: true,
  });

  return { ...result, adjustedMl };
};

export const HydrationService = {
  logWater,
  adjustIntake,
  getTodayTotals,
  fetchTodayLogs,
  fetchTodayLogsResult,
  fetchLogsForDays,
  getRolling7DayIntakeAvg,
  generateRequestId,
  DEFAULT_TARGET_ML,
};

export default HydrationService;
