import React, { useState } from 'react';
import { SensorData, HydrationRiskDetails } from '../types';
import { Sliders, Zap, Thermometer, Droplets, Activity, Heart, RefreshCw, Battery, Radio, Sparkles, Check } from 'lucide-react';

interface DeviceSimulatorProps {
  sensorData: SensorData;
  setSensorData: React.Dispatch<React.SetStateAction<SensorData>>;
  hoursSinceDrink: number;
  setHoursSinceDrink: React.Dispatch<React.SetStateAction<number>>;
  deviceConnection: 'connected' | 'syncing' | 'disconnected' | 'low_battery';
  setDeviceConnection: (state: 'connected' | 'syncing' | 'disconnected' | 'low_battery') => void;
  onDrinkLogged: (amountMl: number) => void;
  solvedRisk: HydrationRiskDetails;
  theme?: 'light' | 'dark';
  pairedDeviceInfo: { name: string; id: string; rssi?: number; batteryLevel?: number } | null;
}

export default function DeviceSimulator({
  sensorData,
  setSensorData,
  hoursSinceDrink,
  setHoursSinceDrink,
  deviceConnection,
  setDeviceConnection,
  onDrinkLogged,
  solvedRisk,
  theme = 'dark',
  pairedDeviceInfo
}: DeviceSimulatorProps) {
  
  const [activePreset, setActivePreset] = useState<string>('Office Worker');
  const [investorDemoMode, setInvestorDemoMode] = useState<boolean>(true);

  const presets = [
    {
      name: 'Office Worker',
      data: { heartRate: 78, activityLoad: 10, temperature: 23.0, humidity: 50, sweatGSR: 1.2, batteryLevel: 95, rssi: -45 },
      hours: 1.5,
      connection: 'connected' as const,
    },
    {
      name: 'Mumbai Commuter',
      data: { heartRate: 95, activityLoad: 40, temperature: 33.0, humidity: 80, sweatGSR: 3.4, batteryLevel: 88, rssi: -58 },
      hours: 2.0,
      connection: 'connected' as const,
    },
    {
      name: 'Gym Workout',
      data: { heartRate: 136, activityLoad: 85, temperature: 23.0, humidity: 50, sweatGSR: 7.2, batteryLevel: 82, rssi: -38 },
      hours: 1.5,
      connection: 'connected' as const,
    },
    {
      name: 'High Risk Outdoor Exercise',
      data: { heartRate: 150, activityLoad: 90, temperature: 35.0, humidity: 75, sweatGSR: 10.5, batteryLevel: 64, rssi: -72 },
      hours: 3.0,
      connection: 'connected' as const,
    }
  ];

  const handleSliderChange = (key: keyof SensorData, value: number) => {
    setActivePreset('Manual Calibration');
    setSensorData((prev) => ({
      ...prev,
      [key]: value,
      lastUpdated: new Date().toISOString(),
    }));
  };

  const applyPreset = (preset: typeof presets[0]) => {
    setActivePreset(preset.name);
    
    const finalData = {
      ...sensorData,
      ...preset.data,
      lastUpdated: new Date().toISOString()
    };

    setSensorData(finalData);
    setHoursSinceDrink(preset.hours);
    setDeviceConnection(preset.connection);
  };

  // Status-aware colors for custom diagnosis tags
  const statusColorClass = 
    solvedRisk.status === 'Hydrated' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
    solvedRisk.status === 'Mild Risk' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' :
    solvedRisk.status === 'High Risk' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' :
    'text-red-400 bg-red-500/10 border-red-500/20 animate-pulse';

  return (
    <div id="sim-control-deck" className={`border rounded-2xl p-5 shadow-2xl backdrop-blur-md ${theme === 'light' ? 'bg-white border-slate-200 text-slate-700' : 'bg-neutral-900 border-neutral-800 text-neutral-200'}`}>
      <div className={`flex items-center gap-2 mb-4 border-b pb-3 ${theme === 'light' ? 'border-slate-100' : 'border-neutral-800'}`}>
        <Sliders className={`w-5 h-5 ${theme === 'light' ? 'text-sky-600' : 'text-cyan-400'}`} />
        <h3 className={`font-semibold text-sm tracking-widest uppercase ${theme === 'light' ? 'text-slate-800' : 'text-neutral-100'}`}>ESP32 Hardware Simulator</h3>
        <span className="ml-auto flex h-2 w-2 relative">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${deviceConnection === 'disconnected' ? 'bg-red-500' : 'bg-green-400'} opacity-75`}></span>
          <span className={`relative inline-flex rounded-full h-2 w-2 ${deviceConnection === 'disconnected' ? 'bg-red-500' : 'bg-green-500'}`}></span>
        </span>
      </div>

      {pairedDeviceInfo && (
        <div className="mb-4 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl flex items-center gap-2.5 animate-fadeIn">
          <Zap className="w-4 h-4 text-cyan-400 shrink-0 animate-pulse" />
          <div className="text-left">
            <span className="text-[10px] uppercase font-mono font-extrabold text-cyan-300 block">Live Telemetry Mode</span>
            <span className="text-[10px] text-neutral-300 block leading-tight">
              Biometrics are streaming live from <strong>{pairedDeviceInfo.name}</strong>. Manual sliders are locked.
            </span>
          </div>
        </div>
      )}

      {/* Preset Hub (Demo Scenario Engine) */}
      <div className="mb-5 space-y-3">
        <div className="flex items-center justify-between">
          <label className={`text-xs font-mono tracking-wider uppercase block ${theme === 'light' ? 'text-slate-500' : 'text-neutral-400'} ${pairedDeviceInfo ? 'opacity-40' : ''}`}>
            Investor Demo Mode
          </label>
          {/* Toggle Switch */}
          <button 
            onClick={() => setInvestorDemoMode(prev => !prev)}
            disabled={!!pairedDeviceInfo}
            className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
              investorDemoMode 
                ? 'bg-cyan-500' 
                : theme === 'light' ? 'bg-slate-200' : 'bg-neutral-850'
            }`}
          >
            <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
              investorDemoMode ? 'translate-x-4' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {investorDemoMode ? (
          <div className="grid grid-cols-2 gap-2 animate-fadeIn">
            {presets.map((p) => {
              const isActive = activePreset === p.name && !pairedDeviceInfo;
              return (
                <button
                  key={p.name}
                  id={`preset-${p.name.toLowerCase().replace(/\s+/g, '-')}`}
                  onClick={() => applyPreset(p)}
                  disabled={!!pairedDeviceInfo}
                  className={`text-xs border rounded-xl p-3 text-left font-medium transition flex flex-col justify-between min-h-[76px] disabled:opacity-55 disabled:cursor-not-allowed ${
                    isActive 
                      ? theme === 'light' 
                        ? 'bg-sky-50 border-sky-300 shadow-md shadow-sky-100/50' 
                        : 'bg-cyan-500/10 border-cyan-400/80 shadow-md shadow-cyan-950/40' 
                      : theme === 'light' 
                        ? 'bg-slate-50 hover:bg-slate-100 border-slate-100' 
                        : 'bg-neutral-800 hover:bg-neutral-700/80 border-neutral-700/60'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`font-extrabold truncate ${isActive ? theme === 'light' ? 'text-sky-700' : 'text-cyan-400' : theme === 'light' ? 'text-slate-700' : 'text-white'}`}>
                      {p.name}
                    </span>
                    {isActive && <Check className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-sky-600' : 'text-cyan-400'} shrink-0`} />}
                  </div>
                  <span className={`text-[10px] block truncate mt-1 ${theme === 'light' ? 'text-slate-500' : 'text-neutral-400'} font-mono`}>
                    {p.data.heartRate} bpm | {p.data.temperature}°C
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={`p-4 rounded-xl border text-center text-xs italic ${theme === 'light' ? 'bg-slate-50 border-slate-150 text-slate-500' : 'bg-neutral-900/40 border-white/5 text-neutral-400'}`}>
            Manual sensor stressor calibration active. Toggle Demo Mode to load quick scenarios.
          </div>
        )}
      </div>

      {/* Active Hardware Sync controls */}
      <div className={`space-y-4 border-t pt-4 ${theme === 'light' ? 'border-slate-100' : 'border-neutral-800'}`}>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className={`flex items-center gap-1.5 ${theme === 'light' ? 'text-slate-600' : 'text-neutral-400'}`}>
              <Heart className="w-3.5 h-3.5 text-red-500" /> Heart Rate
            </span>
            <span id="sim-val-hr" className={`font-mono font-semibold ${theme === 'light' ? 'text-sky-700' : 'text-cyan-400'}`}>{sensorData.heartRate} BPM</span>
          </div>
          <input
            id="sim-slider-hr"
            type="range"
            min="45"
            max="180"
            value={sensorData.heartRate}
            onChange={(e) => handleSliderChange('heartRate', parseInt(e.target.value))}
            disabled={deviceConnection === 'disconnected' || !!pairedDeviceInfo}
            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className={`flex items-center gap-1.5 ${theme === 'light' ? 'text-slate-600' : 'text-neutral-400'}`}>
              <Activity className="w-3.5 h-3.5 text-violet-400" /> Exertion Load
            </span>
            <span id="sim-val-act" className={`font-mono font-semibold ${theme === 'light' ? 'text-sky-700' : 'text-cyan-400'}`}>{sensorData.activityLoad}/100</span>
          </div>
          <input
            id="sim-slider-act"
            type="range"
            min="0"
            max="100"
            value={sensorData.activityLoad}
            onChange={(e) => handleSliderChange('activityLoad', parseInt(e.target.value))}
            disabled={deviceConnection === 'disconnected' || !!pairedDeviceInfo}
            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className={`flex items-center gap-1.5 ${theme === 'light' ? 'text-slate-600' : 'text-neutral-400'}`}>
              <Thermometer className="w-3.5 h-3.5 text-orange-400" /> Ambient Temp
            </span>
            <span id="sim-val-temp" className={`font-mono font-semibold ${theme === 'light' ? 'text-sky-700' : 'text-cyan-400'}`}>{sensorData.temperature.toFixed(1)} °C</span>
          </div>
          <input
            id="sim-slider-temp"
            type="range"
            min="15"
            max="45"
            step="0.5"
            value={sensorData.temperature}
            onChange={(e) => handleSliderChange('temperature', parseFloat(e.target.value))}
            disabled={deviceConnection === 'disconnected' || !!pairedDeviceInfo}
            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className={`flex items-center gap-1.5 ${theme === 'light' ? 'text-slate-600' : 'text-neutral-400'}`}>
              <Droplets className="w-3.5 h-3.5 text-blue-400" /> Air Humidity
            </span>
            <span id="sim-val-hum" className={`font-mono font-semibold ${theme === 'light' ? 'text-sky-700' : 'text-cyan-400'}`}>{sensorData.humidity}% rH</span>
          </div>
          <input
            id="sim-slider-hum"
            type="range"
            min="10"
            max="95"
            value={sensorData.humidity}
            onChange={(e) => handleSliderChange('humidity', parseInt(e.target.value))}
            disabled={deviceConnection === 'disconnected' || !!pairedDeviceInfo}
            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
          />
        </div>

        <div className={`grid grid-cols-2 gap-3 border-t pt-3 ${theme === 'light' ? 'border-slate-100' : 'border-neutral-850'}`}>
          <div>
            <div className={`flex justify-between text-[11px] mb-1 ${theme === 'light' ? 'text-slate-600' : 'text-neutral-400'}`}>
              <span className="flex items-center gap-1"><Battery className="w-3 h-3 text-emerald-400" /> Battery</span>
              <span>{sensorData.batteryLevel}%</span>
            </div>
            <input
              id="sim-slider-bat"
              type="range"
              min="0"
              max="100"
              value={sensorData.batteryLevel}
              onChange={(e) => handleSliderChange('batteryLevel', parseInt(e.target.value))}
              disabled={deviceConnection === 'disconnected' || !!pairedDeviceInfo}
              className="w-full h-0.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <div className={`flex justify-between text-[11px] mb-1 ${theme === 'light' ? 'text-slate-600' : 'text-neutral-400'}`}>
              <span className="flex items-center gap-1"><Radio className="w-3 h-3 text-cyan-500" /> BLE RSSI</span>
              <span>{sensorData.rssi} dBm</span>
            </div>
            <input
              id="sim-slider-rssi"
              type="range"
              min="-100"
              max="-30"
              value={sensorData.rssi}
              onChange={(e) => handleSliderChange('rssi', parseInt(e.target.value))}
              disabled={deviceConnection === 'disconnected' || !!pairedDeviceInfo}
              className="w-full h-0.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div className={`border-t pt-3 ${theme === 'light' ? 'border-slate-100' : 'border-neutral-800'}`}>
          <div className="flex justify-between text-xs mb-1">
            <span className={`flex items-center gap-1 ${theme === 'light' ? 'text-slate-600' : 'text-neutral-400'}`}>
              <RefreshCw className="w-3.5 h-3.5 text-amber-500" /> Gap Since Water intake
            </span>
            <span id="sim-val-hours" className={`font-mono font-semibold ${theme === 'light' ? 'text-sky-700' : 'text-cyan-400'}`}>{hoursSinceDrink.toFixed(1)} hrs</span>
          </div>
          <input
            id="sim-slider-hours"
            type="range"
            min="0"
            max="12"
            step="0.1"
            value={hoursSinceDrink}
            onChange={(e) => {
              setActivePreset('Manual Calibration');
              setHoursSinceDrink(parseFloat(e.target.value));
            }}
            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>
      </div>

      <div className={`flex gap-2 mt-4 pt-4 border-t ${theme === 'light' ? 'border-slate-100' : 'border-neutral-800'}`}>
        <button
          id="sim-btn-drink-glass"
          onClick={() => onDrinkLogged(250)}
          className="flex-1 bg-cyan-700/20 hover:bg-cyan-600/30 active:bg-cyan-700/40 border border-cyan-500/30 rounded-lg py-2 text-xs font-semibold text-cyan-300 transition cursor-pointer text-center"
        >
          +250ml Glass
        </button>
        <button
          id="sim-btn-drink-bottle"
          onClick={() => onDrinkLogged(500)}
          className="flex-1 bg-teal-600/20 hover:bg-teal-500/30 active:bg-teal-600/40 border border-teal-500/30 rounded-lg py-2 text-xs font-semibold text-teal-300 transition cursor-pointer text-center"
        >
          +500ml Bottle
        </button>
      </div>

      {/* Dynamic Scenario Diagnosis Panel */}
      <div className={`mt-5 p-4 rounded-xl border space-y-3 text-left ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-neutral-900/60 border-white/5'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className={`w-4 h-4 ${theme === 'light' ? 'text-sky-600 animate-pulse' : 'text-cyan-400 animate-pulse'}`} />
            <span className={`text-[10px] font-mono tracking-wider uppercase font-bold ${theme === 'light' ? 'text-slate-800' : 'text-neutral-300'}`}>Active Prescriptive Diagnosis</span>
          </div>
          <span className={`text-[9px] uppercase font-mono px-2 py-0.5 rounded-full border font-bold ${statusColorClass}`}>
            {solvedRisk.status}
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-neutral-400">Current Workload:</span>
            <span className={`font-extrabold ${theme === 'light' ? 'text-[#020813]' : 'text-white'}`}>
              {pairedDeviceInfo ? `${pairedDeviceInfo.name} (Live)` : activePreset}
            </span>
          </div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-neutral-400">Resolved Risk Score:</span>
            <span className={`font-mono font-extrabold text-sm ${
              solvedRisk.score <= 25 ? 'text-emerald-400' :
              solvedRisk.score <= 50 ? 'text-yellow-400' :
              solvedRisk.score <= 75 ? 'text-orange-400' : 'text-red-400'
            }`}>{solvedRisk.score} / 100</span>
          </div>
        </div>

        <div className={`border-t pt-2.5 space-y-2 text-[11px] ${theme === 'light' ? 'border-slate-200' : 'border-white/5'}`}>
          <div>
            <span className="text-[9px] uppercase font-mono text-neutral-400 block tracking-wide">Why this score?</span>
            <p className={`mt-0.5 leading-snug italic ${theme === 'light' ? 'text-slate-600' : 'text-neutral-300'}`}>
              {solvedRisk.meaning}
            </p>
          </div>
          <div className="pt-1.5 border-t border-dashed border-white/5">
            <span className="text-[9px] uppercase font-mono text-neutral-400 block tracking-wide">Recommended Action:</span>
            <p className={`mt-0.5 leading-snug font-semibold ${theme === 'light' ? 'text-slate-800' : 'text-neutral-100'}`}>
              {solvedRisk.suggestedAction}
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
