import React from 'react';
import { Filter, SortAsc, SortDesc } from 'lucide-react';
import Input from '../shared/Input';

interface FeedbackFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortOrder: 'newest' | 'oldest';
  onSortToggle: () => void;
}

const FeedbackFilters: React.FC<FeedbackFiltersProps> = ({
  searchQuery,
  onSearchChange,
  sortOrder,
  onSortToggle
}) => {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm mb-6">
      <div className="flex-1 max-w-lg">
        <Input
          icon="search"
          placeholder="Search feedback by user, email, or content..."
          value={searchQuery}
          onChange={(e) => onSearchChange((e.target as HTMLInputElement).value)}
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={onSortToggle}
          className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg text-[11px] font-black text-slate-500 transition-all hover:text-blue-600 hover:border-blue-200 group uppercase tracking-widest shadow-sm"
        >
          {sortOrder === 'newest' ? <SortDesc size={15} /> : <SortAsc size={15} />}
          Sort by: {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
        </button>
      </div>
    </div>
  );
};

export default FeedbackFilters;
