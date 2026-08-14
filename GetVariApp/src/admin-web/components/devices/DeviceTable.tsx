import React from 'react';
import { Cpu, Battery, Wifi, RefreshCw } from 'lucide-react';
import GlassCard from '../shared/GlassCard';
import Badge from '../shared/Badge';
import { User } from '../../types';

interface DeviceTableProps {
  users: User[];
  onUpdate: (id: string, name: string) => void;
}

const DeviceTable: React.FC<DeviceTableProps> = ({ users, onUpdate }) => {
  return (
    <GlassCard className="!p-0 overflow-hidden border-slate-200 shadow-md rounded-xl">
      <div className="overflow-hidden">
        <table className="w-full table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[14%]" />
            <col className="w-[15%]" />
            <col className="w-[21%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-slate-500">Hardware Node</th>
              <th className="px-4 py-5 text-[11px] font-bold uppercase tracking-widest text-slate-500">Assignee</th>
              <th className="px-4 py-5 text-[11px] font-bold uppercase tracking-widest text-slate-500">Power Status</th>
              <th className="px-4 py-5 text-[11px] font-bold uppercase tracking-widest text-slate-500">Signal Integrity</th>
              <th className="px-4 py-5 text-[11px] font-bold uppercase tracking-widest text-slate-500">Firmware Build</th>
              <th className="px-5 py-5 text-[11px] font-bold uppercase tracking-widest text-slate-500 text-left">Action Deck</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-blue-50/30 transition-all group">
                <td className="px-6 py-4 align-middle">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg border border-blue-100 text-blue-600 shadow-sm group-hover:bg-white">
                      <Cpu size={20} />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <span className="font-bold text-sm text-slate-900 tracking-tight">GetVari Core ESP32</span>
                      <code className="block w-full max-w-full truncate whitespace-nowrap text-[10px] font-mono font-bold text-slate-400 bg-slate-50 px-1.5 py-1 rounded border border-slate-100 uppercase tracking-wide">MAC_{u.id}_F8</code>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 align-middle">
                  <span className="block truncate text-sm font-bold text-slate-800 tracking-tight">{u.name}</span>
                </td>
                <td className="px-4 py-4 align-middle">
                  <div className="flex items-center gap-2">
                    <Battery className={`w-4 h-4 ${
                      u.batteryLevel < 15 ? 'text-rose-500 animate-pulse' :
                      u.batteryLevel < 40 ? 'text-amber-500' : 'text-emerald-500'
                    }`} />
                    <span className="text-sm font-bold text-slate-700 font-mono">{u.batteryLevel}%</span>
                  </div>
                </td>
                <td className="px-4 py-4 align-middle">
                  <div className="flex items-center gap-3">
                    <Wifi size={16} className="text-blue-500" />
                    <span className="text-sm font-bold text-slate-700 font-mono">{u.rssi} dBm</span>
                    <Badge
                       variant={u.rssi < 0 && u.rssi >= -50 ? 'emerald' : u.rssi < 0 && u.rssi >= -75 ? 'amber' : 'red'}
                       className="px-3 py-1 text-xs"
                    >
                      {u.rssi < 0 && u.rssi >= -50 ? 'EXCELLENT' : u.rssi < 0 && u.rssi >= -75 ? 'FAIR' : 'POOR'}
                    </Badge>
                  </div>
                </td>
                <td className="px-4 py-4 align-middle">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold text-slate-800 font-mono">{u.firmwareVersion}</span>
                    {u.firmwareVersion !== 'v1.4.2' && (
                      <div className="flex items-center gap-2 mt-1.5 whitespace-nowrap">
                         <RefreshCw size={12} className="text-amber-600 animate-spin-slow" />
                         <span className="whitespace-nowrap text-[10px] text-amber-600 font-bold uppercase tracking-tight">Update Available</span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 align-middle text-left">
                  <div className="flex justify-start">
                    {u.firmwareVersion !== 'v1.4.2' ? (
                      <button
                        onClick={() => onUpdate(u.id, u.name)}
                        className="whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] px-4 py-2 rounded-lg transition-all uppercase tracking-wider shadow-md shadow-blue-100 border border-blue-700 active:scale-95"
                      >
                        Push OTA Update
                      </button>
                    ) : (
                      <Badge variant="neutral" className="bg-slate-50 text-slate-400 border-slate-100 text-xs">STABLE BUILD</Badge>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
};


export default DeviceTable;
