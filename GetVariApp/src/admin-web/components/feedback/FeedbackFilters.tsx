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
    <div className="glass rounded-2xl p-5 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-6 backdrop-blur-md mb-8">
      <div className="flex-1 max-w-lg">
        <Input
          icon="search"
          placeholder="Search feedback by user, email, or content..."
          value={searchQuery}
          onChange={(e) => onSearchChange((e.target as HTMLInputElement).value)}
        />
      </div>

      <div className="flex gap-4">
        <button
          onClick={onSortToggle}
          className="flex items-center gap-3 bg-neutral-950/60 border border-white/10 px-6 py-2.5 rounded-xl text-xs font-bold text-neutral-300 transition-all hover:text-white hover:border-cyan-500/30 group uppercase tracking-widest"
        >
          {sortOrder === 'newest' ? <SortDesc size={16} /> : <SortAsc size={16} />}
          Sort by: {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
        </button>
      </div>
    </div>
  );
};

export default FeedbackFilters;
