import React, { useEffect, useMemo, useState } from 'react';
import { ActivityEvent, User } from '../../types';
import ActivityService from '../../services/ActivityService';
import { Cpu, Server, AlertTriangle, CheckCircle, Search as SearchIcon, Activity, Droplet, TrendingUp, Calendar } from 'lucide-react';
import Badge from '../shared/Badge';

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
    case 'AI': return <Cpu className="w-4 h-4 text-cyan-400" />;
    case 'Telemetry': return <Server className="w-4 h-4 text-neutral-400" />;
    case 'Intake': return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case 'Error': return <AlertTriangle className="w-4 h-4 text-red-400" />;
    default: return <Server className="w-4 h-4 text-neutral-400" />;
  }
};

const humanizeEvent = (ev: ActivityEvent) => {
  // Convert metadata into readable text
  switch (ev.eventType) {
    case 'account_created':
      return { title: 'Account created', desc: ev.description || `Account created for ${ev.userId}` };
    case 'onboarding_completed':
      return { title: 'Onboarding completed', desc: ev.description || 'User finished the onboarding flow and is ready to use GetVari.' };
    case 'profile_set':
      return { title: 'Profile details saved', desc: ev.description || 'Age, weight, and gender were recorded for hydration personalization.' };
    case 'ble_device_found':
      return { title: 'BLE device discovered', desc: ev.description || 'Nearby GetVari sensor found during a scan.' };
    case 'ble_connected':
      return { title: 'Device connected', desc: ev.description || 'User paired their BLE sensor successfully.' };
    case 'telemetry_received':
      return { title: 'Telemetry received', desc: ev.description || 'Live sensor metrics were captured from the device.' };
    case 'water_intake_added':
      return { title: 'Water intake recorded', desc: `Logged ${ev.metadata?.amount ?? '0'} mL of water.` };
    case 'ai_recommendation':
      return {
        title: 'AI hydration recommendation',
        desc: ev.metadata?.recommendation || ev.description || 'AI suggested a hydration action.',
        extra: {
          recommendation: ev.metadata?.recommendation,
          reason: ev.metadata?.reason,
          userResponse: ev.metadata?.userResponse,
          outcome: ev.metadata?.outcome,
        }
      };
    case 'sync_failed':
      return { title: 'Sync failed', desc: ev.description || 'Device synchronization failed due to timeout or connectivity issues.' };
    default:
      return { title: ev.title || ev.eventType, desc: ev.description || 'No additional details available.' };
  }
};

const formatDateHeading = (dateStr: string) => {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return `Today — ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday — ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatTime = (timestamp: string) => new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const UserJourney: React.FC<Props> = ({ user }) => {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [query, setQuery] = useState('');
  const [actorFilter, setActorFilter] = useState<'All' | 'User' | 'AI' | 'System' | 'Admin'>('All');
  const [range, setRange] = useState<'7'|'30'|'all'|'1'>('all');
  const [customDate, setCustomDate] = useState<string>('');
  const [openEventId, setOpenEventId] = useState<string | null>(null);

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
        return (e.title || '').toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q) || (e.eventType || '').toLowerCase().includes(q) || (JSON.stringify(e.metadata || {}).toLowerCase().includes(q));
      }
      return true;
    });
  }, [events, actorFilter, range, query, customDate]);

  const byDateGroups = useMemo(() => {
    const groups: Record<string, ActivityEvent[]> = {};
    filtered.forEach(ev => {
      const key = new Date(ev.timestamp).toDateString();
      groups[key] = groups[key] || [];
      groups[key].push(ev);
    });
    return groups;
  }, [filtered]);

  // Insights
  const insights = useMemo(() => {
    const total = events.length;
    const aiCount = events.filter(e => e.category === 'AI').length;
    const aiFollowed = events.filter(e => e.category === 'AI' && e.metadata?.userResponse === 'Completed').length;
    const waterLogged = events.filter(e => e.eventType === 'water_intake_added').reduce((s, e) => s + (e.metadata?.amount || 0), 0);
    const alerts = events.filter(e => e.category === 'Error').length;
    const riskStart = user.riskHistory && user.riskHistory.length > 0 ? user.riskHistory[0] : null;
    const riskEnd = user.riskHistory && user.riskHistory.length > 0 ? user.riskHistory[user.riskHistory.length - 1] : null;
    const riskChange = (riskStart !== null && riskEnd !== null) ? riskEnd - riskStart : null;
    return { total, aiCount, aiFollowed, waterLogged, alerts, riskStart, riskEnd, riskChange };
  }, [events, user.riskHistory]);

  const accountCreated = events.find(e => e.eventType === 'account_created')?.timestamp;
  const lastActive = events.length ? events[0].timestamp : null;

  const formatIndianPhone = (phone?: string) => {
    if (phone && phone.trim().length > 0) {
      // Extract digits
      const digits = phone.replace(/\D/g, '');
      if (digits.length === 10) {
        return `+91 ${digits.slice(0,5)} ${digits.slice(5)}`;
      }
      if (digits.length === 12 && digits.startsWith('91')) {
        return `+91 ${digits.slice(2,7)} ${digits.slice(7)}`;
      }
      if (phone.startsWith('+91')) return phone;
      return phone; // fallback
    }

    // Fallback deterministic mock from user id
    const sum = Array.from(user.id).reduce((s, ch) => s + ch.charCodeAt(0), 0);
    const last10 = String(1000000000 + (sum % 9000000000)).slice(-10);
    return `+91 ${last10.slice(0,5)} ${last10.slice(5)}`;
  };

  return (
    <div className="space-y-3">
      {/* Summary + Filters */}
      <div className="space-y-4">
        <div className="bg-neutral-950/50 p-3 rounded-xl border border-white/5 mb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 bg-neutral-900/40 rounded-md flex items-center justify-center text-white font-bold text-lg">{user.name.split(' ').map(s=>s[0]).slice(0,2).join('')}</div>
              <div className="min-w-0">
                <div className="text-base font-extrabold text-white truncate">{user.name}</div>
                <div className="text-xs text-neutral-400 font-mono mt-0.5 truncate">{formatIndianPhone(user.phone)}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-400">
              <div className="min-w-[120px]">
                <div className="font-mono uppercase tracking-[0.16em] text-[10px]">Account created</div>
                <div className="text-sm text-white">{accountCreated ? new Date(accountCreated).toLocaleDateString() : '—'}</div>
              </div>
              <div className="min-w-[120px]">
                <div className="font-mono uppercase tracking-[0.16em] text-[10px]">Last active</div>
                <div className="text-sm text-white">{lastActive ? new Date(lastActive).toLocaleDateString() : '—'}</div>
              </div>
              <div className="min-w-[110px]">
                <div className="font-mono uppercase tracking-[0.16em] text-[10px]">Daily goal</div>
                <div className="text-sm text-cyan-300 font-bold">{user.targetDailyMl} mL</div>
              </div>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <div className="min-w-full rounded-2xl border border-white/10 bg-neutral-950/40 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
              <div className="grid grid-cols-6 divide-x divide-white/10 text-white text-[10px]">
                <div className="flex flex-col justify-center gap-1 px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-2 text-cyan-400"><Activity className="w-4 h-4" /><span className="text-neutral-400 uppercase tracking-[0.24em]">Activities</span></div>
                  <div className="text-sm font-semibold leading-none">{insights.total}</div>
                </div>

                <div className="flex flex-col justify-center gap-1 px-3 py-2 whitespace-nowrap min-w-[96px]">
                  <div className="flex items-center gap-2 text-cyan-400"><Cpu className="w-4 h-4" /><span className="text-neutral-400 uppercase tracking-[0.24em] truncate">AI recommendation</span></div>
                  <div className="text-sm font-semibold leading-none">{insights.aiCount}</div>
                </div>

                <div className="flex flex-col justify-center gap-1 px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-2 text-emerald-400"><CheckCircle className="w-4 h-4" /><span className="text-neutral-400 uppercase tracking-[0.24em]">Followed</span></div>
                  <div className="text-sm font-semibold leading-none">{insights.aiFollowed}</div>
                </div>

                <div className="flex flex-col justify-center gap-1 px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-2 text-cyan-400"><Droplet className="w-4 h-4" /><span className="text-neutral-400 uppercase tracking-[0.24em]">Water</span></div>
                  <div className="text-sm font-semibold leading-none">{insights.waterLogged} mL / {user.targetDailyMl} mL</div>
                </div>

                <div className="flex flex-col justify-center gap-1 px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-2 text-red-400"><AlertTriangle className="w-4 h-4" /><span className="text-neutral-400 uppercase tracking-[0.24em]">Alert</span></div>
                  <div className="text-sm font-semibold leading-none">{insights.alerts}</div>
                </div>

                <div className="flex flex-col justify-center gap-1 px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-2 text-red-400"><TrendingUp className="w-4 h-4" /><span className="text-neutral-400 uppercase tracking-[0.24em]">Risk trend</span></div>
                  <div className="text-sm font-semibold leading-none">{insights.riskStart !== null && insights.riskEnd !== null ? `${insights.riskStart} → ${insights.riskEnd} ${insights.riskChange !== null && insights.riskChange > 0 ? '↑' : insights.riskChange !== null && insights.riskChange < 0 ? '↓' : ''}` : '—'}</div>
                  {insights.riskChange !== null && (
                    <div className={`text-[10px] ${insights.riskChange > 0 ? 'text-red-400' : insights.riskChange < 0 ? 'text-emerald-400' : 'text-neutral-400'}`}>
                      {insights.riskChange > 0 ? `+${insights.riskChange} points` : `${insights.riskChange} points`}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 mt-12 w-full lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1 min-w-0 flex items-center gap-3 rounded-2xl bg-neutral-900/50 p-3 border border-transparent focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400/25 transition-all duration-150">
            <SearchIcon className="w-5 h-5 text-cyan-300" />
            <input placeholder="Search journey..." className="bg-transparent outline-none text-sm text-white placeholder:text-neutral-500 flex-1 min-w-0" value={query} onChange={e => setQuery(e.target.value)} />
          </div>

          <select className="bg-neutral-900/50 border border-white/10 text-sm text-white p-3 rounded-2xl min-w-[150px] w-full lg:w-auto" value={actorFilter} onChange={e => setActorFilter(e.target.value as any)}>
            <option value="All">All actors</option>
            <option value="User">User</option>
            <option value="AI">AI</option>
            <option value="System">System</option>
            <option value="Admin">Admin</option>
          </select>

          <div className="flex items-center gap-3 rounded-2xl bg-neutral-900/50 border border-white/10 px-4 py-3 w-full lg:w-auto">
            <Calendar className="w-5 h-5 text-cyan-300" />
            <input type="date" value={customDate} onChange={e => { setCustomDate(e.target.value); setRange('all'); }} className="bg-transparent outline-none text-sm text-white placeholder:text-neutral-500 flex-1" />
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative mt-2">
        <div className="absolute left-4 sm:left-6 top-0 bottom-0 w-px bg-white/6" />

        <div className="space-y-6 pl-10 sm:pl-12">
          {Object.entries(byDateGroups).length === 0 && (
            <div className="text-sm text-neutral-500">No events in selected range.</div>
          )}

          {Object.entries(byDateGroups).map(([date, evs], idx) => (
            <div key={date} className={`${idx > 0 ? 'mt-8' : ''} space-y-6`}>
              <div className="text-sm font-mono text-neutral-400">{formatDateHeading(evs[0].timestamp)}</div>

              <div className="space-y-4">
                {evs.map(ev => {
                  const human = humanizeEvent(ev);
                  return (
                    <div key={ev.eventId} className="flex items-start gap-4">
                      <div className="relative">
                        <div className="w-4 h-4 rounded-full bg-neutral-800 flex items-center justify-center ring-2 ring-white/5">
                          {categoryIcon(ev.category)}
                        </div>
                      </div>

                      <div className="flex-1 bg-neutral-950/40 p-3 rounded-lg border border-white/5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-white">{human.title}</div>
                            <div className="text-xs text-neutral-400 mt-1">{human.desc}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-neutral-400">{formatTime(ev.timestamp)}</div>
                            <div className="mt-2">{actorBadge(ev.actor)}</div>
                          </div>
                        </div>

                        {/* condensed details */}
                        <div className="mt-3 flex items-center justify-between">
                          <div className="text-[13px] text-neutral-300">Status: <span className={`font-bold ${ev.status === 'success' ? 'text-emerald-400' : ev.status === 'failed' ? 'text-red-400' : 'text-neutral-300'}`}>{ev.status}</span></div>
                          <button onClick={() => setOpenEventId(openEventId === ev.eventId ? null : ev.eventId)} className="text-xs text-cyan-300">{openEventId === ev.eventId ? 'Hide details' : 'View details'}</button>
                        </div>

                        {openEventId === ev.eventId && (
                          <div className="mt-3 text-sm text-neutral-300 space-y-2">
                            {ev.eventType === 'ai_recommendation' && (
                              <>
                                {human.extra?.recommendation && <div><span className="font-mono text-neutral-400">Recommendation:</span> {human.extra.recommendation}</div>}
                                {human.extra?.reason && <div><span className="font-mono text-neutral-400">Reason:</span> {human.extra.reason}</div>}
                                {human.extra?.userResponse && <div><span className="font-mono text-neutral-400">User response:</span> {human.extra.userResponse}</div>}
                                {human.extra?.outcome && (
                                  <div><span className="font-mono text-neutral-400">Projected risk:</span> {human.extra.outcome.oldRisk} → {human.extra.outcome.newRisk} {human.extra.outcome.newRisk > human.extra.outcome.oldRisk ? '↑' : human.extra.outcome.newRisk < human.extra.outcome.oldRisk ? '↓' : ''}</div>
                                )}
                              </>
                            )}

                            {ev.eventType === 'water_intake_added' && (
                              <>
                                <div><span className="font-mono text-neutral-400">Amount:</span> {ev.metadata?.amount ?? '0'} mL</div>
                              </>
                            )}

                            {ev.eventType === 'telemetry_received' && (
                              <>
                                {ev.metadata?.heartRate && <div><span className="font-mono text-neutral-400">Heart rate:</span> {ev.metadata.heartRate} BPM</div>}
                                {ev.description && <div><span className="font-mono text-neutral-400">Telemetry:</span> {ev.description}</div>}
                              </>
                            )}

                            {ev.eventType === 'sync_failed' && ev.description && (
                              <div><span className="font-mono text-neutral-400">Error:</span> {ev.description}</div>
                            )}

                            {ev.eventType === 'profile_set' && ev.description && (
                              <div><span className="font-mono text-neutral-400">Profile details:</span> {ev.description}</div>
                            )}

                            {!['ai_recommendation', 'water_intake_added', 'telemetry_received', 'sync_failed', 'profile_set'].includes(ev.eventType) && ev.description && (
                              <div><span className="font-mono text-neutral-400">Details:</span> {ev.description}</div>
                            )}

                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UserJourney;
