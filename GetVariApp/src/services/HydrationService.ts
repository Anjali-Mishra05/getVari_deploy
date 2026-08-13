import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './SupabaseClient';
import { AuthService } from './AuthService';
import NotificationService from './NotificationService';
import ChatBus from './ChatBus';
import type {
  HydrationLog,
  HydrationLogResult,
  HydrationSource,
  HydrationTotals,
} from '../types';

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

const fetchTargetMl = async (userId: string): Promise<number> => {
  try {
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .select('profile')
      .eq('id', userId)
      .maybeSingle();

    if (error) return DEFAULT_TARGET_ML;
    const target = Number(data?.profile?.targetDailyMl);
    return Number.isFinite(target) && target > 0 ? target : DEFAULT_TARGET_ML;
  } catch {
    return DEFAULT_TARGET_ML;
  }
};

const mapRow = (row: any): HydrationLog => ({
  id: row.id,
  timestamp: row.timestamp,
  amountMl: row.amount_ml,
  source: row.source,
});

/** Today's entries, newest first. */
export const fetchTodayLogs = async (userId?: string | null): Promise<HydrationLog[]> => {
  const id = userId ?? (await AuthService.getCurrentUserId());
  if (!id) return [];

  const { data, error } = await supabase
    .from(LOGS_TABLE)
    .select('*')
    .eq('user_id', id)
    .gte('timestamp', startOfTodayIso())
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('[Hydration] Failed to fetch today logs:', error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
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

const performWrite = async (
  userId: string,
  rowId: string,
  requestId: string,
  amountMl: number,
  source: HydrationSource
): Promise<HydrationLogResult> => {
  // Fast path: this exact request was already written on this device.
  if (await wasProcessed(rowId)) {
    const totals = await getTodayTotals(userId);
    console.log('[Hydration] Ignoring duplicate request:', requestId);
    return { status: 'duplicate', requestId, amountMl, ...totals };
  }

  const row = {
    id: rowId,
    user_id: userId,
    timestamp: new Date().toISOString(),
    amount_ml: amountMl,
    source,
  };

  const { data, error } = await supabase.from(LOGS_TABLE).insert(row).select();

  // 23505 = unique violation. The row id already exists, which means this
  // request was processed before (a retry, a replayed notification, a second
  // device). Treat it as success without creating a second entry.
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

  // Something was logged, so the "you haven't logged" countdown restarts.
  try {
    await NotificationService.scheduleHydrationReminders();
  } catch (reminderError) {
    console.error('[Hydration] Failed to reset reminders:', reminderError);
  }

  ChatBus.emitHydrationLogged(result);
  return result;
};

/**
 * Records an intake entry. Safe to call twice with the same `requestId` —
 * the second call reports `duplicate` and writes nothing.
 */
export const logWater = async ({
  amountMl,
  source = 'ai_chat',
  requestId,
}: LogWaterParams): Promise<HydrationLogResult> => {
  const id = requestId ?? generateRequestId(source);
  const rounded = Math.round(amountMl);

  if (!Number.isFinite(rounded) || rounded <= 0 || rounded > MAX_SINGLE_ENTRY_ML) {
    return {
      status: 'error',
      requestId: id,
      amountMl: rounded,
      error: 'Amount out of range',
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

  const rowId = buildRowId(userId, id);

  // Collapse concurrent calls for the same request onto one round trip.
  const existing = inFlight.get(rowId);
  if (existing) return existing;

  const pending = performWrite(userId, rowId, id, rounded, source).catch(error => {
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

export const HydrationService = {
  logWater,
  getTodayTotals,
  fetchTodayLogs,
  generateRequestId,
  DEFAULT_TARGET_ML,
};

export default HydrationService;
