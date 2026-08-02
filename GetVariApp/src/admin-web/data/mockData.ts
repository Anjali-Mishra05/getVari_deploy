import { User, Feedback, Alert, LogEntry } from '../types';

export const mockUsers: User[] = [
  {
    id: 'GV_USR_101',
    name: 'Priscilla Vance',
    age: 28,
    gender: 'Female',
    weightKg: 62,
    workload: 'Gym',
    heartRate: 152,
    activityLoad: 92,
    temperature: 34.8,
    humidity: 60,
    sweatGSR: 8.8,
    batteryLevel: 12,
    rssi: -42,
    firmwareVersion: 'v1.4.2',
    lastSynced: '2m ago',
    lastSyncedMinutes: 2,
    riskScore: 89,
    status: 'Critical',
    waterIntakeMl: 650,
    targetDailyMl: 2800,
    riskHistory: [30, 45, 55, 70, 78, 85, 89],
    waterHistory: [
      { time: '08:00', amount: 250 },
      { time: '10:00', amount: 400 }
    ]
  },
  {
    id: 'GV_USR_102',
    name: 'Kabir Mehta',
    age: 34,
    gender: 'Male',
    weightKg: 78,
    workload: 'Commuter',
    heartRate: 98,
    activityLoad: 48,
    temperature: 33.2,
    humidity: 82,
    sweatGSR: 4.1,
    batteryLevel: 84,
    rssi: -68,
    firmwareVersion: 'v1.4.2',
    lastSynced: '5m ago',
    lastSyncedMinutes: 5,
    riskScore: 72,
    status: 'High Risk',
    waterIntakeMl: 400,
    targetDailyMl: 3200,
    riskHistory: [20, 25, 40, 50, 58, 65, 72],
    waterHistory: [
      { time: '08:30', amount: 400 }
    ]
  },
  {
    id: 'GV_USR_103',
    name: 'Chloe Dupont',
    age: 26,
    gender: 'Female',
    weightKg: 58,
    workload: 'Office',
    heartRate: 74,
    activityLoad: 12,
    temperature: 22.4,
    humidity: 50,
    sweatGSR: 1.1,
    batteryLevel: 95,
    rssi: -38,
    firmwareVersion: 'v1.4.0',
    lastSynced: '12m ago',
    lastSyncedMinutes: 12,
    riskScore: 18,
    status: 'Hydrated',
    waterIntakeMl: 1200,
    targetDailyMl: 2500,
    riskHistory: [15, 18, 20, 16, 15, 17, 18],
    waterHistory: [
      { time: '09:00', amount: 300 },
      { time: '10:30', amount: 500 },
      { time: '11:45', amount: 400 }
    ]
  },
  {
    id: 'GV_USR_104',
    name: 'Ethan Wright',
    age: 42,
    gender: 'Male',
    weightKg: 85,
    workload: 'Field',
    heartRate: 146,
    activityLoad: 88,
    temperature: 36.5,
    humidity: 74,
    sweatGSR: 9.6,
    batteryLevel: 4,
    rssi: -82,
    firmwareVersion: 'v1.3.8',
    lastSynced: '1.2h ago',
    lastSyncedMinutes: 72,
    riskScore: 94,
    status: 'Critical',
    waterIntakeMl: 250,
    targetDailyMl: 3800,
    riskHistory: [40, 55, 68, 75, 82, 88, 94],
    waterHistory: [
      { time: '07:30', amount: 250 }
    ]
  },
  {
    id: 'GV_USR_105',
    name: 'Aisha Rahman',
    age: 31,
    gender: 'Female',
    weightKg: 66,
    workload: 'Office',
    heartRate: 79,
    activityLoad: 18,
    temperature: 23.5,
    humidity: 52,
    sweatGSR: 1.4,
    batteryLevel: 72,
    rssi: -50,
    firmwareVersion: 'v1.4.2',
    lastSynced: '15m ago',
    lastSyncedMinutes: 15,
    riskScore: 35,
    status: 'Mild Risk',
    waterIntakeMl: 800,
    targetDailyMl: 2700,
    riskHistory: [10, 15, 22, 28, 30, 32, 35],
    waterHistory: [
      { time: '09:15', amount: 400 },
      { time: '11:00', amount: 400 }
    ]
  }
];

export const mockFeedback: Feedback[] = [
  {
    id: 'FB_001',
    userName: 'James Wilson',
    email: 'james.w@example.com',
    preview: 'The battery life on my device has been incredible...',
    content: 'The battery life on my device has been incredible. I used it for 3 days straight without charging. However, the sync time could be slightly improved.',
    rating: 5,
    date: '2026-07-25',
    time: '14:30',
    timestamp: 1721915400000
  },
  {
    id: 'FB_002',
    userName: 'Elena Rodriguez',
    email: 'elena.rodriguez@techmail.io',
    preview: 'I love the new hydration tracking feature!',
    content: 'I love the new hydration tracking feature! It really helps me stay on track during my long shifts at the hospital. A dark mode for the app would be nice though.',
    rating: 4,
    date: '2026-07-26',
    time: '09:15',
    timestamp: 1721982900000
  },
  {
    id: 'FB_003',
    userName: 'Mark Thompson',
    email: 'm.thompson@fitness.com',
    preview: 'The heart rate monitor is very accurate.',
    content: 'The heart rate monitor is very accurate compared to my chest strap. Great job on the sensor integration!',
    rating: 5,
    date: '2026-07-24',
    time: '18:45',
    timestamp: 1721844300000
  }
];

export const mockLogs: LogEntry[] = [
  { id: 'L_001', time: '16:15:02', text: 'Admin Web Portal initialized.', type: 'success' },
  { id: 'L_002', time: '16:15:20', text: 'Fetching fleet telemetry from nodes...', type: 'info' },
  { id: 'L_003', time: '16:15:45', text: 'Connection to GV_USR_104 lost.', type: 'error' }
];
