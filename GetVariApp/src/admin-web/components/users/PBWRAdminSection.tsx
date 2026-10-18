import React, { useEffect, useRef, useState } from 'react';
import {
  Droplet,
  ArrowRight,
  History,
  Calendar,
  Footprints,
  Thermometer,
  CloudRain,
  Info,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import PBWRService, { PBWRBreakdown } from '../../../services/PBWRService';
import TelemetryHistoryService, { TelemetrySnapshot } from '../../../services/TelemetryHistoryService';

interface PBWRAdminSectionProps {
  userId: string;
  fullProfile: any;
  waterIntakeMl: number;
  breakdown: PBWRBreakdown | null;
  /** The breakdown is still being calculated. */
  breakdownLoading?: boolean;
  /**
   * Changes when the profile is saved again. The history is re-read on that,
   * not on every admin refresh — each refresh hands over a new profile object
   * with the same contents.
   */
  profileVersion?: string | null;
}

/** A reading that is a real number, or null for missing (never 0). */
const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * The mean of the days that have a value.
 *
 * "Missing != Zero", as in the app: a day with no reading is left out rather
 * than counted as 0, and a week with none at all has no average.
 */
const meanOf = (values: unknown[]): number | null => {
  const present = values.map(finite).filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
};

const MISSING = '—';
const litres = (ml: unknown): string => {
  const value = finite(ml);
  return value === null ? MISSING : `${(value / 1000).toFixed(3)} L`;
};
const signedLitres = (ml: unknown): string => {
  const value = finite(ml);
  return value === null ? MISSING : `${value < 0 ? '' : '+'}${(value / 1000).toFixed(3)} L`;
};

const PBWRAdminSection: React.FC<PBWRAdminSectionProps> = ({
  userId,
  fullProfile,
  breakdown,
  breakdownLoading = false,
  profileVersion = null,
}) => {
  const [history, setHistory] = useState<TelemetrySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  // Read through a ref so a refresh's new-but-identical profile object does
  // not re-run the fetch; `profileVersion` stands for a real change.
  const profileRef = useRef(fullProfile);
  profileRef.current = fullProfile;

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        // The same window PBWR averages: the previous 7 complete days, rolling
        // forward each day (today, still in progress, is not part of it).
        const telemetryHistory = await TelemetryHistoryService.getHistory(userId, profileRef.current, 1);
        if (!cancelled) setHistory(Array.isArray(telemetryHistory) ? telemetryHistory : []);
      } catch (error) {
        console.error('[PBWRAdmin] Failed to fetch data:', error);
        if (!cancelled) {
          setHistory([]);
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [userId, profileVersion]);

  if (loading || breakdownLoading) {
    return (
      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 animate-pulse text-center">
        <span className="text-xs font-mono text-slate-400">CALCULATING PBWR PIPELINE...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="bg-red-50 p-5 rounded-3xl border border-red-100 text-xs font-bold text-red-700">
        Could not load this user&apos;s telemetry history: {loadError}
      </div>
    );
  }

  if (!breakdown) {
    return (
      <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 text-xs font-bold text-slate-500">
        PBWR breakdown not available for this user. The daily target cannot be stated (for example, a
        doctor&apos;s limit is required but missing) or the profile is incomplete.
      </div>
    );
  }

  const avgSteps = meanOf(history.map(day => day?.totalSteps));
  const avgTemp = meanOf(history.map(day => day?.avgTemp));
  const avgHumidity = meanOf(history.map(day => day?.avgHumidity));
  const averages = {
    steps: avgSteps === null ? MISSING : `${Math.round(avgSteps).toLocaleString()} / day`,
    temp: avgTemp === null ? MISSING : `${avgTemp.toFixed(1)} °C`,
    humidity: avgHumidity === null ? MISSING : `${Math.round(avgHumidity)} %`,
  };
  const finalTarget = finite(breakdown.finalTarget);

  const chronologicalHistory = history;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-2">
          <Droplet className="w-4 h-4 text-blue-600" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">PBWR / Daily Hydration</span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="space-y-4 animate-fadeIn">
          {/* Summary Card */}
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-blue-500">Algorithm Status</span>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-2 h-2 rounded-full ${breakdown.isCalibrationPeriod ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
                  <span className="text-sm font-black text-slate-900">
                    {breakdown.isCalibrationPeriod ? 'Calibration Phase (Day 1-7)' : 'Active Monitoring (Day 8+)'}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Final daily target</span>
                <p className="text-2xl font-black text-blue-700 mt-1">
                  {finalTarget === null ? MISSING : `${(finalTarget / 1000).toFixed(2)} L (${Math.round(finalTarget)} mL)`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Formula Pipeline */}
              <div className="space-y-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block border-b border-slate-100 pb-2">Calculation Pipeline</span>
                <div className="space-y-2">
                  <PipelineItem label="Base PBWR" value={litres(breakdown.pbwrBaseline)} />
                  <PipelineItem label="Activity Adjustment" value={signedLitres(breakdown.activityAdj)} isAdj />
                  <PipelineItem label="Temperature Adjustment" value={signedLitres(breakdown.tempAdj)} isAdj />
                  <PipelineItem label="Humidity Adjustment" value={signedLitres(breakdown.humidityAdj)} isAdj />
                  <PipelineItem label="Work Env Adjustment" value={signedLitres(breakdown.workEnvAdj)} isAdj />
                  <PipelineItem label="Health Adjustment" value={signedLitres(breakdown.healthAdj)} isAdj />
                  <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-900">Adjusted Total</span>
                    <span className="text-sm font-black text-slate-900">{litres(breakdown.adjustedTotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-bold text-slate-400 uppercase tracking-wider">Upper Safety Limit</span>
                    <span className="font-bold text-slate-600">{litres(breakdown.upperLimit)}</span>
                  </div>
                </div>
              </div>

              {/* 7-Day Averages */}
              <div className="space-y-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block border-b border-slate-100 pb-2">7-Day Observed Averages</span>
                <div className="grid grid-cols-1 gap-2">
                  <AverageCard icon={<Footprints className="w-4 h-4" />} label="Activity / Steps" value={averages.steps} />
                  <AverageCard icon={<Thermometer className="w-4 h-4" />} label="Ambient Temp" value={averages.temp} />
                  <AverageCard icon={<CloudRain className="w-4 h-4" />} label="Relative Humidity" value={averages.humidity} />
                </div>
              </div>
            </div>
          </div>

          {/* History Table */}
          <div className="bg-slate-50 rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">7-Day Snapshot Log</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/50">
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Day</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Date</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 text-right">Steps</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 text-right">Temp</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 text-right">Humidity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {chronologicalHistory.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 text-xs font-bold text-slate-400 text-center">
                        No telemetry snapshots for the previous 7 days.
                      </td>
                    </tr>
                  )}
                  {chronologicalHistory.map((day, idx) => {
                    // A day the app had no reading for is stored as null.
                    const steps = finite(day?.totalSteps);
                    const temp = finite(day?.avgTemp);
                    const humidity = finite(day?.avgHumidity);
                    return (
                      <tr key={day?.date ?? idx} className="hover:bg-white transition-colors">
                        <td className="px-6 py-3 text-[10px] font-bold text-slate-400">Day {idx + 1}</td>
                        <td className="px-6 py-3 text-xs font-black text-slate-700">{day?.date ?? MISSING}</td>
                        <td className="px-6 py-3 text-xs font-mono font-black text-slate-900 text-right">{steps === null ? MISSING : steps.toLocaleString()}</td>
                        <td className="px-6 py-3 text-xs font-mono font-black text-slate-900 text-right">{temp === null ? MISSING : `${temp.toFixed(1)}°C`}</td>
                        <td className="px-6 py-3 text-xs font-mono font-black text-slate-900 text-right">{humidity === null ? MISSING : `${Math.round(humidity)}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PipelineItem = ({ label, value, isAdj }: { label: string; value: string; isAdj?: boolean }) => (
  <div className="flex justify-between items-center text-xs">
    <span className="text-slate-500 font-medium">{label}</span>
    <span className={`font-black ${isAdj ? 'text-blue-600' : 'text-slate-900'}`}>{value}</span>
  </div>
);

const AverageCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
    <div className="p-2 bg-slate-50 rounded-xl text-blue-600">
      {icon}
    </div>
    <div>
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block leading-none">{label}</span>
      <span className="text-sm font-black text-slate-900 mt-1 block">{value}</span>
    </div>
  </div>
);

export default PBWRAdminSection;
