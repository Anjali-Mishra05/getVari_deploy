import React, { useState } from 'react';
import { Megaphone } from 'lucide-react';
import Button from '../shared/Button';
import { sendNotificationToAllUsers } from '../../services/AdminAlertService';

const DEFAULT_TITLE = 'Message from GetVari';
const DEFAULT_MESSAGE = 'Stay hydrated today. Open the app to check your progress.';

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; count: number; at: string }
  | { kind: 'error'; message: string };

/**
 * Sends one notification to every registered user, whatever their current
 * hydration status. Separate from the automatic, condition-based alerts.
 */
const BroadcastNotificationCard: React.FC = () => {
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [state, setState] = useState<SendState>({ kind: 'idle' });

  const sending = state.kind === 'sending';
  const canSend = !sending && title.trim().length > 0 && message.trim().length > 0;

  const handleSend = async () => {
    if (!canSend) return;
    if (!window.confirm('Send this notification to ALL registered users?')) return;

    setState({ kind: 'sending' });
    try {
      const result = await sendNotificationToAllUsers({ title, message });
      setState({ kind: 'sent', count: result.count, at: result.sentAt });
    } catch (error) {
      console.error('[Admin broadcast] Failed to send:', error);
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  };

  return (
    <div className="p-4 rounded-xl border border-blue-100 bg-blue-50 space-y-3 mb-5">
      <h3 className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2.5 text-blue-700">
        <Megaphone size={16} /> Notify All Users
      </h3>
      <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
        Sends to every registered user, regardless of hydration status. Each phone shows it while the app is open,
        or the next time it is opened.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input
          type="text"
          value={title}
          maxLength={60}
          onChange={e => setTitle(e.target.value)}
          disabled={sending}
          placeholder="Title"
          aria-label="Notification title"
          className="md:col-span-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold"
        />
        <input
          type="text"
          value={message}
          maxLength={200}
          onChange={e => setMessage(e.target.value)}
          disabled={sending}
          placeholder="Message"
          aria-label="Notification message"
          className="md:col-span-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="sm" onClick={handleSend} disabled={!canSend}>
          {sending ? 'Sending…' : 'Send to all users'}
        </Button>

        {state.kind === 'sent' && (
          <span className="text-[11px] font-bold text-emerald-700" role="status">
            Sent to {state.count} {state.count === 1 ? 'user' : 'users'} at {new Date(state.at).toLocaleTimeString()}.
          </span>
        )}
        {state.kind === 'error' && (
          <span className="text-[11px] font-bold text-red-600" role="alert">
            Not sent: {state.message}
          </span>
        )}
      </div>
    </div>
  );
};

export default BroadcastNotificationCard;
