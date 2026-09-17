import { SensorData, MockTelemetryProfile, UserProfile } from '../types';
import { TelemetrySnapshot } from './TelemetryHistoryService';

/**
 * Isolated service for generating MOCK primary telemetry.
 * This will later be replaced by real BLE/Sensor streams.
 */
export class MockTelemetryService {
  /**
   * Maps UserProfile to a MockTelemetryProfile for deterministic history.
   */
  static getProfileForUser(profile: UserProfile): MockTelemetryProfile {
    if (profile.medicalConditions?.includes('critical')) return 'critical_risk';

    const hotCities = ['Dubai', 'Phoenix', 'Las Vegas', 'Cairo', 'Riyadh'];
    if (profile.selectedCity && hotCities.includes(profile.selectedCity)) return 'heat_stress';
    if (profile.location && hotCities.some(c => profile.location?.includes(c))) return 'heat_stress';

    if (profile.activityLevel === 'active' || profile.activityLevel === 'elite') return 'active';
    if (profile.activityLevel === 'sedentary') return 'sedentary';

    return 'balanced';
  }

  /**
   * Generates a deterministic TelemetrySnapshot for a specific date.
   */
  static getMockHistoricalSnapshot(userId: string, profile: UserProfile, date: string): TelemetrySnapshot {
    const mockProfile = this.getProfileForUser(profile);
    // Use the date string as part of the seed for determinism
    const dateSeed = this.hashString(userId + date);
    const timestamp = new Date(date).getTime();

    // We use getMockPrimaryTelemetry but adjust it for a daily average
    const data = this.getMockPrimaryTelemetry(userId, mockProfile, timestamp);

    return {
      date,
      avgTemp: data.temperature,
      avgHumidity: data.humidity,
      totalSteps: data.steps,
      avgHeartRate: data.heartRate,
      isMock: true,
    };
  }

  /**
   * Generates deterministic primary biometric data for a user.
   * Secondary data like hydrationScore is NOT generated here as it must be calculated.
   */
  static getMockPrimaryTelemetry(userId: string, profile?: MockTelemetryProfile, timestamp: number = Date.now()): Omit<SensorData, 'hydrationScore'> {
    // Deterministic seed from userId
    const seed = this.hashString(userId);
    const selectedProfile = profile || this.getDefaultProfile(seed);

    // Time-based variation (sine wave) + User-based offset to make data unique per user
    const variation = Math.sin((timestamp / 60000) + (seed % 100));

    let heartRate = 70;
    let activityLoad = 20;
    let temperature = 24;
    let humidity = 45;
    let sweatGSR = 1.5;
    let steps = 2000;
    let lastSignificantMotionMinutesAgo = 15;

    switch (selectedProfile) {
      case 'sedentary':
        heartRate = 65 + variation * 5;
        activityLoad = 10 + variation * 5;
        temperature = 22 + variation * 0.5;
        humidity = 40 + variation * 2;
        steps = 1500 + variation * 200;
        lastSignificantMotionMinutesAgo = 45;
        break;
      case 'active':
        heartRate = 110 + variation * 15;
        activityLoad = 75 + variation * 10;
        temperature = 28 + variation * 1.5;
        humidity = 55 + variation * 5;
        sweatGSR = 8.0 + variation * 2;
        steps = 12000 + variation * 1000;
        lastSignificantMotionMinutesAgo = 5;
        break;
      case 'heat_stress':
        heartRate = 95 + variation * 10;
        activityLoad = 40 + variation * 10;
        temperature = 34 + variation * 2;
        humidity = 75 + variation * 10;
        sweatGSR = 12.0 + variation * 3;
        steps = 4000 + variation * 500;
        lastSignificantMotionMinutesAgo = 25;
        break;
      case 'critical_risk':
        heartRate = 145 + variation * 10;
        activityLoad = 90 + variation * 5;
        temperature = 37 + variation * 1.5;
        humidity = 85 + variation * 5;
        sweatGSR = 15.0 + variation * 2;
        steps = 18000 + variation * 1000;
        lastSignificantMotionMinutesAgo = 40;
        break;
      case 'balanced':
      default:
        heartRate = 75 + variation * 10;
        activityLoad = 30 + variation * 15;
        temperature = 25 + variation * 1.0;
        humidity = 50 + variation * 5;
        steps = 5500 + variation * 500;
        lastSignificantMotionMinutesAgo = 20;
        break;
    }

    return {
      heartRate: Math.round(heartRate),
      steps: Math.round(steps),
      activityLoad: Math.round(activityLoad),
      temperature: Number(temperature.toFixed(1)),
      humidity: Math.round(humidity),
      sweatGSR: Number(sweatGSR.toFixed(2)),
      batteryLevel: 85,
      rssi: -60,
      lastUpdated: new Date(timestamp).toISOString(),
      lastSignificantMotionMinutesAgo,
    };
  }

  private static hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  private static getDefaultProfile(seed: number): MockTelemetryProfile {
    // Specifically force ~5 users into critical state for testing (28 users total)
    if (seed % 6 === 0) return 'critical_risk';

    const profiles: MockTelemetryProfile[] = ['sedentary', 'active', 'heat_stress', 'balanced'];
    return profiles[seed % profiles.length];
  }
}

export default MockTelemetryService;
