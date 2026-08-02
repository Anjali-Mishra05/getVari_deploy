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
          <div className="bg-neutral-950/40 p-5 rounded-2xl border border-white/5 space-y-3">
            <div className="flex items-center gap-3 text-cyan-400">
              <User size={18} />
              <span className="text-[10px] uppercase font-mono font-bold tracking-widest">User Identity</span>
            </div>
            <p className="text-lg font-extrabold text-white tracking-tight">{feedback.userName}</p>
          </div>

          <div className="bg-neutral-950/40 p-5 rounded-2xl border border-white/5 space-y-3">
            <div className="flex items-center gap-3 text-cyan-400">
              <Mail size={18} />
              <span className="text-[10px] uppercase font-mono font-bold tracking-widest">Contact Channel</span>
            </div>
            <p className="text-lg font-extrabold text-white tracking-tight">{feedback.email}</p>
          </div>
        </div>

        {/* Content Section */}
        <div className="bg-neutral-950/40 p-6 rounded-2xl border border-white/5 space-y-4">
          <div className="flex justify-between items-center border-b border-white/5 pb-4">
            <span className="text-[10px] uppercase font-mono text-neutral-500 tracking-widest">Full Transmission</span>
            <div className="flex items-center gap-1.5 text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
              <Star size={14} fill="currentColor" />
              <span className="text-xs font-bold font-mono">{feedback.rating || 'N/A'}</span>
            </div>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed font-medium">
            "{feedback.content}"
          </p>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-6 px-4">
          <div className="flex items-center gap-2 text-neutral-500">
            <Calendar size={16} />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider">{feedback.date}</span>
          </div>
          <div className="flex items-center gap-2 text-neutral-500">
            <Clock size={16} />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider">{feedback.time}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default FeedbackDetailModal;
