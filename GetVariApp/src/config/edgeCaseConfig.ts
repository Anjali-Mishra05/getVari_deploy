/**
 * Centralized Configuration for Data Validation and Notification Safety.
 *
 * Enforces "Missing != Zero" and provides strictly valid ranges for sensors.
 */

export const SENSOR_LIMITS = {
  HEART_RATE: { min: 40, max: 220, unit: 'BPM' },
  TEMPERATURE: { min: 15, max: 45, unit: '°C' },
  HUMIDITY: { min: 10, max: 100, unit: '%' },
  STEPS_DAILY: { min: 0, max: 50000, unit: 'Steps' },
  ACTIVITY_LOAD: { min: 0, max: 100, unit: '%' },
  BATTERY: { min: 0, max: 100, unit: '%' },
};

/**
 * Persistent sensor/device error thresholds.
 * Readings outside limits for this long trigger "Device Error".
 */
export const DEVICE_ERROR_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour of bad data

export const STALENESS_LIMIT_MS = 15 * 60 * 1000; // 15 minutes

export const NOTIFICATION_COOLDOWNS = {
  RISK_ALERT: 30 * 60 * 1000, // 30 minutes for elevated/high risk
  HYDRATION_REMINDER: 2 * 60 * 60 * 1000, // 2 hours
  LOW_BATTERY: 6 * 60 * 60 * 1000, // 6 hours
  ENVIRONMENTAL_ALERT: 24 * 60 * 60 * 1000, // once per day
  INACTIVITY_REMINDER: 3 * 60 * 60 * 1000, // 3 hours
  GOAL_ACHIEVED: 24 * 60 * 60 * 1000, // Once per day
  WEEKLY_SUMMARY: 7 * 24 * 60 * 60 * 1000, // Once per week
  /**
   * Floor on the gap between any two engine notifications.
   *
   * The engine re-evaluates every condition on each telemetry tick, so a phone
   * that is hot, humid, at elevated risk and three hours without a drink has
   * four true conditions the moment the dashboard mounts — and delivered all
   * four in the same second. Conditions that stay true are simply re-raised on
   * a later tick, so spacing costs nothing but the clump.
   */
  MIN_GAP_BETWEEN_ALERTS: 30 * 60 * 1000, // 30 minutes
  /**
   * Focus and cognitive alerts share one cooldown: any of the four blocks the
   * others for this long. They are forecasts, not emergencies, and hearing
   * about your focus every half hour is exactly the nagging that gets the
   * app's notifications turned off.
   */
  FOCUS_COGNITIVE_ALERT: 24 * 60 * 60 * 1000, // scheduled checks are once per slot/day
  /**
   * Nothing is delivered for this long after the app is opened (cold start,
   * login, or a return to the foreground). The welcome is the one exception:
   * the spec defines it as "immediately after login". The sleep window still
   * outranks both.
   */
  LOGIN_QUIET_MS: 5 * 60 * 1000, // 5 minutes
  /**
   * A scheduled notification delivered later than this after its own time is
   * treated as missed (device off, doze, reboot) and dropped rather than sent
   * late.
   */
  MISSED_DELIVERY_TOLERANCE_MS: 15 * 60 * 1000,
  /** Risk Improved only follows a risk alert delivered within this window. */
  RISK_IMPROVED_FOLLOW_UP_MS: 2 * 60 * 60 * 1000,
  /**
   * How old the last live risk/FDI/CDI reading may be when a fixed-time
   * conditional notification (Risk Improved, Focus, Priority) is checked.
   * Older than this counts as missing, and missing is not a pass.
   */
  CONDITION_SNAPSHOT_MAX_AGE_MS: 15 * 60 * 1000,
};

/**
 * Activity load at or above this counts as significant motion — the same
 * threshold the engine uses for an active session. FDI's time-since-motion
 * input is measured from the last reading at or above it.
 */
export const SIGNIFICANT_MOTION_ACTIVITY_LOAD = 50;

/**
 * Temporary simulation mode.
 *
 * While `ENABLED`, Elevated Risk, Risk Improved, Focus Alert and Priority
 * Alert (plus three extra Hydration Reminders) come from the fixed daily
 * simulation timeline in `NotificationService.SIMULATED_SCHEDULE_SLOTS`, and
 * the engine does not raise those four from live data — otherwise the user
 * would get each one twice. Switching it off cancels the simulated queue and
 * hands the four back to the live, event-driven triggers.
 */
export const NOTIFICATION_SIMULATION = {
  ENABLED: true,
  /**
   * Whether the fixed Risk Improved (11:30 / 20:30), Focus (12:30 / 16:00)
   * and Priority (14:30 / 18:30) slots check their condition — risk < 40
   * after a risk alert, FDI >= 60, CDI >= 60 — before delivering.
   *
   * Off for now: all six are delivered at their fixed times regardless of the
   * readings. Sleep window, the post-open quiet period and missed-delivery
   * rules still apply.
   */
  CHECK_FIXED_SLOT_CONDITIONS: false,
};

/** High Temperature fires for 30 <= t < 34 °C, once per day. */
export const HIGH_TEMP_RANGE_C = { min: 30, maxExclusive: 34 };
/** High Humidity fires at or above this relative humidity, once per day. */
export const HIGH_HUMIDITY_MIN_PCT = 70;
/** Focus Alert (FDI) and Priority Alert (CDI) fire at or above this index. */
export const DROP_INDEX_ALERT_THRESHOLD = 60;

export const RISK_THRESHOLDS = {
  ELEVATED: 60,
  HIGH: 80,
  RECOVERY: 40,
};

export const WATER_LOG_LIMITS = {
  UNREALISTIC_FACTOR: 2, // 2x the 7-day rolling average
  DEFAULT_MAX_SINGLE_ML: 1500, // fallback ceiling before confirmation
  ABS_MAX_SINGLE_ML: 5000, // Hard limit for any single entry
};

/**
 * Validates a sensor reading against centralized limits.
 * Returns null if the value is missing, NaN, or physically impossible.
 */
export const validateSensorReading = (value: any, limits: { min: number; max: number }): number | null => {
  if (value === null || value === undefined || typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    return null;
  }
  if (value < limits.min || value > limits.max) {
    return null;
  }
  return value;
};

export default {
  SENSOR_LIMITS,
  DEVICE_ERROR_THRESHOLD_MS,
  STALENESS_LIMIT_MS,
  NOTIFICATION_COOLDOWNS,
  RISK_THRESHOLDS,
  WATER_LOG_LIMITS,
  validateSensorReading,
};
