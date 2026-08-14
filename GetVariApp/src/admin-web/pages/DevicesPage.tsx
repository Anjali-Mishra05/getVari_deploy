import React, { useEffect, useState } from 'react';
import DeviceTable from '../components/devices/DeviceTable';
import { User } from '../types';
import { SupabaseAdminService } from '../services/SupabaseAdminService';

const DevicesPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const data = await SupabaseAdminService.fetchAllUsers();
      setUsers(data);
      setLoading(false);
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 font-mono text-sm animate-pulse">SCANNING HARDWARE FLEET...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">Active Hardware Nodes</h3>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-black">Real-time status of all deployed peripherals</p>
        </div>
      </div>

      <DeviceTable
        users={users}
        onUpdate={(id, name) => console.log('Updating', name)}
      />
    </div>
  );
};


export default DevicesPage;
