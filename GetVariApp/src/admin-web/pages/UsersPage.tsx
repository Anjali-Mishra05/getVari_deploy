import React, { useState, useMemo } from 'react';
import UserFilters from '../components/users/UserFilters';
import UserTable from '../components/users/UserTable';
import { mockUsers } from '../data/mockData';
import { User } from '../types';

import UserDetailDrawer from '../components/users/UserDetailDrawer';

const UsersPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [workloadFilter, setWorkloadFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const filteredUsers = useMemo(() => {
    return mockUsers.filter(user => {
      const matchSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          user.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchRisk = riskFilter === 'all' ||
                        user.status.toLowerCase().replace(' ', '') === riskFilter.toLowerCase();

      const matchWorkload = workloadFilter === 'all' ||
                            user.workload.toLowerCase() === workloadFilter.toLowerCase();

      return matchSearch && matchRisk && matchWorkload;
    });
  }, [searchQuery, riskFilter, workloadFilter]);

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
  };

  return (
    <div className="space-y-6">
      <UserFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        riskFilter={riskFilter}
        onRiskFilterChange={setRiskFilter}
        workloadFilter={workloadFilter}
        onWorkloadFilterChange={setWorkloadFilter}
      />

      <UserTable
        users={filteredUsers}
        onUserClick={handleUserSelect}
      />

      {selectedUser && (
        <UserDetailDrawer
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
};

export default UsersPage;
