import React, { useEffect, useState } from 'react';
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
}

const PBWRAdminSection: React.FC<PBWRAdminSectionProps> = ({ userId, fullProfile, waterIntakeMl, breakdown }) => {
  const [history, setHistory] = useState<TelemetrySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const telemetryHistory = await TelemetryHistoryService.getHistory(userId, fullProfile);
        setHistory(telemetryHistory);
      } catch (error) {
        console.error('[PBWRAdmin] Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, fullProfile]);

  if (loading) {
    return (
      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 animate-pulse text-center">
        <span className="text-xs font-mono text-slate-400">CALCULATING PBWR PIPELINE...</span>
      </div>
    );
  }

  if (!breakdown) return null;

  const averages = {
    steps: Math.round(history.reduce((acc, curr) => acc + curr.totalSteps, 0) / history.length),
    temp: (history.reduce((acc, curr) => acc + curr.avgTemp, 0) / history.length).toFixed(1),
    humidity: Math.round(history.reduce((acc, curr) => acc + curr.avgHumidity, 0) / history.length)
  };

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
                  {(breakdown.finalTarget / 1000).toFixed(2)} L ({Math.round(breakdown.finalTarget)} mL)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Formula Pipeline */}
              <div className="space-y-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block border-b border-slate-100 pb-2">Calculation Pipeline</span>
                <div className="space-y-2">
                  <PipelineItem label="Base PBWR" value={`${(breakdown.pbwrBaseline / 1000).toFixed(3)} L`} />
                  <PipelineItem label="Activity Adjustment" value={`+${(breakdown.activityAdj / 1000).toFixed(3)} L`} isAdj />
                  <PipelineItem label="Temperature Adjustment" value={`+${(breakdown.tempAdj / 1000).toFixed(3)} L`} isAdj />
                  <PipelineItem label="Humidity Adjustment" value={`+${(breakdown.humidityAdj / 1000).toFixed(3)} L`} isAdj />
                  <PipelineItem label="Work Env Adjustment" value={`+${(breakdown.workEnvAdj / 1000).toFixed(3)} L`} isAdj />
                  <PipelineItem label="Health Adjustment" value={`+${(breakdown.healthAdj / 1000).toFixed(3)} L`} isAdj />
                  <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-900">Adjusted Total</span>
                    <span className="text-sm font-black text-slate-900">{(breakdown.adjustedTotal / 1000).toFixed(3)} L</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-bold text-slate-400 uppercase tracking-wider">Upper Safety Limit</span>
                    <span className="font-bold text-slate-600">{(breakdown.upperLimit / 1000).toFixed(3)} L</span>
                  </div>
                </div>
              </div>

              {/* 7-Day Averages */}
              <div className="space-y-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block border-b border-slate-100 pb-2">7-Day Observed Averages</span>
                <div className="grid grid-cols-1 gap-2">
                  <AverageCard icon={<Footprints className="w-4 h-4" />} label="Activity / Steps" value={`${averages.steps.toLocaleString()} / day`} />
                  <AverageCard icon={<Thermometer className="w-4 h-4" />} label="Ambient Temp" value={`${averages.temp} °C`} />
                  <AverageCard icon={<CloudRain className="w-4 h-4" />} label="Relative Humidity" value={`${averages.humidity} %`} />
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
                  {chronologicalHistory.map((day, idx) => (
                    <tr key={day.date} className="hover:bg-white transition-colors">
                      <td className="px-6 py-3 text-[10px] font-bold text-slate-400">Day {idx + 1}</td>
                      <td className="px-6 py-3 text-xs font-black text-slate-700">{day.date}</td>
                      <td className="px-6 py-3 text-xs font-mono font-black text-slate-900 text-right">{day.totalSteps.toLocaleString()}</td>
                      <td className="px-6 py-3 text-xs font-mono font-black text-slate-900 text-right">{day.avgTemp.toFixed(1)}°C</td>
                      <td className="px-6 py-3 text-xs font-mono font-black text-slate-900 text-right">{day.avgHumidity}%</td>
                    </tr>
                  ))}
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
