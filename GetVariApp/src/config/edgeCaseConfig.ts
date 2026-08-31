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
  ENVIRONMENTAL_ALERT: 3 * 60 * 60 * 1000, // 3 hours
  INACTIVITY_REMINDER: 3 * 60 * 60 * 1000, // 3 hours
  GOAL_ACHIEVED: 24 * 60 * 60 * 1000, // Once per day
  WEEKLY_SUMMARY: 7 * 24 * 60 * 60 * 1000, // Once per week
};

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
