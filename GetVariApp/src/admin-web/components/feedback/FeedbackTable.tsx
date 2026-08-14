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
    <GlassCard className="p-0 overflow-hidden border-slate-200 shadow-md rounded-xl">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="p-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">User Identification</th>
              <th className="p-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 w-2/5">Feedback Narrative</th>
              <th className="p-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">Satisfaction</th>
              <th className="p-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">Log Temporal</th>
              <th className="p-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {feedbacks.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center p-16 text-slate-400 italic text-sm font-medium">No feedback records found in telemetry store.</td>
              </tr>
            ) : (
              feedbacks.map(fb => (
                <tr
                  key={fb.id}
                  className="hover:bg-blue-50/30 transition-all group"
                >
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-sm text-slate-900 tracking-tight">{fb.userName}</span>
                      <span className="text-xs font-medium text-slate-400 uppercase tracking-tight">{fb.email}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="relative group">
                       <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed font-medium group-hover:text-slate-900 transition-colors">{fb.preview}</p>
                       <div className="w-10 h-0.5 bg-blue-500 rounded-full mt-2 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"></div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 bg-orange-50 px-2.5 py-1 rounded-md border border-orange-100 w-fit">
                      <Star size={14} className="text-orange-500 fill-orange-500" />
                      <span className="text-sm font-bold text-orange-700 font-mono">{fb.rating || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-bold text-slate-700 tracking-tight flex items-center gap-2">
                         <span className="w-2 h-2 rounded-full bg-slate-300"></span> {fb.date}
                      </span>
                      <span className="text-xs font-medium text-slate-400 pl-4">{fb.time}</span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => onViewDetails(fb)}
                      className="bg-white hover:bg-blue-600 hover:text-white text-blue-600 font-bold text-xs px-4 py-2 rounded-lg border border-blue-200 transition-all duration-200 flex items-center gap-1.5 ml-auto uppercase tracking-wider shadow-sm group-hover:shadow-md"
                    >
                      Audit Details <ArrowRight size={15} />
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
