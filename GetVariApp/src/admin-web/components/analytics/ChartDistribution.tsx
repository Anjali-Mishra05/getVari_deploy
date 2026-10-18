import React from 'react';
import GlassCard from '../shared/GlassCard';
import { User } from '../../types';

/** The app's status labels and the colours its risk card uses for them. */
const BANDS: { status: User['status']; label: string; bar: string }[] = [
  { status: 'Hydrated', label: 'Hydrated', bar: 'bg-emerald-500' },
  { status: 'Mild Risk', label: 'Mild', bar: 'bg-yellow-500' },
  { status: 'High Risk', label: 'High', bar: 'bg-orange-500' },
  { status: 'Critical', label: 'Critical', bar: 'bg-red-500' },
  { status: 'Insufficient Data', label: 'No data', bar: 'bg-slate-300' },
];

const ChartDistribution: React.FC<{ users: User[] }> = ({ users }) => {
  const counts = BANDS.map(band => ({
    ...band,
    count: users.filter(u =>
      band.status === 'Insufficient Data'
        ? u.status === 'Insufficient Data' || u.status === 'Device Error'
        : u.status === band.status
    ).length,
  }));
  const max = Math.max(1, ...counts.map(c => c.count));

  return (
    <GlassCard className="space-y-6 h-full flex flex-col">
      <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Hydration Risk Distribution</h3>

      <div className="flex items-end justify-between h-48 gap-3 pt-12 border-b border-slate-100 px-4 relative">
        <div className="absolute left-0 top-0 text-[10px] font-mono text-slate-400 uppercase border-l border-slate-200 pl-3 font-bold tracking-widest">Users Count</div>
        {counts.map(c => (
          <div key={c.status} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <span className="text-[11px] font-mono font-black text-slate-700">{c.count}</span>
            <div className={`${c.bar} w-full rounded-t-xl`} style={{ height: `${(c.count / max) * 80}%` }}></div>
            <span className="text-[10px] font-mono font-bold text-neutral-500 uppercase">{c.label}</span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed text-center italic font-medium px-4 mt-auto">
        Each user's status as the app's risk model resolves it now.
      </p>
    </GlassCard>
  );
};

export default ChartDistribution;
