import React from 'react';
import { Star, ArrowRight } from 'lucide-react';
import GlassCard from '../shared/GlassCard';
import Badge from '../shared/Badge';
import { Feedback } from '../../types';

interface FeedbackTableProps {
  feedbacks: Feedback[];
  onViewDetails: (feedback: Feedback) => void;
}

const FeedbackTable: React.FC<FeedbackTableProps> = ({ feedbacks, onViewDetails }) => {
  return (
    <GlassCard className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-white/10 bg-neutral-900/30">
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">User Details</th>
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 w-1/3">Feedback Preview</th>
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Rating</th>
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Timestamp</th>
              <th className="p-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {feedbacks.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center p-12 text-neutral-500 italic text-sm">No feedback records found.</td>
              </tr>
            ) : (
              feedbacks.map(fb => (
                <tr
                  key={fb.id}
                  className="hover:bg-white/[0.02] transition-colors group"
                >
                  <td className="p-6">
                    <div className="flex flex-col">
                      <span className="font-extrabold text-sm text-white tracking-tight">{fb.userName}</span>
                      <span className="text-[10px] font-mono text-neutral-500 mt-1 lowercase">{fb.email}</span>
                    </div>
                  </td>
                  <td className="p-6">
                    <p className="text-xs text-neutral-400 line-clamp-1 leading-relaxed">{fb.preview}</p>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center gap-1 text-amber-500">
                      <Star size={12} fill="currentColor" />
                      <span className="text-xs font-bold font-mono">{fb.rating || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-neutral-300 tracking-tight">{fb.date}</span>
                      <span className="text-[10px] text-neutral-500 font-mono mt-1">{fb.time}</span>
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <button
                      onClick={() => onViewDetails(fb)}
                      className="bg-white/5 hover:bg-cyan-500 hover:text-neutral-950 text-white font-mono text-[10px] font-bold px-4 py-2 rounded-xl border border-white/10 transition-all duration-200 flex items-center gap-2 ml-auto uppercase tracking-wider"
                    >
                      View Details <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
};

export default FeedbackTable;
