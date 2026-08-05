import React from 'react';
import { ArrowRight, Battery, Wifi, Droplet, Thermometer, Activity, Clock } from 'lucide-react';
import Modal from '../shared/Modal';
import Badge from '../shared/Badge';
import { User } from '../../types';

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: User;
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({ isOpen, onClose, user }) => {
  if (!user) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="User Dossier"
      subtitle="Fleet telemetry & hydration profile"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-8">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-mono uppercase tracking-[0.3em] text-cyan-400">Wearable Partner</p>
                <h3 className="mt-3 text-3xl font-extrabold tracking-tight text-white">{user.name}</h3>
                <p className="mt-2 text-sm text-neutral-400">{user.id} · {user.workload}</p>
              </div>
              <Badge
                variant={
                  user.status === 'Critical' ? 'red' :
                  user.status === 'High Risk' ? 'amber' :
                  user.status === 'Mild Risk' ? 'cyan' : 'emerald'
                }
                dot
              >
                {user.status}
              </Badge>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-[#0b1220] p-4">
                <div className="flex items-center gap-2 text-cyan-400"><Battery size={16} /> Battery</div>
                <p className="mt-3 text-3xl font-bold text-white">{user.batteryLevel}%</p>
                <p className="mt-2 text-sm text-neutral-400">Last synced {user.lastSynced}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-[#0b1220] p-4">
                <div className="flex items-center gap-2 text-cyan-400"><Wifi size={16} /> Connectivity</div>
                <p className="mt-3 text-3xl font-bold text-white">{user.rssi} dBm</p>
                <p className="mt-2 text-sm text-neutral-400">Firmware {user.firmwareVersion}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
              <span className="rounded-full bg-white/5 px-3 py-1.5">Age {user.age}</span>
              <span className="rounded-full bg-white/5 px-3 py-1.5">Gender {user.gender}</span>
              <span className="rounded-full bg-white/5 px-3 py-1.5">Target {user.targetDailyMl} ML</span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-[#0b1220] p-4">
                <div className="flex items-center gap-2 text-cyan-400"><Droplet size={16} /> Hydration</div>
                <p className="mt-3 text-3xl font-bold text-white">{user.waterIntakeMl} ML</p>
                <p className="mt-2 text-sm text-neutral-400">Daily target {user.targetDailyMl} ML</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-[#0b1220] p-4">
                <div className="flex items-center gap-2 text-cyan-400"><Thermometer size={16} /> Biometrics</div>
                <p className="mt-3 text-3xl font-bold text-white">{user.temperature.toFixed(1)}°C</p>
                <p className="mt-2 text-sm text-neutral-400">Humidity {user.humidity}% · GSR {user.sweatGSR}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3 text-sm font-mono uppercase tracking-[0.3em] text-neutral-400">
              <Activity size={16} /> Risk trend
            </div>
            <div className="mt-5 space-y-3">
              {user.riskHistory.map((value, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-2xl bg-neutral-950/40 p-3">
                  <span className="text-xs text-neutral-400">T-{6 - idx} h</span>
                  <span className="font-semibold text-white">{value}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3 text-sm font-mono uppercase tracking-[0.3em] text-neutral-400">
              <Clock size={16} /> Water history
            </div>
            <div className="mt-5 space-y-3">
              {user.waterHistory.map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-2xl bg-neutral-950/40 p-3">
                  <span className="text-xs text-neutral-400">{entry.time}</span>
                  <span className="font-semibold text-white">{entry.amount} ML</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-400"
          >
            Close <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default UserDetailModal;
