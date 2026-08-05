import React from 'react';
import DeviceTable from '../components/devices/DeviceTable';
import { mockUsers } from '../data/mockData';

const DevicesPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-lg font-extrabold text-white tracking-tight">Active Hardware Nodes</h3>
          <p className="text-xs text-neutral-500 mt-1 uppercase tracking-wider font-bold">Real-time status of all deployed peripherals</p>
        </div>
      </div>

      <DeviceTable
        users={mockUsers}
        onUpdate={(id, name) => console.log('Updating', name)}
      />
    </div>
  );
};

export default DevicesPage;
