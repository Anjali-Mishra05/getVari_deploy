import React from 'react';
import Badge from '../shared/Badge';
import { User } from '../../types';

interface Props {
  users: User[];
  selected?: string | null;
  onSelect: (u: User) => void;
}

const CompactUserList: React.FC<Props> = ({ users, selected, onSelect }) => {
  return (
    <div className="space-y-2">
      {users.map(u => (
        <div
          key={u.id}
          onClick={() => onSelect(u)}
          className={`flex items-center justify-between gap-3 p-2 rounded-lg cursor-pointer transition ${selected === u.id ? 'bg-white/6 border-l-4 border-cyan-400/60 shadow-sm' : 'hover:bg-white/[0.02]'}`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-md bg-neutral-900/40 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">{u.name.split(' ').map(s=>s[0]).slice(0,2).join('')}</div>
            <div className="flex flex-col min-w-0">
              <div className="text-sm font-bold text-white truncate">{u.name}</div>
              <div className="text-[11px] font-mono text-neutral-400 truncate">{u.id}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <Badge
              variant={
                u.status === 'Critical' ? 'red' :
                u.status === 'High Risk' ? 'amber' :
                u.status === 'Mild Risk' ? 'cyan' : 'emerald'
              }
            >
              {u.status}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CompactUserList;
