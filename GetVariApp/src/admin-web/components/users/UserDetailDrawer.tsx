import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Battery, Wifi, Droplet, Thermometer, Activity, Clock } from 'lucide-react';
import { addOverlay, removeOverlay, forceClearLocks } from '../../utils/overlayManager';
import Badge from '../shared/Badge';
import { User } from '../../types';
import { sendCriticalAlert } from '../../services/AdminAlertService';
import PBWRAdminSection from './PBWRAdminSection';
import AdminErrorBoundary from '../shared/AdminErrorBoundary';
import PBWRService, { PBWRBreakdown } from '../../../services/PBWRService';

/** Badge colour for each of the app's status labels. */
const statusVariant = (status: User['status']) =>
  status === 'Critical' ? 'red' :
  status === 'High Risk' ? 'amber' :
  status === 'Mild Risk' ? 'cyan' :
  status === 'Hydrated' ? 'emerald' : 'neutral';

/** Score colour follows the status band, as on the app's risk card. */
const statusText = (status: User['status']) =>
  status === 'Critical' ? 'text-red-600' :
  status === 'High Risk' ? 'text-orange-500' :
  status === 'Mild Risk' ? 'text-yellow-600' :
  status === 'Hydrated' ? 'text-emerald-600' : 'text-slate-400';

interface UserDetailDrawerProps {
  user?: User;
  onClose: () => void;
}

const MISSING = '—';

/** A number for display, or the dash when the profile does not have it. */
const shown = (value: unknown, suffix = ''): string =>
  typeof value === 'number' && Number.isFinite(value) ? `${value}${suffix}` : MISSING;

/** A stored timestamp as local time, or the dash when absent or unreadable. */
const shownDate = (value: unknown): string => {
  if (!value) return MISSING;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? MISSING : date.toLocaleString();
};

/** One labelled group of detail rows. */
const DetailGroup: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({
  title,
  children,
  className = '',
}) => (
  <section className={className}>
    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{title}</h4>
    <dl>{children}</dl>
  </section>
);

/**
 * One detail as a row: a small muted label, and the value right-aligned in
 * the rest of the width. A row gives the value far more room than a cell in a
 * multi-column grid, so phone numbers and time windows stay on one line.
 * `truncate` keeps a long value (an email) to one line with the full text on
 * hover; anything else may wrap, under its label rather than beside it.
 */
const DetailRow: React.FC<{
  label: string;
  value: string;
  note?: string;
  truncate?: boolean;
  tone?: 'slate' | 'blue';
}> = ({ label, value, note, truncate, tone = 'slate' }) => (
  <div className="flex items-baseline justify-between gap-4 py-1">
    <dt
      className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${
        tone === 'blue' ? 'text-blue-400' : 'text-slate-400'
      }`}
    >
      {label}
    </dt>
    <dd className="min-w-0 text-right">
      <span
        className={`block text-[13px] font-semibold ${tone === 'blue' ? 'text-blue-900' : 'text-slate-900'} ${
          truncate ? 'truncate' : 'break-words'
        }`}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
      {note && <span className="block text-[11px] font-medium text-slate-500">{note}</span>}
    </dd>
  </div>
);

/**
 * The drawer's shell — backdrop, panel, Escape and the scroll lock — kept
 * apart from its content so that a failure while drawing one user's details
 * shows an error *inside* an open panel, with a way to close it, instead of
 * taking the whole admin panel down with it.
 */
const UserDetailDrawer: React.FC<UserDetailDrawerProps> = ({ user, onClose }) => {
  // Through a ref so the listener added once below always calls the current one.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    addOverlay();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      try { removeOverlay(); } catch (e) {}
      // Defensive: ensure no leftover locks remain
      try { forceClearLocks(); } catch (e) {}
    };
  }, []);

  if (!user || typeof document === 'undefined') return null;

  const panel = (
    <div className="user-drawer-root fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed top-0 right-0 h-[100dvh] w-full sm:w-[85vw] md:w-[70vw] lg:w-[50vw] max-w-[820px] bg-white border-l border-slate-200 p-4 sm:p-6 overflow-y-auto space-y-6 shadow-2xl flex flex-col justify-between animate-slideIn scroll-area"
        role="dialog"
        aria-modal="true"
      >
        <AdminErrorBoundary
          label="this user’s details"
          resetKey={user.id}
          actions={
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition"
            >
              Close
            </button>
          }
        >
          {/* Keyed by user so opening another one starts from its own state. */}
          <UserDetailContent key={user.id} user={user} onClose={onClose} />
        </AdminErrorBoundary>
      </aside>
    </div>
  );

  return createPortal(panel, document.body);
};

type BreakdownState = 'loading' | 'ready' | 'unavailable' | 'error';

const UserDetailContent: React.FC<{ user: User; onClose: () => void }> = ({ user, onClose }) => {
  const [alertState, setAlertState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [pbwrBreakdown, setPbwrBreakdown] = useState<PBWRBreakdown | null>(null);
  const [breakdownState, setBreakdownState] = useState<BreakdownState>('loading');

  const fullProfile = user.fullProfile ?? null;
  // Read through a ref: every admin refresh hands over a new, identical
  // profile object, and recalculating on each one re-read the telemetry
  // history every 30 seconds while the drawer was open.
  const profileRef = useRef(fullProfile);
  profileRef.current = fullProfile;
  const targetDailyMl = typeof user.targetDailyMl === 'number' && Number.isFinite(user.targetDailyMl)
    ? user.targetDailyMl
    : null;
  const waterIntakeMl = Number.isFinite(user.waterIntakeMl) ? user.waterIntakeMl : 0;
  const todayEntries = Array.isArray(user.waterHistory) ? user.waterHistory : [];
  const drinkEntries = todayEntries.filter(entry => !entry?.isCorrection);
  const correctionCount = todayEntries.length - drinkEntries.length;
  /**
   * The newest drink by its timestamp; where one cannot be read, by its place
   * in the list, which the service returns oldest first.
   */
  const lastDrink = drinkEntries.reduce<(typeof drinkEntries)[number] | null>((latest, entry) => {
    if (latest === null) return entry;
    const at = Date.parse(entry?.timestamp);
    const latestAt = Date.parse(latest.timestamp);
    return Number.isFinite(at) && Number.isFinite(latestAt) ? (at >= latestAt ? entry : latest) : entry;
  }, null);
  const remainingMl = targetDailyMl !== null ? Math.max(0, Math.round(targetDailyMl - waterIntakeMl)) : null;
  /** Today's completion, as the bar shows it; may pass 100 once the goal is exceeded. */
  const completionPct = targetDailyMl && targetDailyMl > 0
    ? Math.max(0, Math.round((waterIntakeMl / targetDailyMl) * 100))
    : null;

  useEffect(() => {
    let cancelled = false;
    const profile = profileRef.current;
    // The breakdown explains the pipeline; the Final Daily Target shown is the
    // user's one (`targetDailyMl`, the app's stored figure for today), so the
    // drawer and the list can never disagree. Without a profile or a target
    // there is nothing to explain.
    if (!profile || targetDailyMl === null) {
      setPbwrBreakdown(null);
      setBreakdownState('unavailable');
      return;
    }
    setBreakdownState(state => (state === 'ready' ? state : 'loading'));
    // Wrapped so a synchronous throw lands in the same `catch` as a rejection.
    Promise.resolve()
      .then(() => PBWRService.calculatePBWR(profile, waterIntakeMl, user.id))
      .then(breakdown => {
        if (cancelled) return;
        setPbwrBreakdown({
          ...breakdown,
          finalTarget: targetDailyMl,
          remaining: Math.max(0, targetDailyMl - waterIntakeMl),
        });
        setBreakdownState('ready');
      })
      .catch(err => {
        console.error('[UserDetailDrawer] PBWR calculation failed:', err);
        if (cancelled) return;
        setPbwrBreakdown(null);
        setBreakdownState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, user.profileUpdatedAt, waterIntakeMl, targetDailyMl]);

  // Any user can be sent an alert, whatever their status; the wording follows
  // the status (see `buildUserAlert`).
  const handleSendAlert = async () => {
    setAlertState('sending');
    try {
      await sendCriticalAlert(user);
      setAlertState('sent');
    } catch (error) {
      console.error('[Admin alert] Failed to send:', error);
      setAlertState('error');
    }
  };

  const conditions: string[] = Array.isArray(fullProfile?.medicalConditions)
    ? fullProfile.medicalConditions.filter((c: unknown): c is string => typeof c === 'string')
    : [];
  const riskHistory = Array.isArray(user.riskHistory) ? user.riskHistory : [];
  const riskScore = typeof user.riskScore === 'number' && Number.isFinite(user.riskScore) ? user.riskScore : null;

  return (
    <>
        <div className="space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div>
              <span className="text-[10px] uppercase font-black tracking-widest text-blue-600">Individual Profile details</span>
              <h2 className="text-2xl font-black text-slate-900 mt-1">{user.name || 'Unnamed user'}</h2>
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">USER ID: {user.id}</span>
              {(user.duplicateRowCount ?? 0) > 0 && (
                <span className="block mt-1 text-[10px] font-bold text-amber-600">
                  {user.duplicateRowCount} other profile row{user.duplicateRowCount === 1 ? '' : 's'} share this phone number
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl transition border border-slate-200"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          <div className="space-y-6">
            {/* The profile takes the larger share; the intake card sizes to its
                content (`items-start`) instead of stretching to match. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start">
            <div className="bg-slate-50 px-4 py-3.5 rounded-2xl border border-slate-100 shadow-sm">
              <div className="space-y-3">
                <DetailGroup title="Personal Details">
                  <DetailRow label="Gender" value={user.gender || 'Not set'} />
                  <DetailRow label="Age" value={Number.isFinite(user.age) && user.age > 0 ? `${user.age} years` : 'Not set'} />
                  <DetailRow label="Phone" value={user.phone || 'Not provided'} />
                  <DetailRow label="Email" value={user.email || 'Not provided'} truncate />
                </DetailGroup>

                <DetailGroup title="Health &amp; Lifestyle" className="pt-3 border-t border-slate-200/70">
                  <DetailRow label="Weight" value={shown(user.weightKg, ' kg')} />
                  <DetailRow label="Activity Level" value={user.activityLabel || MISSING} />
                  <DetailRow label="Sleep Window" value={user.sleepWindowLabel || MISSING} />
                </DetailGroup>

                <DetailGroup title="Additional Details" className="pt-3 border-t border-slate-200/70">
                  <DetailRow label="City" value={user.city || 'Not set'} />
                  <DetailRow
                    label="Medical Conditions"
                    value={conditions.length ? conditions.join(', ') : 'None'}
                    note={fullProfile?.physicianLimitMl ? `Doctor's limit: ${shown(fullProfile.physicianLimitMl, ' ml')}` : undefined}
                  />
                  <DetailRow label="Profile Last Saved" value={shownDate(user.profileUpdatedAt)} />
                </DetailGroup>
              </div>
            </div>

            <div className="bg-blue-50 px-4 py-3.5 rounded-2xl border border-blue-100 shadow-sm">
              <span className="text-[9px] uppercase font-black tracking-widest text-blue-600">Fluid Intake (Today)</span>

              <p className="mt-2.5 flex items-baseline gap-1.5 flex-wrap" aria-label="Ingested volume / daily target">
                <span className="text-3xl font-black text-blue-700 leading-none whitespace-nowrap">{Math.round(waterIntakeMl)} ml</span>
                <span className="text-sm font-black text-blue-400 whitespace-nowrap">
                  / {targetDailyMl !== null ? `${Math.round(targetDailyMl)} ml` : MISSING}
                </span>
              </p>

              <div
                className="mt-3 w-full h-2 bg-blue-100 rounded-full overflow-hidden"
                role="progressbar"
                aria-label="Daily intake progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={completionPct ?? 0}
              >
                <div
                  className="h-full bg-blue-600 rounded-full"
                  style={{ width: `${completionPct === null ? 0 : Math.min(100, completionPct)}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-baseline gap-3 mt-1.5 text-[11px] font-bold">
                <span className="text-blue-700 whitespace-nowrap">
                  {completionPct !== null ? `${completionPct}% of daily goal` : 'No daily target'}
                </span>
                <span className="text-blue-400 whitespace-nowrap">
                  {targetDailyMl !== null
                    ? `${(targetDailyMl / 1000).toFixed(2)} L target`
                    : 'Doctor limit missing'}
                </span>
              </div>

              {/* Today's logged entries, summarised — the same rows the total is summed from. */}
              <dl className="mt-3 pt-2 border-t border-blue-100">
                <DetailRow
                  tone="blue"
                  label="Remaining"
                  value={remainingMl === null ? MISSING : remainingMl === 0 ? 'Goal reached' : `${remainingMl} ml`}
                />
                <DetailRow
                  tone="blue"
                  label="Entries Today"
                  value={`${drinkEntries.length}`}
                  note={correctionCount > 0 ? `+ ${correctionCount} correction${correctionCount === 1 ? '' : 's'}` : undefined}
                />
                <DetailRow
                  tone="blue"
                  label="Last Entry"
                  value={lastDrink ? `${lastDrink.time} · ${Math.round(Number(lastDrink.amount))} ml` : 'None today'}
                />
              </dl>
            </div>
          </div>

          {breakdownState === 'error' ? (
            <div role="alert" className="bg-red-50 p-5 rounded-3xl border border-red-100 text-xs font-bold text-red-700">
              The PBWR breakdown could not be calculated for this user. The rest of the details are unaffected.
            </div>
          ) : (
            // Its own boundary: a bad telemetry row costs this one section,
            // not the drawer.
            <AdminErrorBoundary label="the PBWR breakdown" resetKey={user.id} compact>
              <PBWRAdminSection
                userId={user.id}
                fullProfile={fullProfile}
                waterIntakeMl={waterIntakeMl}
                breakdown={pbwrBreakdown}
                breakdownLoading={breakdownState === 'loading'}
                profileVersion={user.profileUpdatedAt ?? null}
              />
            </AdminErrorBoundary>
          )}

          <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Risk Index</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <h3 className={`text-4xl font-black leading-none ${statusText(user.status)}`}>
                    {riskScore !== null ? Math.round(riskScore) : '--'}
                  </h3>
                  <span className="text-xs font-bold text-slate-400">/ 100</span>
                </div>
              </div>
              <Badge variant={statusVariant(user.status)} dot>
                {user.status}
              </Badge>
            </div>
            {!!user.riskMeaning && (
              <p className="text-xs font-semibold text-slate-600 truncate mt-3" title={user.riskMeaning}>
                {user.riskMeaning}
              </p>
            )}
            {riskHistory.length > 0 && (
              <div className="mt-4 bg-white rounded-2xl border border-slate-100 p-3">
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 block mb-2">
                  Last {riskHistory.length} hours
                </span>
                <div className="h-12 flex items-end gap-1.5">
                  {riskHistory.map((raw, idx) => {
                    const val = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
                    return (
                      <div
                        key={idx}
                        className={`flex-1 rounded-md transition-colors ${val === null ? 'bg-slate-100' : 'bg-blue-400 hover:bg-blue-600'}`}
                        style={{ height: `${val === null ? 8 : Math.max(8, Math.min(100, val))}%` }}
                        title={`${riskHistory.length - 1 - idx}h ago: ${val ?? 'no score'}`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1.5 text-[9px] font-bold text-slate-400">
                  <span>{riskHistory.length - 1}h ago</span>
                  <span>Now</span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block border-b border-slate-200 pb-2">Simulated Sensor Baseline (as in the app)</span>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                <span className="text-[10px] text-slate-400 font-black uppercase block tracking-widest">Heart rate</span>
                <span className="text-xl font-black text-slate-900 mt-1 block">{shown(user.heartRate, ' BPM')}</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                <span className="text-[10px] text-slate-400 font-black uppercase block tracking-widest">Exertion</span>
                <span className="text-xl font-black text-slate-900 mt-1 block">{shown(user.activityLoad, '%')}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                <span className="text-[10px] text-slate-400 font-black uppercase block tracking-widest">Ambient Temp</span>
                <span className="text-lg font-black text-slate-900 mt-1 block">{shown(user.temperature, ' °C')}</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                <span className="text-[10px] text-slate-400 font-black uppercase block tracking-widest">Ambient Humidity</span>
                <span className="text-lg font-black text-slate-900 mt-1 block">{shown(user.humidity, '% rH')}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 shadow-sm space-y-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block border-b border-slate-200 pb-2">Carrier Telemetry node status</span>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-bold uppercase tracking-[0.1em]">Firmware Build</span>
              <span className="text-slate-900 font-mono font-black bg-white px-3 py-1 rounded-lg border border-slate-100 shadow-sm">{user.firmwareVersion ?? 'Not reported'}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-bold uppercase tracking-[0.1em]">Hardware Battery level</span>
              <span className="text-emerald-600 font-mono font-black flex items-center gap-2 bg-white px-3 py-1 rounded-lg border border-slate-100 shadow-sm">
                <Battery className="w-4 h-4" /> {shown(user.batteryLevel, '%')}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-bold uppercase tracking-[0.1em]">BLE Sync Strength</span>
              <span className="text-blue-600 font-mono font-black flex items-center gap-2 bg-white px-3 py-1 rounded-lg border border-slate-100 shadow-sm">
                <Wifi className="w-4 h-4" /> {shown(user.rssi, ' dBm')}
              </span>
            </div>
          </div>
            </div>
        </div>

        <div className="border-t border-slate-100 pt-6 mt-4">
          <button
            onClick={handleSendAlert}
            disabled={alertState === 'sending' || alertState === 'sent'}
            className={`w-full font-black text-xs py-3 rounded-2xl shadow-lg transition uppercase tracking-widest ${
              alertState === 'sent' ? 'bg-emerald-600 text-white shadow-emerald-200 cursor-default' :
              alertState === 'error' ? 'bg-red-600 text-white shadow-red-200' :
              'bg-red-600 hover:bg-red-700 text-white shadow-red-200 cursor-pointer'
            } disabled:opacity-70`}
          >
            {alertState === 'sending' ? 'Sending Alert...' : alertState === 'sent' ? 'Alert Sent Successfully' : alertState === 'error' ? 'Unable to Send Alert — Retry' : 'Send Alert'}
          </button>
          {alertState === 'sent' && <p className="mt-3 text-center text-xs font-bold text-emerald-600">{user.status === 'Critical' ? 'Critical alert' : 'Notification'} sent and recorded in this user’s journey.</p>}
          {alertState === 'error' && <p className="mt-3 text-center text-xs font-bold text-red-600">The alert could not be delivered. Please try again.</p>}
        </div>
    </>
  );
};

  /*
          {view === 'profile' && (
            <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm">
              <span className="text-xs uppercase font-black tracking-widest text-slate-400">Demographic Profile</span>
              <p className="text-base font-black text-slate-900 mt-1">{user.gender}, {user.age} Years Old</p>
              <div className="mt-4">
                <span className="text-xs uppercase font-black tracking-widest text-slate-400 block">PHONE NUMBER</span>
                <p className="text-base font-black text-slate-900 mt-1">{user.phone ? user.phone : formatMockPhone(user.id).replace('+1', '+91')}</p>
              </div>
              <p className="text-xs font-bold text-slate-500 mt-4 uppercase tracking-wider">Weight baseline: {user.weightKg} Kg</p>
            </div>
            <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 shadow-sm">
              <span className="text-xs uppercase font-black tracking-widest text-blue-600">Fluid Intake (Today)</span>
              <p className="text-base font-black text-blue-700 mt-1">{user.waterIntakeMl} ml Ingested</p>
              <p className="text-xs font-bold text-blue-500 mt-2 uppercase tracking-wider">Daily Target: {user.targetDailyMl} ml</p>
            </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Telemetry Resolved Risk</span>
              <Badge
                variant={
                  user.status === 'Critical' ? 'red' :
                  user.status === 'High Risk' ? 'amber' :
                  user.status === 'Mild Risk' ? 'cyan' : 'emerald'
                }
                dot
              >
                {user.status}
              </Badge>
            </div>
            <div className="flex items-baseline gap-3">
              <h3 className={`text-6xl font-black ${
                user.riskScore >= 75 ? 'text-red-600' :
                user.riskScore >= 50 ? 'text-orange-500' :
                user.riskScore >= 25 ? 'text-yellow-600' : 'text-emerald-600'
              }`}>
                {user.riskScore}
              </h3>
              <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">/ 100 Risk Index</span>
            </div>
            <div className="pt-4">
              <span className="text-xs uppercase font-black tracking-widest text-slate-400 block mb-2">7-Day Risk History Index trend</span>
              <div className="h-16 flex items-end justify-between gap-1 pt-4 border-b border-dashed border-slate-200 px-2">
                {user.riskHistory.map((val, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end" title={`Day ${idx + 1}: ${val}%`}>
                    <div className={`w-full rounded-t-md transition-all duration-500 ${
                      val >= 75 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]' :
                      val >= 50 ? 'bg-orange-400' :
                      val >= 25 ? 'bg-yellow-400' : 'bg-emerald-500'
                    }`} style={{ height: `${val}%` }}></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-sm space-y-5">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400 block border-b border-slate-200 pb-3">Active Sensor Feeds</span>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <span className="text-[10px] text-slate-400 font-black uppercase block tracking-widest">Heart rate</span>
                <span className="text-base font-black text-slate-900 mt-1 block">{user.heartRate} BPM</span>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <span className="text-[10px] text-slate-400 font-black uppercase block tracking-widest">Exertion</span>
                <span className="text-base font-black text-slate-900 mt-1 block">{user.activityLoad}%</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <span className="text-[10px] text-slate-400 font-black uppercase block tracking-widest">Ambient Temp</span>
                <span className="text-sm font-black text-slate-900 mt-1 block">{user.temperature} °C</span>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <span className="text-[10px] text-slate-400 font-black uppercase block tracking-widest">Ambient Humidity</span>
                <span className="text-sm font-black text-slate-900 mt-1 block">{user.humidity}% rH</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400 block border-b border-slate-200 pb-3">Carrier Telemetry node status</span>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-bold uppercase tracking-wider">Firmware Build</span>
              <span className="text-slate-900 font-mono font-black">{user.firmwareVersion}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-bold uppercase tracking-wider">Hardware Battery level</span>
              <span className="text-emerald-600 font-mono font-black flex items-center gap-2">
                <Battery className="w-4.5 h-4.5" /> {user.batteryLevel}%
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-bold uppercase tracking-wider">BLE Sync Strength</span>
              <span className="text-blue-600 font-mono font-black flex items-center gap-2">
                <Wifi className="w-4.5 h-4.5" /> {user.rssi} dBm
              </span>
            </div>
          </div>
            </div>
          )}

          {view === 'journey' && (
            <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 shadow-sm">
              <UserJourney user={user} />
            </div>
          )}
        </div>

        <div className="flex gap-4 border-t border-slate-100 pt-8 mt-6">
          <button
            onClick={handlePing}
            className="flex-1 bg-white hover:bg-slate-50 text-slate-900 font-black text-sm py-4 rounded-2xl border border-slate-200 shadow-sm transition cursor-pointer uppercase tracking-widest"
          >
            Broadcast GATT Ping
          </button>
          <button
            onClick={handleSimulateIntake}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm py-4 rounded-2xl shadow-lg shadow-blue-200 transition cursor-pointer uppercase tracking-widest"
          >
            Simulate Admin Intake
          </button>
        </div>
      </aside>
    </div>
  );
  */

export default UserDetailDrawer;
