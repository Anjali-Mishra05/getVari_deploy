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
          className={`flex items-center justify-between gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 border ${
            selected === u.id
              ? 'bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-100'
              : 'bg-white border-transparent hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              selected === u.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              {u.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
            </div>
            <div className="flex flex-col min-w-0">
              <div className={`text-sm font-bold truncate ${selected === u.id ? 'text-blue-900' : 'text-slate-900'}`}>
                {u.name}
              </div>
              <div className="text-[10px] font-mono text-slate-500 truncate uppercase">{u.id}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-tight ${
              u.status === 'Critical' ? 'bg-red-100 text-red-700' :
              u.status === 'High Risk' ? 'bg-orange-100 text-orange-700' :
              u.status === 'Mild Risk' ? 'bg-blue-100 text-blue-700' :
              'bg-emerald-100 text-emerald-700'
            }`}>
              {u.status}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CompactUserList;
