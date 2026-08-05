import React, { useMemo, useState } from 'react';
import { mockUsers } from '../data/mockData';
import CompactUserList from '../components/users/CompactUserList';
import UserJourney from '../components/users/UserJourney';
import { User } from '../types';

const JourneyPage: React.FC = () => {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    return mockUsers.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.id.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery]);

  return (
    <div className="grid grid-cols-12 gap-6">
      <aside className="col-span-3">
        <div className="mb-4">
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search users..." className="w-full bg-neutral-900/40 p-3 rounded" />
        </div>
        <div className="bg-neutral-900/30 p-3 rounded-lg">
          <div className="sticky top-6 max-h-[calc(100vh-120px)] overflow-y-auto">
            <CompactUserList users={filtered} selected={selectedUser?.id ?? null} onSelect={u => setSelectedUser(u)} />
          </div>
        </div>
      </aside>

      <main className="col-span-9">
        {selectedUser ? (
          <div className="p-4 bg-neutral-900/40 rounded-xl">
            <UserJourney user={selectedUser} />
          </div>
        ) : (
          <div className="p-6 bg-neutral-950/50 rounded-xl text-neutral-500">Select a user to view their journey.</div>
        )}
      </main>
    </div>
  );
};

export default JourneyPage;
