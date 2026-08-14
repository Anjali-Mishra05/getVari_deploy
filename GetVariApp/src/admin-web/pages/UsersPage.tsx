import React, { useState, useMemo, useEffect } from 'react';
import UserFilters from '../components/users/UserFilters';
import UserTable from '../components/users/UserTable';
import { User } from '../types';
import UserDetailDrawer from '../components/users/UserDetailDrawer';
import { SupabaseAdminService } from '../services/SupabaseAdminService';

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [workloadFilter, setWorkloadFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    const loadUsers = async () => {
      const data = await SupabaseAdminService.fetchAllUsers();
      setUsers(data);
      setLoading(false);
    };
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          user.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchRisk = riskFilter === 'all' ||
                        user.status.toLowerCase().replace(' ', '') === riskFilter.toLowerCase();

      const matchWorkload = workloadFilter === 'all' ||
                            user.workload.toLowerCase() === workloadFilter.toLowerCase();

      return matchSearch && matchRisk && matchWorkload;
    });
  }, [users, searchQuery, riskFilter, workloadFilter]);

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 font-mono text-sm animate-pulse">QUERYING USER DATABASE...</div>
      </div>
    );
  }

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
