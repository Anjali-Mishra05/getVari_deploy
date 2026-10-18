import { supabase } from '../../services/SupabaseClient';
import { User, Workload, WaterEntry } from '../types';
import { accountStartDate } from '../../utils/pbwr';
import { storedTargetForToday } from '../../utils/dailyTargetRecord';
import { targetFromProfile } from '../../utils/hydrationTarget';
import { describeSleepWindow, normaliseSleepSchedule } from '../../utils/sleepWindow';
import { steadyStateRisk } from '../../utils/appRiskModel';
import AppConfigStore, { validate } from '../../config/appConfigStore';
import PBWRService from '../../services/PBWRService';
import {
  UserClock,
  clockForProfile,
  formatUserTime,
  startOfUserDay,
  userDateKey,
  wallClockShiftMs,
} from '../utils/userClock';

/**
 * Where every number on the admin's user screens comes from.
 *
 * The rule is "show what the app shows", so each value is read from the
 * source the app reads, or computed by the function the app computes it with:
 *
 *  - Profile details: the `profile` blob on `getvari_profiles`, normalised as
 *    `ProfileService.fetchProfileResult` normalises it.
 *  - Today's intake: rows of `getvari_hydration_logs` since the user's own
 *    midnight, by write time (`timestamp`), corrections included — the
 *    dashboard's `HydrationService.fetchTodayLogs`.
 *  - Daily goal: the Final Daily Target the app stored for the user's date,
 *    else the same PBWR pipeline the app runs on its first open of the day.
 *  - Risk: `steadyStateRisk`, the dashboard's own solve with the simulation's
 *    noise taken out. The app never stores its score, so this is the closest
 *    the panel can get; the drawer says so.
 *  - Readings: the simulated stream's baseline for this profile — the app
 *    has no wearable data to share.
 */

const PROFILES_TABLE = 'getvari_profiles';
const LOGS_TABLE = 'getvari_hydration_logs';
const CONFIG_TABLE = 'getvari_app_config';
/** PostgREST answers at most 1000 rows per request by default. */
const PAGE_SIZE = 1000;
/** Points on the recomputed risk trend, one per hour, ending now. */
const RISK_TREND_POINTS = 7;

/** Reads every row a query matches, a page at a time, or throws. */
const fetchAllRows = async (build: () => any): Promise<any[]> => {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message ?? String(error));
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
};

/**
 * Adopt the configuration the phones are running on.
 *
 * Activity levels, climate bands and risk thresholds all feed the risk solve,
 * so solving with the shipped defaults while the phones run an edited config
 * would give different numbers. The phones get the document through the
 * backend's `GET /config`, which merges the stored row over the defaults and
 * skips empty sections; this applies the same merge to the same row.
 */
const adoptPhoneConfig = async (): Promise<void> => {
  const { data, error } = await supabase
    .from(CONFIG_TABLE)
    .select('config, version, updated_at')
    .eq('id', 'active')
    .maybeSingle();
  if (error) throw new Error(`App config could not be read: ${error.message}`);

  const stored = (data && !Array.isArray(data) ? data.config : null) ?? {};
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stored)) {
    // `main.py` ignores an empty section rather than adopting it.
    if (value === null || (Array.isArray(value) && value.length === 0)) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) continue;
    merged[key] = value;
  }
  const config = validate(merged);
  if (config) AppConfigStore.adopt(config);
};

/** The profile as `ProfileService.fetchProfileResult` hands it to the app. */
const normaliseProfile = (row: any, clock: UserClock) => {
  const raw = row.profile || {};
  const stored = { ...raw, accountCreatedAt: accountStartDate(row.created_at, raw.accountCreatedAt) };
  const targetDailyMl = storedTargetForToday(stored, userDateKey(clock)) ?? targetFromProfile(stored);
  return { ...stored, targetDailyMl };
};

const workloadFor = (activityLevel?: string): Workload =>
  activityLevel === 'active' || activityLevel === 'elite'
    ? 'Gym'
    : activityLevel === 'moderate'
    ? 'Commuter'
    : 'Office';

const toEntry = (log: any, clock: UserClock): WaterEntry => ({
  id: log.id,
  time: formatUserTime(clock, new Date(log.timestamp).getTime()),
  timestamp: log.timestamp,
  amount: Number(log.amount_ml) || 0,
  source: log.source ?? 'manual',
  isCorrection: log.source === 'correction' || Number(log.amount_ml) < 0,
});

export class SupabaseAdminService {
  /**
   * Every profile row with today's intake, goal and risk, as the app would
   * show them. Throws when anything cannot be read, so a failure is shown as
   * a failure rather than as an empty user list.
   */
  static async fetchAllUsers(nowMs: number = Date.now()): Promise<User[]> {
    try {
      await adoptPhoneConfig();
    } catch (error) {
      // Same as a phone that cannot reach the backend: carry on with the
      // config already in hand rather than show nothing.
      console.warn('[SupabaseAdminService]', error);
    }

    const profiles = await fetchAllRows(() => supabase.from(PROFILES_TABLE).select('*').order('id'));

    // One read covers every user's "today": the earliest midnight across all
    // zones, then each user is cut at their own.
    const clocks = new Map<string, UserClock>(
      profiles.map(p => [p.id, clockForProfile(p.profile, nowMs)])
    );
    const earliestMidnight = Math.min(
      startOfUserDay(clockForProfile(null, nowMs), nowMs),
      ...[...clocks.values()].map(clock => startOfUserDay(clock, nowMs))
    );
    const logs = await fetchAllRows(() =>
      supabase
        .from(LOGS_TABLE)
        .select('*')
        .gte('timestamp', new Date(earliestMidnight).toISOString())
        .order('timestamp', { ascending: true })
    );

    // A number that owns several rows is one person; the app signs them in to
    // one of them. Flagged rather than hidden — which row the app picks
    // depends on how the user signed in, which the panel cannot see.
    const rowsByPhone = new Map<string, number>();
    for (const p of profiles) {
      if (p.phone_number) rowsByPhone.set(p.phone_number, (rowsByPhone.get(p.phone_number) ?? 0) + 1);
    }

    return Promise.all(
      profiles.map(async p => {
        const clock = clocks.get(p.id)!;
        const profile = normaliseProfile(p, clock);
        const midnight = startOfUserDay(clock, nowMs);
        const todayLogs = logs.filter(
          l => l.user_id === p.id && new Date(l.timestamp).getTime() >= midnight
        );
        const waterIntakeMl = todayLogs.reduce((sum, l) => sum + (Number(l.amount_ml) || 0), 0);
        const shift = wallClockShiftMs(clock, nowMs);

        // The goal the dashboard shows: today's stored final, else the same
        // pipeline the app runs on its first open of the day.
        let targetDailyMl: number | null = storedTargetForToday(profile, userDateKey(clock, nowMs));
        if (targetDailyMl === null && profile.targetDailyMl !== null) {
          try {
            const breakdown = await PBWRService.calculatePBWR(profile, waterIntakeMl, p.id);
            targetDailyMl = Number.isFinite(breakdown.finalTarget) && breakdown.finalTarget > 0
              ? breakdown.finalTarget
              : null;
          } catch (error) {
            console.warn('[SupabaseAdminService] PBWR failed for', p.id, error);
          }
        }
        if (targetDailyMl === null) targetDailyMl = profile.targetDailyMl ?? null;

        const risk = steadyStateRisk(profile, todayLogs, nowMs, shift);

        // The same solve at each of the last few hours, over the entries the
        // app would have had then. Recomputed, not recorded: the app keeps
        // no history of its score.
        const riskTrend: (number | null)[] = [];
        for (let i = RISK_TREND_POINTS - 1; i >= 0; i--) {
          const at = nowMs - i * 3_600_000;
          const dayStart = startOfUserDay(clock, at);
          const logsThen = todayLogs.filter(l => {
            const t = new Date(l.timestamp).getTime();
            return t >= dayStart && t <= at;
          });
          riskTrend.push(steadyStateRisk(profile, logsThen, at, wallClockShiftMs(clock, at)).output.score);
        }

        const lastLogAt = todayLogs.length
          ? new Date(todayLogs[todayLogs.length - 1].timestamp).getTime()
          : 0;
        const profileSavedAt = p.updated_at ? new Date(p.updated_at).getTime() : 0;
        const lastActiveTime = Math.max(profileSavedAt, lastLogAt);
        const schedule = normaliseSleepSchedule(profile);
        const config = AppConfigStore.current();

        const user: User = {
          id: p.id,
          name: profile.fullName || profile.name || `User ${String(p.id).substring(0, 5)}`,
          email: profile.email,
          age: Number(profile.age) || 0,
          gender: profile.gender || 'Unknown',
          weightKg: Number(profile.weightKg) || 0,
          workload: workloadFor(profile.activityLevel),
          heartRate: risk.readings.heartRate,
          activityLoad: risk.readings.activityLoad,
          temperature: risk.readings.temperature,
          humidity: risk.readings.humidity,
          batteryLevel: risk.readings.batteryLevel,
          rssi: risk.readings.rssi,
          firmwareVersion: null,
          lastSynced: lastActiveTime > 0 ? new Date(lastActiveTime).toLocaleString() : 'Never',
          lastSyncedMinutes: lastActiveTime > 0 ? Math.floor((nowMs - lastActiveTime) / 60000) : null,
          riskScore: risk.output.score,
          status: risk.output.status,
          riskMeaning: risk.output.meaning,
          riskSuggestedAction: risk.output.suggestedAction,
          hoursSinceDrink: risk.hoursSinceDrink,
          waterIntakeMl,
          targetDailyMl,
          riskHistory: riskTrend,
          waterHistory: todayLogs.map(l => toEntry(l, clock)),
          phone: p.phone_number || undefined,
          duplicateRowCount: p.phone_number ? (rowsByPhone.get(p.phone_number) ?? 1) - 1 : 0,
          clock,
          activityLabel:
            config.activityLevels.find(level => level.id === profile.activityLevel)?.title ?? 'Not set',
          sleepWindowLabel: schedule ? describeSleepWindow(schedule) : 'Not set',
          city: profile.location ?? profile.selectedCity ?? null,
          profileUpdatedAt: p.updated_at ?? null,
          fullProfile: profile,
        };
        return user;
      })
    );
  }

  /**
   * Fleet totals for today, each user's day cut at their own midnight — the
   * sum of the per-user totals the user list shows.
   */
  static fleetStats(users: User[]): { totalWaterMl: number; totalUsers: number; distinctPeople: number } {
    const people = new Set(users.map(u => u.phone ?? u.id));
    return {
      totalWaterMl: users.reduce((sum, u) => sum + u.waterIntakeMl, 0),
      totalUsers: users.length,
      distinctPeople: people.size,
    };
  }

  /** Every hydration row, oldest first, or throws. */
  static async fetchAllHydrationLogs() {
    return fetchAllRows(() =>
      supabase.from(LOGS_TABLE).select('*').order('timestamp', { ascending: true })
    );
  }
}
