import { ActivityEvent } from '../types';
import { mockUsers } from '../data/mockData';

const makeId = (prefix = 'EV') => `${prefix}_${Math.random().toString(36).slice(2,9)}`;

// Simple mock activity generator for a given userId.
export const fetchEventsForUser = async (userId: string): Promise<ActivityEvent[]> => {
  // In real implementation replace this with an API call.
  const user = mockUsers.find(u => u.id === userId);
  if (!user) return [];

  const now = Date.now();
  const events: ActivityEvent[] = [];

  // Account created
  events.push({
    eventId: makeId('EV'),
    userId,
    eventType: 'account_created',
    category: 'Auth',
    actor: 'User',
    title: 'Account created',
    description: `Account registered for ${user.name}`,
    timestamp: new Date(now - 1000 * 60 * 60 * 24 * 90).toISOString(),
    status: 'success'
  });

  // Onboarding finished
  events.push({
    eventId: makeId('EV'),
    userId,
    eventType: 'onboarding_completed',
    category: 'Onboarding',
    actor: 'User',
    title: 'Onboarding completed',
    description: 'User completed onboarding flow',
    timestamp: new Date(now - 1000 * 60 * 60 * 24 * 85).toISOString(),
    status: 'success'
  });

  // Profile created/edited
  events.push({
    eventId: makeId('EV'),
    userId,
    eventType: 'profile_set',
    category: 'Profile',
    actor: 'User',
    title: 'Profile details added',
    description: `Age ${user.age}, Weight ${user.weightKg}kg, Gender ${user.gender}`,
    timestamp: new Date(now - 1000 * 60 * 60 * 24 * 60).toISOString(),
    status: 'success'
  });

  // BLE connect/disconnect events
  events.push({
    eventId: makeId('EV'),
    userId,
    eventType: 'ble_device_found',
    category: 'Device',
    actor: 'System',
    title: 'BLE device discovered',
    description: 'Nearby GetVari sensor discovered during scan',
    timestamp: new Date(now - 1000 * 60 * 60 * 24 * 7).toISOString(),
    status: 'success'
  });

  events.push({
    eventId: makeId('EV'),
    userId,
    eventType: 'ble_connected',
    category: 'Device',
    actor: 'User',
    title: 'Device connected',
    description: 'User connected their BLE sensor',
    timestamp: new Date(now - 1000 * 60 * 60 * 24 * 7 + 1000 * 60 * 3).toISOString(),
    status: 'success'
  });

  // Telemetry samples
  events.push({
    eventId: makeId('EV'),
    userId,
    eventType: 'telemetry_received',
    category: 'Telemetry',
    actor: 'System',
    title: 'Sensor telemetry received',
    description: `HR ${user.heartRate} BPM, Temp ${user.temperature} °C`,
    timestamp: new Date(now - 1000 * 60 * 60 * 24 * 1).toISOString(),
    status: 'success',
    metadata: { heartRate: user.heartRate }
  });

  // Water intake entries from mock history
  for (let i = 0; i < (user.waterHistory || []).length; i++) {
    const wh = user.waterHistory[i];
    events.push({
      eventId: makeId('EV'),
      userId,
      eventType: 'water_intake_added',
      category: 'Intake',
      actor: 'User',
      title: 'Water intake recorded',
      description: `${wh.amount} ml added at ${wh.time}`,
      timestamp: new Date(now - 1000 * 60 * 60 * (24 - i)).toISOString(),
      status: 'success',
      metadata: { amount: wh.amount }
    });
  }

  // AI interaction example
  events.push({
    eventId: makeId('EV'),
    userId,
    eventType: 'ai_recommendation',
    category: 'AI',
    actor: 'AI',
    title: 'Hydration recommendation',
    description: 'AI suggested daily water target increase based on recent telemetry and low intake',
    timestamp: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
    status: 'success',
    metadata: {
      oldTargetMl: user.targetDailyMl,
      newTargetMl: user.targetDailyMl + 200,
      reason: 'Low recent water intake and elevated sweat GSR',
      recommendation: 'Increase daily target by 200 ml and drink 300 ml within 30 minutes',
      userResponse: 'Completed',
      outcome: { oldRisk: user.riskScore, newRisk: Math.max(0, user.riskScore - 14) }
    }
  });

  // Error example
  events.push({
    eventId: makeId('EV'),
    userId,
    eventType: 'sync_failed',
    category: 'Error',
    actor: 'System',
    title: 'Sync failed',
    description: 'Device sync failed due to timeout',
    timestamp: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
    status: 'failed'
  });

  // Sort ascending (oldest first)
  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return Promise.resolve(events);
};

export default {
  fetchEventsForUser,
};
