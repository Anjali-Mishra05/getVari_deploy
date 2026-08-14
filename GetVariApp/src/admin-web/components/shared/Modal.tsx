import React, { useEffect } from 'react';
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
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'max-w-2xl'
}) => {
  useEffect(() => {
    if (isOpen) addOverlay();
    return () => {
      if (isOpen) removeOverlay();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
      <div
        className="fixed inset-0"
        onClick={onClose}
      ></div>

      <div className={`relative w-full ${maxWidth} bg-white border border-slate-200 rounded-[32px] shadow-2xl overflow-hidden animate-slideIn`}>
        {/* Header */}
        <div className="px-10 pt-10 pb-6">
          <div className="flex justify-between items-start">
            <div>
              {subtitle && <span className="text-sm font-mono text-blue-600 font-black tracking-widest block mb-1 uppercase">{subtitle}</span>}
              <h2 className="text-3xl font-black text-slate-900">{title}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-full transition border border-slate-200 text-slate-400 hover:text-slate-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-10 pb-10 text-slate-600 font-medium">
          {children}

          {/* Footer inside the same container to match the image better */}
          {footer && (
            <div className="mt-8 flex justify-end gap-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Modal;
