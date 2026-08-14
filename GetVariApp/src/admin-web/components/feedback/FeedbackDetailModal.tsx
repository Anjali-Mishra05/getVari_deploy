import React from 'react';
import { Star, Mail, User, Clock, Calendar } from 'lucide-react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { Feedback } from '../../types';

interface FeedbackDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  feedback: Feedback | null;
}

const FeedbackDetailModal: React.FC<FeedbackDetailModalProps> = ({ isOpen, onClose, feedback }) => {
  if (!feedback) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Feedback Dossier"
      subtitle={`ID: ${feedback.id}`}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="primary">Archive Feedback</Button>
        </div>
      }
    >
      <div className="space-y-8">
        {/* User Info Grid */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3 shadow-sm">
            <div className="flex items-center gap-3 text-blue-600">
              <User size={18} />
              <span className="text-[10px] uppercase font-black tracking-widest">User Identity</span>
            </div>
            <p className="text-xl font-black text-slate-900 tracking-tight">{feedback.userName}</p>
          </div>

          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3 shadow-sm">
            <div className="flex items-center gap-3 text-blue-600">
              <Mail size={18} />
              <span className="text-[10px] uppercase font-black tracking-widest">Contact Channel</span>
            </div>
            <p className="text-xl font-black text-slate-900 tracking-tight">{feedback.email}</p>
          </div>
        </div>

        {/* Content Section */}
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4 shadow-sm">
          <div className="flex justify-between items-center border-b border-slate-200 pb-4">
            <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Full Transmission</span>
            <div className="flex items-center gap-1.5 text-orange-600 bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
              <Star size={14} fill="currentColor" />
              <span className="text-xs font-black font-mono">{feedback.rating || 'N/A'}</span>
            </div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed font-black">
            "{feedback.content}"
          </p>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-6 px-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Calendar size={16} />
            <span className="text-[11px] font-mono font-black uppercase tracking-widest">{feedback.date}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <Clock size={16} />
            <span className="text-[11px] font-mono font-black uppercase tracking-widest">{feedback.time}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default FeedbackDetailModal;
