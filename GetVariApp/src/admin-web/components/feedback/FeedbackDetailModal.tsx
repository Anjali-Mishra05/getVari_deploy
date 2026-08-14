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
      maxWidth="max-w-4xl"
      scrollBody={false}
      footer={
        <div className="flex justify-end gap-4">
          <Button variant="secondary" onClick={onClose} className="px-8">Close</Button>
          <Button variant="primary" className="px-8">Archive Feedback</Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* User Info Grid */}
        <div className="grid grid-cols-2 gap-5">
          <div className="bg-slate-50 p-5 rounded-[24px] border border-slate-100 space-y-3 shadow-sm">
            <div className="flex items-center gap-3 text-blue-600">
              <User size={18} />
              <span className="text-[11px] uppercase font-black tracking-widest">User Identity</span>
            </div>
            <p className="text-xl font-black text-slate-900 tracking-tight">{feedback.userName}</p>
          </div>

          <div className="bg-slate-50 p-5 rounded-[24px] border border-slate-100 space-y-3 shadow-sm">
            <div className="flex items-center gap-3 text-blue-600">
              <Mail size={18} />
              <span className="text-[11px] uppercase font-black tracking-widest">Contact Channel</span>
            </div>
            <p className="text-xl font-black text-slate-900 tracking-tight">{feedback.email}</p>
          </div>
        </div>

        {/* Content Section */}
        <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-5 shadow-sm">
          <div className="flex justify-between items-center border-b border-slate-200 pb-4">
            <span className="text-[11px] uppercase font-black text-slate-400 tracking-widest">Full Transmission</span>
            <div className="flex items-center gap-2 text-orange-600 bg-orange-50 px-4 py-2 rounded-full border border-orange-100 shadow-sm">
              <Star size={16} fill="currentColor" />
              <span className="text-sm font-black font-mono">{feedback.rating || 'N/A'}</span>
            </div>
          </div>
          <p className="text-lg text-slate-600 leading-relaxed font-bold italic">
            "{feedback.content}"
          </p>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-8 px-6">
          <div className="flex items-center gap-3 text-slate-400">
            <Calendar size={20} />
            <span className="text-xs font-mono font-black uppercase tracking-widest">{feedback.date}</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <Clock size={20} />
            <span className="text-xs font-mono font-black uppercase tracking-widest">{feedback.time}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default FeedbackDetailModal;
