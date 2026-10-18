import React from 'react';
import { RefreshCw } from 'lucide-react';

interface DataStatusProps {
  loading: boolean;
  error: string | null;
  loadedAt: number | null;
  onRefresh: () => void;
  /** What a successful but empty read means on this page. */
  emptyLabel?: string;
  isEmpty?: boolean;
  /** Shown while nothing has loaded yet. */
  loadingLabel: string;
}

/**
 * The one strip every data page shows above its content: when it was last
 * read, a refresh button, and — instead of an empty table — what went wrong.
 *
 * A failed read used to come back as an empty list, so a permission error and
 * a fleet with no users looked identical.
 */
const DataStatus: React.FC<DataStatusProps> = ({
  loading,
  error,
  loadedAt,
  onRefresh,
  emptyLabel,
  isEmpty,
  loadingLabel,
}) => {
  if (loading && loadedAt === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 font-mono text-sm animate-pulse">{loadingLabel}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-slate-400">
        <span>
          {loadedAt
            ? `Updated ${new Date(loadedAt).toLocaleTimeString()} · refreshes every 30 s`
            : 'Not loaded yet'}
        </span>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>
      {error && (
        <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-bold">
          Could not load data: {error}
          {loadedAt ? ' — showing the last successful read.' : ''}
        </div>
      )}
      {!error && isEmpty && emptyLabel && (
        <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 text-xs font-bold">
          {emptyLabel}
        </div>
      )}
    </div>
  );
};

export default DataStatus;
