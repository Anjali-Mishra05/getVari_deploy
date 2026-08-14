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
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed top-0 right-0 h-[100dvh] w-[55vw] max-w-[900px] bg-white border-l border-slate-200 p-6 overflow-y-auto space-y-6 shadow-2xl flex flex-col justify-between animate-slideIn scroll-area"
        role="dialog"
        aria-modal="true"
      >
        <div className="space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div>
              <span className="text-[10px] uppercase font-black tracking-widest text-blue-600">Individual Profile details</span>
              <h2 className="text-2xl font-black text-slate-900 mt-1">{user.name}</h2>
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">MAC ID: MAC_{user.id}_F8</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl transition border border-slate-200"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          <div className="flex gap-2 items-center bg-slate-50 p-1 rounded-xl w-fit">
            <button
              onClick={() => setView('profile')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${view === 'profile' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              PROFILE
            </button>
            <button
              onClick={() => setView('journey')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${view === 'journey' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              USER JOURNEY
            </button>
          </div>

          {view === 'profile' && (
            <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-sm">
              <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">Demographic Profile</span>
              <p className="text-sm font-black text-slate-900 mt-1">{user.gender}, {user.age} Years Old</p>
              <div className="mt-3">
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 block">PHONE NUMBER</span>
                <p className="text-sm font-black text-slate-900 mt-1">{user.phone ? user.phone : formatMockPhone(user.id).replace('+1', '+91')}</p>
              </div>
              <p className="text-[10px] font-bold text-slate-500 mt-3 uppercase tracking-wider">Weight baseline: {user.weightKg} Kg</p>
            </div>
            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 shadow-sm">
              <span className="text-[9px] uppercase font-black tracking-widest text-blue-600">Fluid Intake (Today)</span>
              <p className="text-sm font-black text-blue-700 mt-1">{user.waterIntakeMl} ml Ingested</p>
              <p className="text-[10px] font-bold text-blue-500 mt-1 uppercase tracking-wider">Daily Target: {user.targetDailyMl} ml</p>
            </div>
          </div>

          <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Telemetry Resolved Risk</span>
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
              <h3 className={`text-5xl font-black ${
                user.riskScore >= 75 ? 'text-red-600' :
                user.riskScore >= 50 ? 'text-orange-500' :
                user.riskScore >= 25 ? 'text-yellow-600' : 'text-emerald-600'
              }`}>
                {user.riskScore}
              </h3>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">/ 100 Risk Index</span>
            </div>
            <div className="pt-3">
              <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 block mb-1">7-Day Risk History Index trend</span>
              <div className="h-16 flex items-end justify-between gap-1 pt-4 border-b border-dashed border-slate-200 px-2">
                {user.riskHistory.map((val, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end" title={`Day ${idx + 1}: ${val}%`}>
                    <div className={`w-full rounded-t-md transition-all duration-500 ${
                      val >= 75 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]' :
                      val >= 50 ? 'bg-orange-400' :
                      val >= 25 ? 'bg-yellow-400' : 'bg-emerald-500'
                    }`} style={{ height: `${val}%` }}></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block border-b border-slate-200 pb-2">Active Sensor Feeds</span>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                <span className="text-[9px] text-slate-400 font-black uppercase block tracking-widest">Heart rate</span>
                <span className="text-sm font-black text-slate-900 mt-1 block">{user.heartRate} BPM</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                <span className="text-[9px] text-slate-400 font-black uppercase block tracking-widest">Exertion</span>
                <span className="text-sm font-black text-slate-900 mt-1 block">{user.activityLoad}%</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                <span className="text-[9px] text-slate-400 font-black uppercase block tracking-widest">Sweat GSR</span>
                <span className="text-sm font-black text-slate-900 mt-1 block">{user.sweatGSR} µS</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                <span className="text-[9px] text-slate-400 font-black uppercase block tracking-widest">Ambient Temp</span>
                <span className="text-xs font-black text-slate-900 mt-1 block">{user.temperature} °C</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                <span className="text-[9px] text-slate-400 font-black uppercase block tracking-widest">Ambient Humidity</span>
                <span className="text-xs font-black text-slate-900 mt-1 block">{user.humidity}% rH</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 shadow-sm space-y-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block border-b border-slate-200 pb-2">Carrier Telemetry node status</span>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-bold uppercase tracking-wider">Firmware Build</span>
              <span className="text-slate-900 font-mono font-black">{user.firmwareVersion}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-bold uppercase tracking-wider">Hardware Battery level</span>
              <span className="text-emerald-600 font-mono font-black flex items-center gap-1">
                <Battery className="w-3.5 h-3.5" /> {user.batteryLevel}%
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-bold uppercase tracking-wider">BLE Sync Strength</span>
              <span className="text-blue-600 font-mono font-black flex items-center gap-1">
                <Wifi className="w-3.5 h-3.5" /> {user.rssi} dBm
              </span>
            </div>
          </div>
            </div>
          )}

          {view === 'journey' && (
            <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 shadow-sm">
              <UserJourney user={user} />
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-100 pt-6 mt-4">
          <button
            onClick={handlePing}
            className="flex-1 bg-white hover:bg-slate-50 text-slate-900 font-black text-xs py-3 rounded-2xl border border-slate-200 shadow-sm transition cursor-pointer uppercase tracking-widest"
          >
            Broadcast GATT Ping
          </button>
          <button
            onClick={handleSimulateIntake}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs py-3 rounded-2xl shadow-lg shadow-blue-200 transition cursor-pointer uppercase tracking-widest"
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
