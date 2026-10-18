import { Feedback } from '../types';

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
