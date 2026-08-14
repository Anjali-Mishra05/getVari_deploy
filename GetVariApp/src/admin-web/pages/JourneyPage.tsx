import React, { useMemo, useState, useEffect } from 'react';
import CompactUserList from '../components/users/CompactUserList';
import UserJourney from '../components/users/UserJourney';
import { User } from '../types';
import { Users } from 'lucide-react';
import { SupabaseAdminService } from '../services/SupabaseAdminService';

const JourneyPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadData = async () => {
      const data = await SupabaseAdminService.fetchAllUsers();
      setUsers(data);
      setLoading(false);
    };
    loadData();
  }, []);

  const filtered = useMemo(() => {
    return users.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.id.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [users, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 font-mono text-sm animate-pulse">RECONSTRUCTING JOURNEY LOGS...</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      <aside className="col-span-3">
        <div className="mb-4">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search users..."
            className="w-full bg-white border border-slate-200 p-3 rounded-xl text-sm font-black focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 outline-none transition-all shadow-sm"
          />
        </div>
        <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl shadow-sm">
          <div className="sticky top-6 max-h-[calc(100vh-160px)] overflow-y-auto pr-1">
            <CompactUserList users={filtered} selected={selectedUser?.id ?? null} onSelect={u => setSelectedUser(u)} />
          </div>
        </div>
      </aside>

      <main className="col-span-9">
        {selectedUser ? (
          <div>
            <UserJourney user={selectedUser} />
          </div>
        ) : (
          <div className="p-24 border-2 border-dashed border-slate-200 rounded-[32px] text-center text-slate-400 font-black uppercase tracking-widest flex flex-col items-center gap-4">
            <Users size={48} className="text-slate-200" />
            Select a user from the directory to analyze their journey
          </div>
        )}
      </main>
    </div>
  );
};


export default JourneyPage;
