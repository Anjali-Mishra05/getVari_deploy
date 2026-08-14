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
    <GlassCard className="p-0 overflow-hidden border-slate-200 shadow-md rounded-xl">
      <div className="overflow-hidden">
        <table className="w-full table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[14%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[18%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-slate-500">Identification</th>
              <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-slate-500">System Risk Profile</th>
              <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-slate-500">Biometric Sync</th>
              <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-slate-500">Hydration Intake</th>
              <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-slate-500">Hardware Status</th>
              <th className="px-4 py-5 text-[11px] font-bold uppercase tracking-widest text-slate-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center p-16 text-slate-400 italic text-sm font-medium bg-white">No users found matching current filters.</td>
              </tr>
            ) : (
              users.map(u => (
                <tr
                  key={u.id}
                  className="hover:bg-blue-50/30 transition-all cursor-pointer group bg-white"
                  onClick={() => onUserClick(u)}
                >
                  <td className="px-6 py-5 align-middle">
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-slate-900 tracking-tight">{u.name}</span>
                      <span className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-wider">{u.id} | {u.workload}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 align-middle">
                    <Badge
                      variant={
                        u.status === 'Critical' ? 'red' :
                        u.status === 'High Risk' ? 'amber' :
                        u.status === 'Mild Risk' ? 'cyan' : 'emerald'
                      }
                      dot
                      className="px-2.5 py-1 text-[11px]"
                    >
                      {u.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-5 align-middle">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-bold text-slate-800">{u.heartRate || '--'} bpm</span>
                      <span className="text-xs font-medium text-slate-500">Exertion: {u.activityLoad || 0}% | GSR: {u.sweatGSR || 0}µS</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 align-middle">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-bold text-blue-600 tracking-tight">{u.waterIntakeMl} ML</span>
                      <span className="text-xs font-medium text-slate-500">Target: {u.targetDailyMl} ML</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 align-middle">
                    <div className="flex items-center gap-6 text-xs font-bold whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`flex items-center gap-1.5 ${u.batteryLevel < 20 ? 'text-rose-600 animate-pulse' : 'text-slate-600'}`}>
                          <Battery size={14} className={u.batteryLevel < 20 ? 'fill-rose-50' : 'fill-slate-50'} /> {u.batteryLevel}%
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <Wifi size={14} className="text-blue-500" /> {u.rssi} dBm
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-5 align-middle text-right">
                    <button className="whitespace-nowrap bg-white text-blue-600 border border-blue-200 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all duration-200 shadow-sm group-hover:shadow-md">
                      View Details
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
