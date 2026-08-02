import React from 'react';
import { Battery, Wifi } from 'lucide-react';
import GlassCard from '../shared/GlassCard';
import Badge from '../shared/Badge';
import { User } from '../../types';

interface UserTableProps {
  users: User[];
  onUserClick: (user: User) => void;
}

const UserTable: React.FC<UserTableProps> = ({ users, onUserClick }) => {
  return (
    <GlassCard className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-white/10 bg-neutral-900/30">
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Identification</th>
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Risk Profile</th>
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Telemetry</th>
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Hydration</th>
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Hardware</th>
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center p-12 text-neutral-500 italic text-sm">No users found matching current filters.</td>
              </tr>
            ) : (
              users.map(u => (
                <tr
                  key={u.id}
                  className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                  onClick={() => onUserClick(u)}
                >
                  <td className="p-6">
                    <div className="flex flex-col">
                      <span className="font-extrabold text-sm text-white tracking-tight">{u.name}</span>
                      <span className="text-[10px] font-mono text-neutral-500 mt-1 uppercase">{u.id} | {u.workload}</span>
                    </div>
                  </td>
                  <td className="p-6">
                    <Badge
                      variant={
                        u.status === 'Critical' ? 'red' :
                        u.status === 'High Risk' ? 'amber' :
                        u.status === 'Mild Risk' ? 'cyan' : 'emerald'
                      }
                      dot
                    >
                      {u.status} ({u.riskScore})
                    </Badge>
                  </td>
                  <td className="p-6">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white tracking-tight">{u.heartRate} BPM</span>
                      <span className="text-[10px] text-neutral-500 font-mono mt-1 uppercase">Load: {u.activityLoad}%</span>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-cyan-400 tracking-tight">{u.waterIntakeMl} ML</span>
                      <span className="text-[10px] text-neutral-500 font-mono mt-1 uppercase">Target: {u.targetDailyMl} ML</span>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center gap-4 text-[10px] font-mono font-bold">
                      <span className={`flex items-center gap-1.5 ${u.batteryLevel < 20 ? 'text-red-500 animate-pulse' : 'text-neutral-400'}`}>
                        <Battery size={14} /> {u.batteryLevel}%
                      </span>
                      <span className="flex items-center gap-1.5 text-neutral-400">
                        <Wifi size={14} className="text-cyan-500" /> {u.rssi} dBm
                      </span>
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <button className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-4 py-2 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider hover:bg-cyan-500 hover:text-neutral-950 transition-all duration-200">
                      View Dossier
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
};

export default UserTable;
