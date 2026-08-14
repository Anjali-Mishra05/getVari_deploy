import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { addOverlay, removeOverlay } from '../../utils/overlayManager';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  scrollBody?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'max-w-2xl',
  scrollBody = true
}) => {
  useEffect(() => {
    if (isOpen) addOverlay();
    return () => {
      if (isOpen) removeOverlay();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const modal = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-10 bg-slate-900/60 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div
        className="fixed inset-0 -z-10"
        onClick={onClose}
      ></div>

      <div className={`relative w-full ${maxWidth} bg-white border border-slate-200 rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] overflow-hidden animate-modalIn flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-5rem)]`}>
        {/* Header */}
        <div className="px-10 pt-10 pb-6 shrink-0">
          <div className="flex justify-between items-start">
            <div className="space-y-1.5">
              {subtitle && <span className="text-[10px] font-mono text-blue-600 font-black tracking-[0.3em] block uppercase">{subtitle}</span>}
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-full transition border border-slate-200 text-slate-400 hover:text-slate-600 shadow-sm"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={`px-10 pb-6 text-slate-600 flex-1 ${scrollBody ? 'overflow-y-auto custom-scrollbar' : 'overflow-visible'}`}>
          {children}
        </div>

        {footer && (
          <div className="px-10 pb-8 pt-6 shrink-0 border-t border-slate-100">
            <div className="flex justify-end gap-4">
              {footer}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default Modal;
