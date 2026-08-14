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
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Identification</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Risk Profile</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Telemetry</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Hydration</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Hardware</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center p-12 text-slate-400 italic text-sm font-medium">No users found matching current filters.</td>
              </tr>
            ) : (
              users.map(u => (
                <tr
                  key={u.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer group"
                  onClick={() => onUserClick(u)}
                >
                  <td className="p-6">
                    <div className="flex flex-col">
                      <span className="font-black text-sm text-slate-900 tracking-tight">{u.name}</span>
                      <span className="text-[10px] font-mono font-bold text-slate-400 mt-1 uppercase tracking-widest">{u.id} | {u.workload}</span>
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
                      <span className="text-xs font-black text-slate-900 tracking-tight">{u.heartRate} BPM</span>
                      <span className="text-[10px] font-mono font-bold text-slate-400 mt-1 uppercase tracking-widest">Load: {u.activityLoad}%</span>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-blue-600 tracking-tight">{u.waterIntakeMl} ML</span>
                      <span className="text-[10px] font-mono font-bold text-slate-400 mt-1 uppercase tracking-widest">Target: {u.targetDailyMl} ML</span>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center gap-4 text-[10px] font-mono font-black">
                      <span className={`flex items-center gap-1.5 ${u.batteryLevel < 20 ? 'text-red-600 animate-pulse' : 'text-slate-500'}`}>
                        <Battery size={14} /> {u.batteryLevel}%
                      </span>
                      <span className="flex items-center gap-1.5 text-slate-500">
                        <Wifi size={14} className="text-blue-600" /> {u.rssi} dBm
                      </span>
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <button className="bg-blue-50 text-blue-600 border border-blue-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all duration-200 shadow-sm">
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
