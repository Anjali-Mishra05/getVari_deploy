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
            <tr className="border-b border-white/10 bg-neutral-900/30">
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Carrier Node</th>
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Assignee</th>
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Battery Status</th>
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">BLE Map (RSSI)</th>
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Firmware</th>
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 text-right">Action Deck</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-white/[0.02] transition-colors group">
                <td className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-neutral-950/60 rounded-xl border border-white/10 text-cyan-400">
                      <Cpu size={20} />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-extrabold text-sm text-white tracking-tight">GetVari Core ESP32</span>
                      <span className="text-[10px] font-mono text-neutral-500 mt-1 uppercase">MAC_{u.id}_F8</span>
                    </div>
                  </div>
                </td>
                <td className="p-6">
                  <span className="text-xs font-bold text-white tracking-tight">{u.name}</span>
                </td>
                <td className="p-6">
                  <div className="flex items-center gap-2">
                    <Battery className={`w-4 h-4 ${
                      u.batteryLevel < 15 ? 'text-red-500 animate-pulse' :
                      u.batteryLevel < 40 ? 'text-amber-500' : 'text-emerald-400'
                    }`} />
                    <span className="text-xs font-mono font-bold text-neutral-300">{u.batteryLevel}%</span>
                  </div>
                </td>
                <td className="p-6">
                  <div className="flex items-center gap-3">
                    <Wifi size={16} className="text-cyan-400" />
                    <span className="text-xs font-mono font-bold text-neutral-300">{u.rssi} dBm</span>
                    <Badge variant={u.rssi >= -50 ? 'emerald' : u.rssi >= -75 ? 'amber' : 'red'}>
                      {u.rssi >= -50 ? 'EXCELLENT' : u.rssi >= -75 ? 'FAIR' : 'POOR'}
                    </Badge>
                  </div>
                </td>
                <td className="p-6">
                  <div className="flex flex-col">
                    <span className="text-xs font-mono font-bold text-white">{u.firmwareVersion}</span>
                    {u.firmwareVersion !== 'v1.4.2' && (
                      <span className="text-[9px] text-amber-500 font-mono font-bold mt-1 uppercase tracking-tighter">Upgrade Available</span>
                    )}
                  </div>
                </td>
                <td className="p-6 text-right">
                  <div className="flex gap-2 justify-end">
                    {u.firmwareVersion !== 'v1.4.2' && (
                      <button
                        onClick={() => onUpdate(u.id, u.name)}
                        className="bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-mono text-[9px] font-bold px-3 py-2 rounded-lg transition uppercase tracking-widest"
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
