import React from 'react';
import GlassCard from '../shared/GlassCard';
import { User } from '../../types';

/**
 * Today's logged water across the fleet, by hour of each user's own day.
 *
 * Built from the same entries the user list totals (corrections included, so
 * an hour can net out lower), placed on the hour the user logged them in
 * their zone rather than the admin's.
 */
const ChartTrends: React.FC<{ users: User[] }> = ({ users }) => {
  const byHour = new Map<number, number>();
  for (const user of users) {
    for (const entry of user.waterHistory) {
      const hour = Number(entry.time.slice(0, 2));
      byHour.set(hour, (byHour.get(hour) ?? 0) + entry.amount);
    }
  }
  const data = [...byHour.entries()].sort((a, b) => a[0] - b[0]);
  const max = Math.max(1, ...data.map(([, ml]) => ml));

  return (
    <GlassCard className="space-y-6 h-full flex flex-col">
      <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Water Intake Today (Hourly)</h3>

      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-[11px] font-bold text-slate-400 border-b border-slate-100">
          No water logged today.
        </div>
      ) : (
        <div className="flex items-end justify-between h-48 gap-2 pt-12 border-b border-slate-100 px-4">
          {data.map(([hour, ml]) => (
            <div key={hour} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
              <span className="text-[10px] font-mono font-black text-cyan-600">{(ml / 1000).toFixed(2)}L</span>
              <div className="bg-cyan-500/40 w-full rounded-t-xl" style={{ height: `${Math.max(0, ml / max) * 80}%` }}></div>
              <span className="text-[10px] font-mono font-bold text-slate-400">{String(hour).padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-500 leading-relaxed text-center italic font-medium px-4 mt-auto">
        Hours are on each user's own clock.
      </p>
    </GlassCard>
  );
};

export default ChartTrends;
