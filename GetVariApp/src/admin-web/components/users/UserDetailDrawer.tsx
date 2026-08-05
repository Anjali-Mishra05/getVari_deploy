import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Battery, Wifi, Droplet, Thermometer, Activity, Clock } from 'lucide-react';
import { addOverlay, removeOverlay, forceClearLocks } from '../../utils/overlayManager';
import Badge from '../shared/Badge';
import UserJourney from './UserJourney';
import { User } from '../../types';

interface UserDetailDrawerProps {
  user?: User;
  onClose: () => void;
}

const UserDetailDrawer: React.FC<UserDetailDrawerProps> = ({ user, onClose }) => {
  if (!user) return null;

  const handlePing = () => {
    console.log(`Broadcast GATT Ping for ${user.name}`);
  };

  const handleSimulateIntake = () => {
    console.log(`Simulate Admin Intake for ${user.name}`);
  };

  const formatMockPhone = (id?: string) => {
    if (!id) return '+1 (555) 010-0000';
    // deterministic mock: sum char codes to get 4 digits
    const sum = Array.from(id).reduce((s, ch) => s + ch.charCodeAt(0), 0);
    const last4 = String(1000 + (sum % 9000)).slice(-4);
    return `+1 (555) 01${last4.slice(0,2)}-${last4.slice(2)}`;
  };

  useEffect(() => {
    addOverlay();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      try { removeOverlay(); } catch (e) {}
      // Defensive: ensure no leftover locks remain
      try { forceClearLocks(); } catch (e) {}
    };
  }, []);

  if (typeof document === 'undefined') return null;

  const [view, setView] = React.useState<'profile'|'journey'>('profile');

  const panel = (
    <div className="user-drawer-root fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-neutral-950/90 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed top-0 right-0 h-[100dvh] w-[55vw] max-w-[900px] bg-neutral-900 border-l border-white/10 p-6 overflow-y-auto space-y-6 shadow-2xl flex flex-col justify-between animate-slideIn scroll-area"
        role="dialog"
        aria-modal="true"
      >
        <div className="space-y-6">
          <div className="flex justify-between items-center border-b border-white/5 pb-4">
            <div>
              <span className="text-[9px] uppercase font-mono text-cyan-400">Individual Profile details</span>
              <h2 className="text-xl font-extrabold text-white mt-1">{user.name}</h2>
              <span className="text-[10px] font-mono text-neutral-500">MAC ID: MAC_{user.id}_F8</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition border border-white/5"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          <div className="flex gap-2 items-center">
            <button onClick={() => setView('profile')} className={`px-3 py-1 rounded-md ${view === 'profile' ? 'bg-white/6 text-white' : 'text-neutral-400'}`}>Profile</button>
            <button onClick={() => setView('journey')} className={`px-3 py-1 rounded-md ${view === 'journey' ? 'bg-white/6 text-white' : 'text-neutral-400'}`}>User Journey</button>
          </div>

          {view === 'profile' && (
            <div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="bg-neutral-950/60 p-4 rounded-xl border border-white/5">
              <span className="text-[9px] uppercase font-mono text-neutral-500">Demographic Profile</span>
              <p className="text-xs font-bold text-white mt-1">{user.gender}, {user.age} Years Old</p>
              <div className="mt-3">
                <span className="text-[9px] uppercase font-mono text-neutral-500 block">PHONE NUMBER</span>
                <p className="text-xs font-bold text-white mt-1">{user.phone ? user.phone : formatMockPhone(user.id).replace('+1', '+91')}</p>
              </div>
              <p className="text-[10px] text-neutral-400 mt-3">Weight baseline: {user.weightKg} Kg</p>
            </div>
            <div className="bg-neutral-950/60 p-4 rounded-xl border border-white/5">
              <span className="text-[9px] uppercase font-mono text-neutral-500">Fluid Intake (Today)</span>
              <p className="text-xs font-bold text-cyan-400 mt-1">{user.waterIntakeMl} ml Ingested</p>
              <p className="text-[10px] text-neutral-450">Daily Target: {user.targetDailyMl} ml</p>
            </div>
          </div>

          <div className="bg-neutral-950/60 p-5 rounded-2xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono uppercase text-neutral-400">Telemetry Resolved Risk</span>
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
            <div className="flex items-baseline gap-2">
              <h3 className={`text-4xl font-extrabold ${
                user.riskScore >= 75 ? 'text-red-500' :
                user.riskScore >= 50 ? 'text-orange-400' :
                user.riskScore >= 25 ? 'text-yellow-400' : 'text-emerald-400'
              }`}>
                {user.riskScore}
              </h3>
              <span className="text-xs text-neutral-500">/ 100 Risk Index</span>
            </div>
            <div className="pt-3">
              <span className="text-[9px] uppercase font-mono text-neutral-500 block mb-1">7-Day Risk History Index trend</span>
              <div className="h-16 flex items-end justify-between gap-1 pt-4 border-b border-dashed border-white/10 px-2">
                {user.riskHistory.map((val, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end" title={`Day ${idx + 1}: ${val}%`}>
                    <div className={`w-full rounded-t ${
                      val >= 75 ? 'bg-red-500' :
                      val >= 50 ? 'bg-orange-400' :
                      val >= 25 ? 'bg-yellow-400' : 'bg-emerald-500'
                    }`} style={{ height: `${val}%` }}></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-neutral-950/60 p-5 rounded-2xl border border-white/5 space-y-4">
            <span className="text-[10px] font-mono uppercase text-neutral-400 block border-b border-white/5 pb-2">Active Sensor Feeds</span>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-neutral-900/60 p-3 rounded-xl">
                <span className="text-[9px] text-neutral-500 uppercase block">Heart rate</span>
                <span className="text-sm font-bold text-white mt-1 block">{user.heartRate} BPM</span>
              </div>
              <div className="bg-neutral-900/60 p-3 rounded-xl">
                <span className="text-[9px] text-neutral-500 uppercase block">Exertion</span>
                <span className="text-sm font-bold text-white mt-1 block">{user.activityLoad}%</span>
              </div>
              <div className="bg-neutral-900/60 p-3 rounded-xl">
                <span className="text-[9px] text-neutral-500 uppercase block">Sweat GSR</span>
                <span className="text-sm font-bold text-white mt-1 block">{user.sweatGSR} µS</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-neutral-900/60 p-3 rounded-xl">
                <span className="text-[9px] text-neutral-500 uppercase block">Ambient Temp</span>
                <span className="text-xs font-bold text-white mt-1 block">{user.temperature} °C</span>
              </div>
              <div className="bg-neutral-900/60 p-3 rounded-xl">
                <span className="text-[9px] text-neutral-500 uppercase block">Ambient Humidity</span>
                <span className="text-xs font-bold text-white mt-1 block">{user.humidity}% rH</span>
              </div>
            </div>
          </div>

          <div className="bg-neutral-950/60 p-5 rounded-2xl border border-white/5 space-y-3">
            <span className="text-[10px] font-mono uppercase text-neutral-400 block border-b border-white/5 pb-2">Carrier Telemetry node status</span>
            <div className="flex justify-between items-center text-xs">
              <span className="text-neutral-400">Firmware Build</span>
              <span className="text-white font-mono font-bold">{user.firmwareVersion}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-neutral-400">Hardware Battery level</span>
              <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                <Battery className="w-3.5 h-3.5" /> {user.batteryLevel}%
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-neutral-400">BLE Sync Strength</span>
              <span className="text-cyan-400 font-mono font-bold flex items-center gap-1">
                <Wifi className="w-3.5 h-3.5" /> {user.rssi} dBm
              </span>
            </div>
          </div>
            </div>
          )}

          {view === 'journey' && (
            <div>
              <UserJourney user={user} />
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-white/5 pt-4">
          <button
            onClick={handlePing}
            className="flex-1 bg-neutral-850 hover:bg-neutral-800 text-white font-mono text-[11px] py-2.5 rounded-xl border border-white/5 transition cursor-pointer font-bold"
          >
            Broadcast GATT Ping
          </button>
          <button
            onClick={handleSimulateIntake}
            className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 text-[11px] py-2.5 rounded-xl transition cursor-pointer font-bold"
          >
            Simulate Admin Intake
          </button>
        </div>
      </aside>
    </div>
  );

  return createPortal(panel, document.body);
};

export default UserDetailDrawer;
