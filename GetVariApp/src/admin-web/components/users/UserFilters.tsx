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
    <div className="bg-white rounded-xl p-4 border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm mb-6">
      <div className="flex-1 max-w-xl">
        <Input
          icon="search"
          placeholder="Filter user directory by name, ID or status..."
          value={searchQuery}
          onChange={(e) => onSearchChange((e.target as HTMLInputElement).value)}
          className="py-2.5 text-sm"
        />
      </div>

      <div className="flex gap-3 items-center flex-wrap lg:flex-nowrap">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all shadow-sm">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={riskFilter}
            onChange={(e) => onRiskFilterChange((e.target as HTMLSelectElement).value)}
            className="bg-transparent text-sm font-bold text-slate-600 border-none outline-none cursor-pointer pr-4"
          >
            <option value="all">System Risk: All</option>
            <option value="critical">Critical Risk</option>
            <option value="high">High Risk</option>
            <option value="mild">Mild Risk</option>
            <option value="hydrated">Hydrated</option>
          </select>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all shadow-sm">
          <Sliders className="w-4 h-4 text-slate-400" />
          <select
            value={workloadFilter}
            onChange={(e) => onWorkloadFilterChange((e.target as HTMLSelectElement).value)}
            className="bg-transparent text-sm font-bold text-slate-600 border-none outline-none cursor-pointer pr-4"
          >
            <option value="all">Workload: All</option>
            <option value="office">Office Protocol</option>
            <option value="commuter">Commuter Flow</option>
            <option value="gym">Gym Exertion</option>
            <option value="field">Field Ops</option>
          </select>
        </div>
      </div>
    </div>
  );
};


export default UserFilters;
