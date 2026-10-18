import React, { useMemo, useState } from 'react';
import CompactUserList from '../components/users/CompactUserList';
import UserJourney from '../components/users/UserJourney';
import { Users } from 'lucide-react';
import useAdminUsers from '../hooks/useAdminUsers';
import DataStatus from '../components/shared/DataStatus';

const JourneyPage: React.FC = () => {
  const { users, loading, error, loadedAt, refresh } = useAdminUsers();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedUser = useMemo(() => users.find(u => u.id === selectedId) ?? null, [users, selectedId]);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    return users.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.id.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [users, searchQuery]);

  if (loading && loadedAt === null) {
    return (
      <DataStatus loading loadingLabel="RECONSTRUCTING JOURNEY LOGS..." error={null} loadedAt={null} onRefresh={refresh} />
    );
  }

  return (
    <>
    <DataStatus
      loading={loading}
      loadingLabel="RECONSTRUCTING JOURNEY LOGS..."
      error={error}
      loadedAt={loadedAt}
      onRefresh={refresh}
      isEmpty={users.length === 0}
      emptyLabel="No user profiles yet."
    />
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <aside className="lg:col-span-3">
        <div className="mb-4">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search users..."
            className="w-full bg-white border border-slate-200 p-3 rounded-xl text-sm font-black focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 outline-none transition-all shadow-sm"
          />
        </div>
        <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl shadow-sm">
          <div className="lg:sticky lg:top-6 max-h-[300px] lg:max-h-[calc(100vh-160px)] overflow-y-auto pr-1 custom-scrollbar">
            <CompactUserList users={filtered} selected={selectedUser?.id ?? null} onSelect={u => setSelectedId(u.id)} />
          </div>
        </div>
      </aside>

      <main className="lg:col-span-9">
        {selectedUser ? (
          <div>
            <UserJourney user={selectedUser} />
          </div>
        ) : (
          <div className="p-10 lg:p-24 border-2 border-dashed border-slate-200 rounded-[32px] text-center text-slate-400 font-black uppercase tracking-widest flex flex-col items-center gap-4">
            <Users size={48} className="text-slate-200" />
            Select a user to analyze journey
          </div>
        )}
      </main>
    </div>
    </>
  );
};


export default JourneyPage;
