import React, { useEffect, useMemo, useState } from 'react';
import { ActivityEvent, User } from '../../types';
import ActivityService from '../../services/ActivityService';
import { UserClock, describeOffset, formatUserTime, startOfUserDay, userDateKey } from '../../utils/userClock';
import {
  Cpu,
  Server,
  AlertTriangle,
  CheckCircle,
  Search as SearchIcon,
  Activity,
  Droplet,
  TrendingUp,
  Calendar,
  X,
  BarChart3,
  PieChart,
  LineChart as LineChartIcon,
  ChevronRight,
  TrendingDown,
  Target,
  Percent
} from 'lucide-react';
import Badge from '../shared/Badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, ScatterChart, Scatter, ZAxis, ComposedChart
} from 'recharts';

interface Props { user: User }

const actorBadge = (actor: string) => {
  return (
    <Badge variant={actor === 'AI' ? 'cyan' : actor === 'User' ? 'emerald' : actor === 'Admin' ? 'amber' : 'neutral'}>
      {actor}
    </Badge>
  );
};

const categoryIcon = (category: string) => {
  switch (category) {
    case 'AI': return <Cpu className="w-4 h-4 text-blue-600" />;
    case 'Telemetry': return <Server className="w-4 h-4 text-slate-400" />;
    case 'Intake': return <CheckCircle className="w-4 h-4 text-emerald-600" />;
    case 'Error': return <AlertTriangle className="w-4 h-4 text-red-600" />;
    default: return <Server className="w-4 h-4 text-slate-400" />;
  }
};

const humanizeEvent = (ev: ActivityEvent) => {
  switch (ev.eventType) {
    case 'account_created':
      return { title: 'Account created', desc: ev.description || `Account created for ${ev.userId}` };
    case 'onboarding_completed':
      return { title: 'Onboarding completed', desc: ev.description || 'User finished the onboarding flow.' };
    case 'profile_set':
      return { title: 'Profile details saved', desc: ev.description || 'Personal hydration baseline set.' };
    case 'ble_device_found':
      return { title: 'BLE device discovered', desc: ev.description || 'Nearby GetVari sensor found.' };
    case 'ble_connected':
      return { title: 'Device connected', desc: ev.description || 'User paired their sensor successfully.' };
    case 'telemetry_received':
      return { title: 'Telemetry received', desc: ev.description || 'Live sensor metrics captured.' };
    case 'water_intake_added':
      return { title: 'Water intake recorded', desc: `Logged ${ev.metadata?.amount ?? '0'} mL of water.` };
    case 'water_intake_corrected':
      return { title: 'Intake corrected', desc: ev.description || 'A logged amount was taken back.' };
    case 'ai_recommendation':
      return {
        title: 'AI Recommendation',
        desc: ev.metadata?.recommendation || ev.description || 'AI suggested a hydration action.',
      };
    case 'sync_failed':
      return { title: 'Sync failed', desc: ev.description || 'Device synchronization failed.' };
    default:
      return { title: ev.title || ev.eventType, desc: ev.description || 'Activity recorded.' };
  }
};

const DAY_MS = 24 * 60 * 60 * 1000;
const isIntake = (ev: ActivityEvent) =>
  ev.eventType === 'water_intake_added' || ev.eventType === 'water_intake_corrected';

/** "Today — 16 October", on the user's calendar rather than the admin's. */
const formatDateHeading = (dateStr: string, clock: UserClock) => {
  const key = userDateKey(clock, new Date(dateStr).getTime());
  // Noon UTC of that calendar date, so no zone can push the label a day over.
  const label = (opts: Intl.DateTimeFormatOptions) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
  const now = Date.now();
  if (key === userDateKey(clock, now)) return `Today — ${label({ day: 'numeric', month: 'long' })}`;
  if (key === userDateKey(clock, now - DAY_MS)) return `Yesterday — ${label({ day: 'numeric', month: 'long' })}`;
  return label({ day: 'numeric', month: 'long', year: 'numeric' });
};

const formatTime = (timestamp: string, clock: UserClock) => formatUserTime(clock, new Date(timestamp).getTime());

const UserJourney: React.FC<Props> = ({ user }) => {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const clock = user.clock;
  const [query, setQuery] = useState('');
  const [actorFilter, setActorFilter] = useState<'All' | 'User' | 'AI' | 'System' | 'Admin'>('All');
  const [range, setRange] = useState<'7' | '30' | 'all' | '1'>('1');
  const [customDate, setCustomDate] = useState<string>('');
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // Re-read when the user list's refresh shows new activity, so an entry
  // logged on the phone reaches an open journey too.
  useEffect(() => {
    let mounted = true;
    ActivityService.fetchEventsForUser(user.id)
      .then(ev => {
        if (!mounted) return;
        setEvents(ev.reverse());
        setEventsError(null);
      })
      .catch(err => {
        console.error('[UserJourney] Events not loaded:', err);
        if (mounted) setEventsError(err?.message ?? String(err));
      });
    return () => { mounted = false; };
  }, [user.id, user.lastSynced]);

  const filtered = useMemo(() => {
    // Day boundaries on the user's clock, the way the app draws its "today".
    const now = Date.now();
    const cutoff = range === '7' ? startOfUserDay(clock, now - 6 * DAY_MS)
      : range === '30' ? startOfUserDay(clock, now - 29 * DAY_MS)
        : range === '1' ? startOfUserDay(clock, now) : 0;

    return events.filter(e => {
      if (actorFilter !== 'All' && e.actor !== actorFilter) return false;
      if (customDate) {
        if (userDateKey(clock, new Date(e.timestamp).getTime()) !== customDate) return false;
      } else if (cutoff && new Date(e.timestamp).getTime() < cutoff) return false;
      if (query) {
        const q = query.toLowerCase();
        return (e.title || '').toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q) || (e.eventType || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [events, actorFilter, range, query, customDate, clock]);

  const byDateGroups = useMemo(() => {
    const groups: Record<string, ActivityEvent[]> = {};
    const sorted = [...filtered].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    sorted.forEach(ev => {
      const key = userDateKey(clock, new Date(ev.timestamp).getTime());
      groups[key] = groups[key] || [];
      groups[key].push(ev);
    });
    return groups;
  }, [filtered, clock]);

  const stats = useMemo(() => {
    // Corrections are negative entries and count, as in the app's total.
    const intakeEvents = filtered.filter(isIntake);
    const aiEvents = filtered.filter(e => e.category === 'AI');
    const followedAi = aiEvents.filter(e => e.metadata?.userResponse === 'Completed');
    const errorEvents = filtered.filter(e => e.category === 'Error');

    const waterConsumed = intakeEvents.reduce((acc, e) => acc + (e.metadata?.amount || 0), 0);
    const waterRecommended = user.targetDailyMl;
    const compliance = waterRecommended && waterRecommended > 0
      ? Math.max(0, Math.min(100, Math.round((waterConsumed / waterRecommended) * 100)))
      : 0;

    // The app keeps no risk history: the start is the oldest point of the
    // recomputed hourly trend, the end the current solve. Either can be
    // missing ("Insufficient Data"), and then there is no trend to state.
    const riskStart = user.riskHistory.find(v => v !== null) ?? null;
    const riskEnd = user.riskScore;
    const riskTrend = riskStart !== null && riskEnd !== null ? riskEnd - riskStart : 0;

    return {
      waterRecommended,
      waterConsumed,
      compliance,
      aiRecommendations: aiEvents.length,
      recommendationsFollowed: followedAi.length,
      riskStart,
      riskEnd,
      riskTrend,
      alertCount: errorEvents.length
    };
  }, [filtered, user]);

  const chartData = useMemo(() => {
    const dailyData: Record<string, any> = {};
    filtered.forEach(e => {
      // Group by Hour for Today, otherwise by Date
      const at = new Date(e.timestamp).getTime();
      const date = range === '1' ? formatUserTime(clock, at) : userDateKey(clock, at);

      if (!dailyData[date]) {
        dailyData[date] = {
          date,
          timestamp: new Date(e.timestamp).getTime(),
          consumed: 0,
          recommended: user.targetDailyMl ?? 0,
          risk: 0,
          riskCount: 0,
          aiRecs: 0,
          aiFollowed: 0
        };
      }
      if (isIntake(e)) dailyData[date].consumed += (e.metadata?.amount || 0);
      if (e.eventType === 'telemetry_received' && e.metadata?.risk !== undefined) {
        dailyData[date].risk += e.metadata.risk;
        dailyData[date].riskCount++;
      }
      if (e.category === 'AI') {
        dailyData[date].aiRecs++;
        if (e.metadata?.userResponse === 'Completed') dailyData[date].aiFollowed++;
      }
    });

    const timeline = Object.values(dailyData)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(d => ({
        ...d,
        risk: d.riskCount > 0 ? Math.round(d.risk / d.riskCount) : 0
      }))
      // Filter out points with 0 risk and no intake to avoid "dropping to zero" visual artifacts
      .filter(d => d.risk > 0 || d.consumed > 0);

    const scatter = filtered
      .filter(e => e.eventType === 'water_intake_added' && e.metadata?.riskSnapshot !== undefined)
      .map(e => ({
        // That day's running total with this drink — not the all-time sum,
        // which put a single day's points out past 100,000 ml.
        consumed: e.metadata?.dailyTotalMl ?? e.metadata?.amount,
        risk: e.metadata?.riskSnapshot,
        name: e.title
      }));

    return { timeline, scatter };
  }, [filtered, user, range, clock]);

  const accountCreated = events.find(e => e.eventType === 'account_created')?.timestamp;
  const lastActive = events.length ? events[0].timestamp : null;
  const intakeVsGoalData = chartData.timeline.map(({ date, consumed, recommended }) => ({
    date,
    actual: consumed,
    goal: recommended
  }));
  const hydrationConsistencyData = chartData.timeline.map(({ date, consumed, recommended }) => ({
    date,
    performance: recommended > 0 ? (consumed / recommended) * 100 : 0
  }));
  const hydrationCalendarData = Array.from({ length: 28 }, (_, index) =>
    hydrationConsistencyData[hydrationConsistencyData.length - 28 + index] ?? null
  );
  const hydrationColor = (performance: number) => {
    if (performance < 50) return 'bg-red-400';
    if (performance < 75) return 'bg-orange-400';
    if (performance < 100) return 'bg-amber-400';
    return 'bg-emerald-500';
  };

  const formatIndianPhone = (phone?: string) => {
    if (phone && phone.trim().length > 0) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
      return phone;
    }
    return 'Phone not provided';
  };

  return (
    <div className="space-y-4 w-full">
      {/* Profile & KPI Summary - Tightened Layout */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm w-full">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-base shadow-lg shadow-blue-100 shrink-0">
              {user.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 leading-tight">{user.name}</h1>
              <p className="text-[11px] font-bold text-slate-400">{formatIndianPhone(user.phone)}</p>
              <p className="text-[10px] font-bold text-slate-400">Times on the user&apos;s clock: {describeOffset(clock)}</p>
              {eventsError && (
                <p className="text-[11px] font-bold text-red-600 mt-1">Journey could not be loaded: {eventsError}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 sm:gap-8 lg:text-right">
            <div>
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Account Created</div>
              <div className="text-sm sm:text-base font-black text-slate-800">{accountCreated ? new Date(accountCreated).toLocaleDateString() : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Last Active</div>
              <div className="text-sm sm:text-base font-black text-slate-800">{lastActive ? new Date(lastActive).toLocaleDateString() : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Daily Goal</div>
              <div className="text-sm sm:text-base font-black text-blue-600">{user.targetDailyMl !== null ? `${user.targetDailyMl} mL` : 'Not stated'}</div>
            </div>
          </div>
        </div>

        {/* 6-Column Divider KPI Row - Compact & Responsive */}
        <div className="border-t border-slate-100 pt-5 mt-1">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-y-6 lg:divide-x lg:divide-slate-100 items-start">
            <div className="pr-4 lg:pr-5">
              <div className="flex items-center gap-2 mb-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">Activities</span>
              </div>
              <div className="text-lg font-black text-slate-900 leading-none">{filtered.length}</div>
            </div>

            <div className="px-4 lg:px-6">
              <div className="flex items-center gap-2 mb-1.5">
                <Cpu className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 truncate">AI Rec...</span>
              </div>
              <div className="text-lg font-black text-slate-900 leading-none">{stats.aiRecommendations}</div>
            </div>

            <div className="px-4 lg:px-6">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">Followed</span>
              </div>
              <div className="text-lg font-black text-slate-900 leading-none">{stats.recommendationsFollowed}</div>
            </div>

            <div className="px-4 lg:px-6">
              <div className="flex items-center gap-2 mb-1.5">
                <Droplet className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">
                  {range === '1' ? "Today's Water" : "Total Intake"}
                </span>
              </div>
              <div className="text-lg font-black text-slate-900 leading-none whitespace-nowrap">
                {stats.waterConsumed} <span className="text-slate-400 font-bold text-[10px]">/ {range === '1' && stats.waterRecommended !== null ? stats.waterRecommended : '—'}</span>
              </div>
            </div>

            <div className="px-4 lg:px-6">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">Alert</span>
              </div>
              <div className="text-lg font-black text-slate-900 leading-none">{stats.alertCount}</div>
            </div>

            <div className="pl-4 lg:pl-6">
              <div className="flex items-center gap-2 mb-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-red-600" />
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">Risk Trend</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-lg font-black text-slate-900 leading-none whitespace-nowrap">
                  {stats.riskStart ?? '--'} <span className="text-slate-300 mx-1">→</span> {stats.riskEnd ?? '--'}
                </div>
                {stats.riskTrend !== 0 && (
                  <div className={`text-[8px] font-black uppercase tracking-tight ${stats.riskTrend > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {stats.riskTrend > 0 ? `+${stats.riskTrend}` : stats.riskTrend} pts
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
        <div className="flex-1 w-full lg:max-w-md flex items-center gap-2 rounded-xl bg-white p-2.5 border border-slate-200 focus-within:border-blue-600 transition-all shadow-sm">
          <SearchIcon className="w-4 h-4 text-slate-400" />
          <input placeholder="Filter journey events..." className="bg-transparent border-none outline-none text-sm text-slate-900 placeholder:text-slate-400 flex-1" value={query} onChange={e => setQuery(e.target.value)} />
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto">
          <button
            onClick={() => setAnalyticsOpen(!analyticsOpen)}
            className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-sm border ${analyticsOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-600 border-slate-200 hover:bg-slate-50'}`}
          >
            {analyticsOpen ? <><X size={18} /> Close Analytics</> : <><BarChart3 size={18} /> View Analytics</>}
          </button>

          <select className="flex-1 lg:flex-none bg-white border border-slate-200 text-sm font-bold text-slate-700 p-2 rounded-xl shadow-sm outline-none" value={actorFilter} onChange={e => setActorFilter(e.target.value as any)}>
            <option value="All">All Actors</option>
            <option value="User">User</option>
            <option value="AI">AI</option>
            <option value="System">System</option>
            <option value="Admin">Admin</option>
          </select>

          <div className="flex-1 lg:flex-none flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 shadow-sm">
            <Calendar className="w-4 h-4 text-blue-600" />
            <select value={range} onChange={e => setRange(e.target.value as any)} className="bg-transparent border-none outline-none text-sm font-bold text-slate-700 cursor-pointer">
              <option value="all">All Time</option>
              <option value="1">Today</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      <div className="min-h-[400px]">
        {!analyticsOpen ? (
          <div className="relative">
            <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-200" />
            <div className="space-y-5 pl-10">
              {Object.entries(byDateGroups).map(([date, evs]) => (
                <div key={date} className="space-y-4">
                  <div className="sticky top-24 z-20">
                    <span className="bg-slate-100 text-slate-600 px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border border-slate-200">
                      {formatDateHeading(evs[0].timestamp, clock)}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {evs.map(ev => {
                      const human = humanizeEvent(ev);
                      return (
                        <div key={ev.eventId} className="group relative bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all hover:border-blue-200">
                          <div className="absolute -left-[37px] top-7 w-3.5 h-3.5 rounded-full bg-white border-2 border-blue-600 z-10" />
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex gap-3">
                              <div className="mt-1 p-2 bg-slate-50 rounded-lg">{categoryIcon(ev.category)}</div>
                              <div>
                                <h4 className="font-bold text-slate-900 text-base">{human.title}</h4>
                                <p className="text-sm text-slate-500 mt-1.5">{human.desc}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-black text-slate-400 uppercase">{formatTime(ev.timestamp, clock)}</div>
                              <div className="mt-3">{actorBadge(ev.actor)}</div>
                            </div>
                          </div>
                          <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-50">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-tighter">
                              Status: <span className={ev.status === 'success' ? 'text-emerald-500' : 'text-red-500'}>{ev.status?.toUpperCase()}</span>
                            </div>
                            <button onClick={() => setOpenEventId(openEventId === ev.eventId ? null : ev.eventId)} className="text-sm font-bold text-blue-600 flex items-center gap-2">
                              {openEventId === ev.eventId ? 'Close Data' : 'View Data'} <ChevronRight size={16} className={openEventId === ev.eventId ? 'rotate-90' : ''} />
                            </button>
                          </div>
                          {openEventId === ev.eventId && (
                            <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100 animate-fadeIn">
                              <pre className="text-[10px] font-mono text-slate-600 overflow-x-auto">{JSON.stringify(ev.metadata || { note: "No additional metadata" }, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fadeIn">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Daily Water Consumption</h4>
                <BarChart3 className="text-blue-600 w-5 h-5" />
              </div>
              <div className="h-[210px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.timeline}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} unit="ml" />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="consumed" fill="#2563EB" radius={[4, 4, 0, 0]} barSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Water Consumption vs Daily Goal</h4>
                <Target className="text-blue-600 w-5 h-5" />
              </div>
              <div className="h-[210px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={intakeVsGoalData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} unit="ml" />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Bar dataKey="actual" name="Consumed" fill="#2563EB" radius={[4, 4, 0, 0]} barSize={16} />
                    <Bar dataKey="goal" name="Daily Goal" fill="#CBD5E1" radius={[4, 4, 0, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Hydration Consistency</h4>
                <Calendar className="text-blue-600 w-5 h-5" />
              </div>
              <div className="h-[210px] flex flex-col gap-5">
                <div className="grid grid-cols-7 gap-2">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                    <span key={`${day}-${index}`} className="text-center text-[10px] font-black text-slate-400">{day}</span>
                  ))}
                  {hydrationCalendarData.map((day, index) => (
                    <div
                      key={index}
                      title={day ? `${day.date}: ${Math.round(day.performance)}% of goal` : 'No intake data'}
                      className={`h-8 rounded-md ${day ? hydrationColor(day.performance) : 'bg-slate-100'} transition-transform hover:scale-110`}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-center gap-3 text-[10px] font-bold text-slate-400">
                  <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-red-400" />Below 50%</span>
                  <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-amber-400" />On track</span>
                  <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-emerald-500" />Goal met</span>
                </div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Risk Trend Over Time</h4>
                <LineChartIcon className="text-blue-600 w-5 h-5" />
              </div>
              <div className="h-[210px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.timeline}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                    <Line type="monotone" dataKey="risk" stroke="#EF4444" strokeWidth={3} dot={{ r: 4, fill: '#EF4444' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Water Intake vs Risk Score</h4>
                <TrendingUp className="text-blue-600 w-5 h-5" />
              </div>
              <div className="h-[210px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" dataKey="consumed" name="Water" unit="ml" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis type="number" dataKey="risk" name="Risk" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter name="Logs" data={chartData.scatter} fill="#2563EB" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">AI Recommendation Effectiveness</h4>
                <Cpu className="text-blue-600 w-5 h-5" />
              </div>
              <div className="h-[210px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData.timeline}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Bar dataKey="aiRecs" name="Recs Given" fill="#CBD5E1" barSize={20} />
                    <Bar dataKey="aiFollowed" name="Recs Followed" fill="#2563EB" barSize={20} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserJourney;
