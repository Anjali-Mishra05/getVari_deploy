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
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">User Details</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 w-1/3">Feedback Preview</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Rating</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Timestamp</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {feedbacks.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center p-12 text-slate-400 italic text-sm font-medium">No feedback records found.</td>
              </tr>
            ) : (
              feedbacks.map(fb => (
                <tr
                  key={fb.id}
                  className="hover:bg-slate-50 transition-colors group"
                >
                  <td className="p-6">
                    <div className="flex flex-col">
                      <span className="font-black text-sm text-slate-900 tracking-tight">{fb.userName}</span>
                      <span className="text-[10px] font-mono font-bold text-slate-400 mt-1 uppercase tracking-widest">{fb.email}</span>
                    </div>
                  </td>
                  <td className="p-6">
                    <p className="text-xs text-slate-500 line-clamp-1 leading-relaxed font-medium">{fb.preview}</p>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center gap-1 text-orange-500">
                      <Star size={12} fill="currentColor" />
                      <span className="text-xs font-black font-mono">{fb.rating || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-700 tracking-tight">{fb.date}</span>
                      <span className="text-[10px] font-mono font-bold text-slate-400 mt-1">{fb.time}</span>
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <button
                      onClick={() => onViewDetails(fb)}
                      className="bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 font-black text-[10px] px-4 py-2 rounded-xl border border-blue-100 transition-all duration-200 flex items-center gap-2 ml-auto uppercase tracking-widest shadow-sm"
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
