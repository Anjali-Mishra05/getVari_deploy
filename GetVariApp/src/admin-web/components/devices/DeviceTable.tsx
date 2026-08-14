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
    <GlassCard className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Carrier Node</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Assignee</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Battery Status</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">BLE Map (RSSI)</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Firmware</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-right">Action Deck</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-50 transition-colors group">
                <td className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-blue-600">
                      <Cpu size={20} />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-black text-sm text-slate-900 tracking-tight">GetVari Core ESP32</span>
                      <span className="text-[10px] font-mono font-bold text-slate-400 mt-1 uppercase tracking-widest">MAC_{u.id}_F8</span>
                    </div>
                  </div>
                </td>
                <td className="p-6">
                  <span className="text-xs font-black text-slate-900 tracking-tight">{u.name}</span>
                </td>
                <td className="p-6">
                  <div className="flex items-center gap-2">
                    <Battery className={`w-4 h-4 ${
                      u.batteryLevel < 15 ? 'text-red-500 animate-pulse' :
                      u.batteryLevel < 40 ? 'text-orange-500' : 'text-emerald-600'
                    }`} />
                    <span className="text-xs font-mono font-black text-slate-700">{u.batteryLevel}%</span>
                  </div>
                </td>
                <td className="p-6">
                  <div className="flex items-center gap-3">
                    <Wifi size={16} className="text-blue-600" />
                    <span className="text-xs font-mono font-black text-slate-700">{u.rssi} dBm</span>
                    <Badge variant={u.rssi >= -50 ? 'emerald' : u.rssi >= -75 ? 'amber' : 'red'}>
                      {u.rssi >= -50 ? 'EXCELLENT' : u.rssi >= -75 ? 'FAIR' : 'POOR'}
                    </Badge>
                  </div>
                </td>
                <td className="p-6">
                  <div className="flex flex-col">
                    <span className="text-xs font-mono font-black text-slate-900">{u.firmwareVersion}</span>
                    {u.firmwareVersion !== 'v1.4.2' && (
                      <span className="text-[9px] text-orange-600 font-black mt-1 uppercase tracking-tighter">Upgrade Available</span>
                    )}
                  </div>
                </td>
                <td className="p-6 text-right">
                  <div className="flex gap-2 justify-end">
                    {u.firmwareVersion !== 'v1.4.2' && (
                      <button
                        onClick={() => onUpdate(u.id, u.name)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] px-4 py-2 rounded-xl transition uppercase tracking-widest shadow-lg shadow-blue-200"
                      >
                        OTA Update
                      </button>
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
