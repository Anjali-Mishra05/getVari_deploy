import React, { useState, useMemo } from 'react';
import UserFilters from '../components/users/UserFilters';
import UserTable from '../components/users/UserTable';
import { User } from '../types';
import UserDetailDrawer from '../components/users/UserDetailDrawer';
import useAdminUsers from '../hooks/useAdminUsers';
import DataStatus from '../components/shared/DataStatus';

const UsersPage: React.FC = () => {
  const { users, loading, error, loadedAt, refresh } = useAdminUsers();
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [workloadFilter, setWorkloadFilter] = useState('all');
  // By id, so the open drawer follows each refresh instead of freezing on the
  // copy that was clicked.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedUser = useMemo(
    () => users.find(u => u.id === selectedId) ?? null,
    [users, selectedId]
  );

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
    setSelectedId(user.id);
  };

  if (loading && loadedAt === null) {
    return (
      <DataStatus loading loadingLabel="QUERYING USER DATABASE..." error={null} loadedAt={null} onRefresh={refresh} />
    );
  }

  return (
    <div className="space-y-6">
      <DataStatus
        loading={loading}
        loadingLabel="QUERYING USER DATABASE..."
        error={error}
        loadedAt={loadedAt}
        onRefresh={refresh}
        isEmpty={users.length === 0}
        emptyLabel="No user profiles yet."
      />
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
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
};


export default UsersPage;
