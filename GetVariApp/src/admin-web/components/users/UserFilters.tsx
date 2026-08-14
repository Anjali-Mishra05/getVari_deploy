import React from 'react';
import { Filter, Sliders } from 'lucide-react';
import Input from '../shared/Input';

interface UserFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  riskFilter: string;
  onRiskFilterChange: (filter: string) => void;
  workloadFilter: string;
  onWorkloadFilterChange: (filter: string) => void;
}

const UserFilters: React.FC<UserFiltersProps> = ({
  searchQuery,
  onSearchChange,
  riskFilter,
  onRiskFilterChange,
  workloadFilter,
  onWorkloadFilterChange
}) => {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-sm mb-8">
      <div className="flex-1 max-w-lg">
        <Input
          icon="search"
          placeholder="Search user catalog by name or serial ID..."
          value={searchQuery}
          onChange={(e) => onSearchChange((e.target as HTMLInputElement).value)}
        />
      </div>

      <div className="flex gap-4 flex-wrap">
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl focus-within:border-blue-600 transition-all">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={riskFilter}
            onChange={(e) => onRiskFilterChange((e.target as HTMLSelectElement).value)}
            className="bg-transparent text-xs font-black text-slate-700 border-none outline-none cursor-pointer uppercase tracking-widest"
          >
            <option value="all">All Risks</option>
            <option value="critical">Critical Risk</option>
            <option value="high">High Risk</option>
            <option value="mild">Mild Risk</option>
            <option value="hydrated">Hydrated</option>
          </select>
        </div>

        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl focus-within:border-blue-600 transition-all">
          <Sliders className="w-4 h-4 text-slate-400" />
          <select
            value={workloadFilter}
            onChange={(e) => onWorkloadFilterChange((e.target as HTMLSelectElement).value)}
            className="bg-transparent text-xs font-black text-slate-700 border-none outline-none cursor-pointer uppercase tracking-widest"
          >
            <option value="all">All Workloads</option>
            <option value="office">Office Worker</option>
            <option value="commuter">Commuter</option>
            <option value="gym">Gym Workload</option>
            <option value="field">Field Worker</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default UserFilters;
