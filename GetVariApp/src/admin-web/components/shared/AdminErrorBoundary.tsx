import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface AdminErrorBoundaryProps {
  /** What failed to display, e.g. "this user’s details". */
  label: string;
  children: React.ReactNode;
  /** Shown next to "Try again", e.g. a Close button for a drawer. */
  actions?: React.ReactNode;
  /** A change (e.g. another user opened) clears a previous failure. */
  resetKey?: unknown;
  /** A smaller card, for a section inside a page rather than the page itself. */
  compact?: boolean;
}

interface AdminErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps one part of the admin panel failing on its own.
 *
 * Without a boundary, an error while rendering anything unmounts the whole
 * React tree, and all that is left is the page's dark body — which is what
 * "View Details" opening a black screen was. This shows what failed, and why,
 * in the place it failed, with the rest of the panel still usable.
 */
class AdminErrorBoundary extends React.Component<AdminErrorBoundaryProps, AdminErrorBoundaryState> {
  state: AdminErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AdminErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[Admin] Could not display ${this.props.label}:`, error, info.componentStack);
  }

  componentDidUpdate(prev: AdminErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { label, actions, compact } = this.props;
    return (
      <div
        role="alert"
        className={`bg-red-50 border border-red-100 text-red-700 ${compact ? 'p-4 rounded-2xl' : 'p-6 rounded-3xl'} space-y-3`}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="text-xs font-black uppercase tracking-widest">Could not display {label}</span>
        </div>
        <p className="text-xs font-mono break-words text-red-600">{error.message || String(error)}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={this.retry}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-red-200 text-xs font-black uppercase tracking-widest hover:bg-red-100 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
          {actions}
        </div>
      </div>
    );
  }
}

export default AdminErrorBoundary;
