import React, { useEffect, useMemo, useState } from 'react';
import { ActivityEvent, User } from '../../types';
import ActivityService from '../../services/ActivityService';
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

const formatDateHeading = (dateStr: string) => {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return `Today — ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday — ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatTime = (timestamp: string) => new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const UserJourney: React.FC<Props> = ({ user }) => {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [query, setQuery] = useState('');
  const [actorFilter, setActorFilter] = useState<'All' | 'User' | 'AI' | 'System' | 'Admin'>('All');
  const [range, setRange] = useState<'7' | '30' | 'all' | '1'>('all');
  const [customDate, setCustomDate] = useState<string>('');
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    ActivityService.fetchEventsForUser(user.id).then(ev => {
      if (mounted) setEvents(ev.reverse());
    });
    return () => { mounted = false; };
  }, [user.id]);

  const filtered = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOf7DaysAgo = new Date(startOfToday);
    startOf7DaysAgo.setDate(startOfToday.getDate() - 6);
    const startOf30DaysAgo = new Date(startOfToday);
    startOf30DaysAgo.setDate(startOfToday.getDate() - 29);

    const cutoff = range === '7' ? startOf7DaysAgo.getTime()
      : range === '30' ? startOf30DaysAgo.getTime()
        : range === '1' ? startOfToday.getTime() : 0;

    const customCutoff = customDate ? new Date(customDate).setHours(0, 0, 0, 0) : null;

    return events.filter(e => {
      if (actorFilter !== 'All' && e.actor !== actorFilter) return false;
      if (customCutoff !== null) {
        const eventDate = new Date(e.timestamp);
        eventDate.setHours(0, 0, 0, 0);
        if (eventDate.getTime() !== customCutoff) return false;
      } else if (cutoff && new Date(e.timestamp).getTime() < cutoff) return false;
      if (query) {
        const q = query.toLowerCase();
        return (e.title || '').toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q) || (e.eventType || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [events, actorFilter, range, query, customDate]);

  const byDateGroups = useMemo(() => {
    const groups: Record<string, ActivityEvent[]> = {};
    const sorted = [...filtered].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    sorted.forEach(ev => {
      const key = new Date(ev.timestamp).toDateString();
      groups[key] = groups[key] || [];
      groups[key].push(ev);
    });
    return groups;
  }, [filtered]);

  const stats = useMemo(() => {
    const intakeEvents = filtered.filter(e => e.eventType === 'water_intake_added');
    const aiEvents = filtered.filter(e => e.category === 'AI');
    const followedAi = aiEvents.filter(e => e.metadata?.userResponse === 'Completed');
    const errorEvents = filtered.filter(e => e.category === 'Error');

    const waterConsumed = intakeEvents.reduce((acc, e) => acc + (e.metadata?.amount || 0), 0);
    const waterRecommended = user.targetDailyMl;
    const compliance = waterRecommended > 0 ? Math.min(100, Math.round((waterConsumed / waterRecommended) * 100)) : 0;

    // Sort filtered events by timestamp to get range trend
    const telemetryEvents = filtered
      .filter(e => e.eventType === 'telemetry_received' && e.metadata?.risk !== undefined)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const riskStart = telemetryEvents.length > 0 ? telemetryEvents[0].metadata?.risk : (user.riskHistory[0] || 0);
    const riskEnd = telemetryEvents.length > 0 ? telemetryEvents[telemetryEvents.length - 1].metadata?.risk : user.riskScore;
    const riskTrend = riskEnd - riskStart;

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
      const date = new Date(e.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (!dailyData[date]) {
        dailyData[date] = { date, consumed: 0, recommended: user.targetDailyMl, risk: 0, riskCount: 0, aiRecs: 0, aiFollowed: 0 };
      }
      if (e.eventType === 'water_intake_added') dailyData[date].consumed += (e.metadata?.amount || 0);
      if (e.eventType === 'telemetry_received' && e.metadata?.risk !== undefined) {
        dailyData[date].risk += e.metadata.risk;
        dailyData[date].riskCount++;
      }
      if (e.category === 'AI') {
        dailyData[date].aiRecs++;
        if (e.metadata?.userResponse === 'Completed') dailyData[date].aiFollowed++;
      }
    });

    const timeline = Object.values(dailyData).map(d => ({
      ...d,
      risk: d.riskCount > 0 ? Math.round(d.risk / d.riskCount) : 0
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const scatter = filtered
      .filter(e => e.eventType === 'water_intake_added' && e.metadata?.riskSnapshot !== undefined)
      .map(e => ({ consumed: e.metadata?.amount, risk: e.metadata?.riskSnapshot, name: e.title }));

    return { timeline, scatter };
  }, [filtered, user]);

  const accountCreated = events.find(e => e.eventType === 'account_created')?.timestamp;
  const lastActive = events.length ? events[0].timestamp : null;

  const formatIndianPhone = (phone?: string) => {
    if (phone && phone.trim().length > 0) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
      return phone;
    }
    return '+91 98765 43210';
  };

  return (
    <div className="space-y-6">
      {/* Profile & KPI Summary - Tightened Layout */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-100">
              {user.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 leading-tight">{user.name}</h1>
              <p className="text-[11px] font-bold text-slate-400">{formatIndianPhone(user.phone)}</p>
            </div>
          </div>

          <div className="flex gap-10 text-right">
            <div>
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Account Created</div>
              <div className="text-[15px] font-black text-slate-800">{accountCreated ? new Date(accountCreated).toLocaleDateString() : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Last Active</div>
              <div className="text-[15px] font-black text-slate-800">{lastActive ? new Date(lastActive).toLocaleDateString() : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Daily Goal</div>
              <div className="text-[15px] font-black text-blue-600">{user.targetDailyMl} mL</div>
            </div>
          </div>
        </div>

        {/* 6-Column Divider KPI Row - Compact */}
        <div className="border-t border-slate-100 pt-5 mt-1">
          <div className="flex divide-x divide-slate-100 items-start">
            <div className="flex-1 pr-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">Activities</span>
              </div>
              <div className="text-lg font-black text-slate-900 leading-none">{filtered.length}</div>
            </div>

            <div className="flex-1 px-5">
              <div className="flex items-center gap-2 mb-1.5">
                <Cpu className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 truncate">AI Recomm...</span>
              </div>
              <div className="text-lg font-black text-slate-900 leading-none">{stats.aiRecommendations}</div>
            </div>

            <div className="flex-1 px-5">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">Followed</span>
              </div>
              <div className="text-lg font-black text-slate-900 leading-none">{stats.recommendationsFollowed}</div>
            </div>

            <div className="flex-[1.4] px-5">
              <div className="flex items-center gap-2 mb-1.5">
                <Droplet className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">Water</span>
              </div>
              <div className="text-lg font-black text-slate-900 leading-none whitespace-nowrap">
                {stats.waterConsumed} mL <span className="text-slate-400 font-bold text-[11px]">/ {stats.waterRecommended} mL</span>
              </div>
            </div>

            <div className="flex-1 px-5">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">Alert</span>
              </div>
              <div className="text-lg font-black text-slate-900 leading-none">{stats.alertCount}</div>
            </div>

            <div className="flex-[1.2] pl-5">
              <div className="flex items-center gap-2 mb-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-red-600" />
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">Risk Trend</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-lg font-black text-slate-900 leading-none whitespace-nowrap">
                  {stats.riskStart} <span className="text-slate-300 mx-1">→</span> {stats.riskEnd}
                  <span className="ml-1 text-slate-400 font-bold">{stats.riskTrend > 0 ? '↑' : stats.riskTrend < 0 ? '↓' : ''}</span>
                </div>
                {stats.riskTrend !== 0 && (
                  <div className={`text-[9px] font-black uppercase tracking-tight ${stats.riskTrend > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {stats.riskTrend > 0 ? `+${stats.riskTrend}` : stats.riskTrend} points
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
        <div className="flex-1 w-full lg:max-w-md flex items-center gap-3 rounded-2xl bg-white p-3 border border-slate-200 focus-within:border-blue-600 transition-all shadow-sm">
          <SearchIcon className="w-5 h-5 text-slate-400" />
          <input placeholder="Filter journey events..." className="bg-transparent border-none outline-none text-sm text-slate-900 placeholder:text-slate-400 flex-1" value={query} onChange={e => setQuery(e.target.value)} />
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <button
            onClick={() => setAnalyticsOpen(!analyticsOpen)}
            className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-sm border ${analyticsOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-600 border-slate-200 hover:bg-slate-50'}`}
          >
            {analyticsOpen ? <><X size={18} /> Close Analytics</> : <><BarChart3 size={18} /> View Analytics</>}
          </button>

          <select className="flex-1 lg:flex-none bg-white border border-slate-200 text-sm font-bold text-slate-700 p-3 rounded-2xl shadow-sm outline-none" value={actorFilter} onChange={e => setActorFilter(e.target.value as any)}>
            <option value="All">All Actors</option>
            <option value="User">User</option>
            <option value="AI">AI</option>
            <option value="System">System</option>
            <option value="Admin">Admin</option>
          </select>

          <div className="flex-1 lg:flex-none flex items-center gap-3 rounded-2xl bg-white border border-slate-200 px-4 py-3 shadow-sm">
            <Calendar className="w-5 h-5 text-blue-600" />
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
            <div className="space-y-8 pl-12">
              {Object.entries(byDateGroups).map(([date, evs]) => (
                <div key={date} className="space-y-4">
                  <div className="sticky top-24 z-20">
                    <span className="bg-slate-100 text-slate-600 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-200">
                      {formatDateHeading(evs[0].timestamp)}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {evs.map(ev => {
                      const human = humanizeEvent(ev);
                      return (
                        <div key={ev.eventId} className="group relative bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all hover:border-blue-200">
                          <div className="absolute -left-[37px] top-6 w-3 h-3 rounded-full bg-white border-2 border-blue-600 z-10" />
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex gap-4">
                              <div className="mt-1 p-2 bg-slate-50 rounded-lg">{categoryIcon(ev.category)}</div>
                              <div>
                                <h4 className="font-bold text-slate-900">{human.title}</h4>
                                <p className="text-xs text-slate-500 mt-1">{human.desc}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] font-black text-slate-400 uppercase">{formatTime(ev.timestamp)}</div>
                              <div className="mt-2">{actorBadge(ev.actor)}</div>
                            </div>
                          </div>
                          <div className="mt-4 flex items-center justify-between pt-4 border-t border-slate-50">
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">
                              Status: <span className={ev.status === 'success' ? 'text-emerald-500' : 'text-red-500'}>{ev.status?.toUpperCase()}</span>
                            </div>
                            <button onClick={() => setOpenEventId(openEventId === ev.eventId ? null : ev.eventId)} className="text-xs font-bold text-blue-600 flex items-center gap-1">
                              {openEventId === ev.eventId ? 'Close Data' : 'View Data'} <ChevronRight size={14} className={openEventId === ev.eventId ? 'rotate-90' : ''} />
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Daily Water Consumption</h4>
                <BarChart3 className="text-blue-600 w-5 h-5" />
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.timeline}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} unit="ml" />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="consumed" fill="#2563EB" radius={[4, 4, 0, 0]} barSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Risk Trend Over Time</h4>
                <LineChartIcon className="text-blue-600 w-5 h-5" />
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.timeline}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                    <Line type="monotone" dataKey="risk" stroke="#EF4444" strokeWidth={3} dot={{ r: 4, fill: '#EF4444' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Water Intake vs Risk Score</h4>
                <TrendingUp className="text-blue-600 w-5 h-5" />
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" dataKey="consumed" name="Water" unit="ml" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis type="number" dataKey="risk" name="Risk" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter name="Logs" data={chartData.scatter} fill="#2563EB" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">AI Recommendation Effectiveness</h4>
                <Cpu className="text-blue-600 w-5 h-5" />
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData.timeline}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
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
