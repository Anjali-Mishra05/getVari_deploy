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
    <div>
      <DeviceTable
        users={users}
        onUpdate={(id, name) => console.log('Updating', name)}
      />
    </div>
  );
};


export default DevicesPage;
