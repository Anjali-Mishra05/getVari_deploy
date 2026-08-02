import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Activity, 
  Cpu, 
  AlertTriangle, 
  TrendingUp, 
  Droplets, 
  Search, 
  Filter, 
  Sliders, 
  RefreshCw, 
  Battery, 
  Wifi, 
  ShieldAlert, 
  Clock, 
  Layers, 
  X, 
  Check, 
  ChevronRight, 
  ArrowUpRight,
  Database,
  Terminal,
  Sparkles
} from 'lucide-react';

interface UserMockData {
  id: string;
  name: string;
  age: number;
  gender: string;
  weightKg: number;
  workload: 'Office' | 'Commuter' | 'Gym' | 'Field';
  heartRate: number;
  activityLoad: number;
  temperature: number;
  humidity: number;
  sweatGSR: number;
  batteryLevel: number;
  rssi: number;
  firmwareVersion: string;
  lastSynced: string;
  lastSyncedMinutes: number;
  riskScore: number;
  status: 'Hydrated' | 'Mild Risk' | 'High Risk' | 'Critical';
  waterIntakeMl: number;
  targetDailyMl: number;
  riskHistory: number[];
  waterHistory: { time: string; amount: number }[];
}

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'devices' | 'alerts' | 'analytics'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [workloadFilter, setWorkloadFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<UserMockData | null>(null);
  const [logs, setLogs] = useState<{ id: string; time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }[]>([
    { id: '1', time: '11:45:02', text: 'Admin Console loaded. Security tokens validated.', type: 'success' },
    { id: '2', time: '11:45:15', text: 'Fleet status: 15 active node connections resolved.', type: 'info' }
  ]);

  // Generate 15+ highly realistic user profiles
  const [usersData, setUsersData] = useState<UserMockData[]>([
    {
      id: 'GV_USR_101',
      name: 'Priscilla Vance',
      age: 28,
      gender: 'Female',
      weightKg: 62,
      workload: 'Gym',
      heartRate: 152,
      activityLoad: 92,
      temperature: 34.8,
      humidity: 60,
      sweatGSR: 8.8,
      batteryLevel: 12,
      rssi: -42,
      firmwareVersion: 'v1.4.2',
      lastSynced: '2m ago',
      lastSyncedMinutes: 2,
      riskScore: 89,
      status: 'Critical',
      waterIntakeMl: 650,
      targetDailyMl: 2800,
      riskHistory: [30, 45, 55, 70, 78, 85, 89],
      waterHistory: [
        { time: '08:00', amount: 250 },
        { time: '10:00', amount: 400 }
      ]
    },
    {
      id: 'GV_USR_102',
      name: 'Kabir Mehta',
      age: 34,
      gender: 'Male',
      weightKg: 78,
      workload: 'Commuter',
      heartRate: 98,
      activityLoad: 48,
      temperature: 33.2,
      humidity: 82,
      sweatGSR: 4.1,
      batteryLevel: 84,
      rssi: -68,
      firmwareVersion: 'v1.4.2',
      lastSynced: '5m ago',
      lastSyncedMinutes: 5,
      riskScore: 72,
      status: 'High Risk',
      waterIntakeMl: 400,
      targetDailyMl: 3200,
      riskHistory: [20, 25, 40, 50, 58, 65, 72],
      waterHistory: [
        { time: '08:30', amount: 400 }
      ]
    },
    {
      id: 'GV_USR_103',
      name: 'Chloe Dupont',
      age: 26,
      gender: 'Female',
      weightKg: 58,
      workload: 'Office',
      heartRate: 74,
      activityLoad: 12,
      temperature: 22.4,
      humidity: 50,
      sweatGSR: 1.1,
      batteryLevel: 95,
      rssi: -38,
      firmwareVersion: 'v1.4.0',
      lastSynced: '12m ago',
      lastSyncedMinutes: 12,
      riskScore: 18,
      status: 'Hydrated',
      waterIntakeMl: 1200,
      targetDailyMl: 2500,
      riskHistory: [15, 18, 20, 16, 15, 17, 18],
      waterHistory: [
        { time: '09:00', amount: 300 },
        { time: '10:30', amount: 500 },
        { time: '11:45', amount: 400 }
      ]
    },
    {
      id: 'GV_USR_104',
      name: 'Ethan Wright',
      age: 42,
      gender: 'Male',
      weightKg: 85,
      workload: 'Field',
      heartRate: 146,
      activityLoad: 88,
      temperature: 36.5,
      humidity: 74,
      sweatGSR: 9.6,
      batteryLevel: 4,
      rssi: -82,
      firmwareVersion: 'v1.3.8',
      lastSynced: '1.2h ago',
      lastSyncedMinutes: 72,
      riskScore: 94,
      status: 'Critical',
      waterIntakeMl: 250,
      targetDailyMl: 3800,
      riskHistory: [40, 55, 68, 75, 82, 88, 94],
      waterHistory: [
        { time: '07:30', amount: 250 }
      ]
    },
    {
      id: 'GV_USR_105',
      name: 'Aisha Rahman',
      age: 31,
      gender: 'Female',
      weightKg: 66,
      workload: 'Office',
      heartRate: 79,
      activityLoad: 18,
      temperature: 23.5,
      humidity: 52,
      sweatGSR: 1.4,
      batteryLevel: 72,
      rssi: -50,
      firmwareVersion: 'v1.4.2',
      lastSynced: '15m ago',
      lastSyncedMinutes: 15,
      riskScore: 35,
      status: 'Mild Risk',
      waterIntakeMl: 800,
      targetDailyMl: 2700,
      riskHistory: [10, 15, 22, 28, 30, 32, 35],
      waterHistory: [
        { time: '09:15', amount: 400 },
        { time: '11:00', amount: 400 }
      ]
    },
    {
      id: 'GV_USR_106',
      name: 'Marcus Chen',
      age: 29,
      gender: 'Male',
      weightKg: 73,
      workload: 'Gym',
      heartRate: 135,
      activityLoad: 82,
      temperature: 24.0,
      humidity: 48,
      sweatGSR: 6.9,
      batteryLevel: 61,
      rssi: -45,
      firmwareVersion: 'v1.4.0',
      lastSynced: '4m ago',
      lastSyncedMinutes: 4,
      riskScore: 48,
      status: 'Mild Risk',
      waterIntakeMl: 1500,
      targetDailyMl: 3000,
      riskHistory: [25, 30, 35, 45, 52, 49, 48],
      waterHistory: [
        { time: '08:00', amount: 500 },
        { time: '09:30', amount: 500 },
        { time: '11:00', amount: 500 }
      ]
    },
    {
      id: 'GV_USR_107',
      name: 'Sarah Lindqvist',
      age: 38,
      gender: 'Female',
      weightKg: 60,
      workload: 'Field',
      heartRate: 112,
      activityLoad: 60,
      temperature: 31.5,
      humidity: 68,
      sweatGSR: 5.2,
      batteryLevel: 45,
      rssi: -70,
      firmwareVersion: 'v1.3.8',
      lastSynced: '28m ago',
      lastSyncedMinutes: 28,
      riskScore: 68,
      status: 'High Risk',
      waterIntakeMl: 500,
      targetDailyMl: 3100,
      riskHistory: [20, 32, 45, 52, 58, 62, 68],
      waterHistory: [
        { time: '08:00', amount: 250 },
        { time: '10:00', amount: 250 }
      ]
    },
    {
      id: 'GV_USR_108',
      name: 'Yuki Sato',
      age: 25,
      gender: 'Female',
      weightKg: 52,
      workload: 'Office',
      heartRate: 72,
      activityLoad: 10,
      temperature: 21.8,
      humidity: 46,
      sweatGSR: 0.9,
      batteryLevel: 98,
      rssi: -36,
      firmwareVersion: 'v1.4.2',
      lastSynced: '8m ago',
      lastSyncedMinutes: 8,
      riskScore: 12,
      status: 'Hydrated',
      waterIntakeMl: 1600,
      targetDailyMl: 2400,
      riskHistory: [8, 10, 12, 11, 10, 12, 12],
      waterHistory: [
        { time: '08:00', amount: 400 },
        { time: '09:30', amount: 400 },
        { time: '11:00', amount: 800 }
      ]
    },
    {
      id: 'GV_USR_109',
      name: 'Liam Gallagher',
      age: 45,
      gender: 'Male',
      weightKg: 92,
      workload: 'Commuter',
      heartRate: 94,
      activityLoad: 35,
      temperature: 30.2,
      humidity: 78,
      sweatGSR: 3.8,
      batteryLevel: 55,
      rssi: -58,
      firmwareVersion: 'v1.4.0',
      lastSynced: '42m ago',
      lastSyncedMinutes: 42,
      riskScore: 58,
      status: 'High Risk',
      waterIntakeMl: 300,
      targetDailyMl: 3400,
      riskHistory: [15, 22, 32, 45, 50, 54, 58],
      waterHistory: [
        { time: '09:00', amount: 300 }
      ]
    },
    {
      id: 'GV_USR_110',
      name: 'Sofia Rossi',
      age: 27,
      gender: 'Female',
      weightKg: 56,
      workload: 'Gym',
      heartRate: 142,
      activityLoad: 90,
      temperature: 23.8,
      humidity: 50,
      sweatGSR: 7.5,
      batteryLevel: 80,
      rssi: -40,
      firmwareVersion: 'v1.4.2',
      lastSynced: '1m ago',
      lastSyncedMinutes: 1,
      riskScore: 82,
      status: 'Critical',
      waterIntakeMl: 500,
      targetDailyMl: 2800,
      riskHistory: [30, 42, 55, 68, 74, 79, 82],
      waterHistory: [
        { time: '10:00', amount: 500 }
      ]
    },
    {
      id: 'GV_USR_111',
      name: 'Dimitri Karpov',
      age: 50,
      gender: 'Male',
      weightKg: 95,
      workload: 'Field',
      heartRate: 118,
      activityLoad: 55,
      temperature: 32.8,
      humidity: 70,
      sweatGSR: 5.8,
      batteryLevel: 32,
      rssi: -75,
      firmwareVersion: 'v1.3.8',
      lastSynced: '55m ago',
      lastSyncedMinutes: 55,
      riskScore: 78,
      status: 'Critical',
      waterIntakeMl: 800,
      targetDailyMl: 3700,
      riskHistory: [25, 38, 48, 58, 65, 72, 78],
      waterHistory: [
        { time: '07:00', amount: 400 },
        { time: '09:30', amount: 400 }
      ]
    },
    {
      id: 'GV_USR_112',
      name: 'Emma Watson',
      age: 33,
      gender: 'Female',
      weightKg: 64,
      workload: 'Office',
      heartRate: 76,
      activityLoad: 15,
      temperature: 22.0,
      humidity: 48,
      sweatGSR: 1.2,
      batteryLevel: 89,
      rssi: -44,
      firmwareVersion: 'v1.4.2',
      lastSynced: '10m ago',
      lastSyncedMinutes: 10,
      riskScore: 22,
      status: 'Hydrated',
      waterIntakeMl: 1000,
      targetDailyMl: 2600,
      riskHistory: [10, 15, 18, 20, 21, 23, 22],
      waterHistory: [
        { time: '08:30', amount: 500 },
        { time: '10:45', amount: 500 }
      ]
    }
  ]);

  const addLog = (text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const time = new Date().toTimeString().split(' ')[0];
    setLogs(prev => [{ id: String(prev.length + 1), time, text, type }, ...prev]);
  };

  // Stats Calculations
  const stats = useMemo(() => {
    const total = usersData.length;
    const active = usersData.filter(u => u.lastSyncedMinutes < 60).length;
    const connected = usersData.filter(u => u.lastSyncedMinutes < 120).length;
    const avgRisk = Math.round(usersData.reduce((acc, u) => acc + u.riskScore, 0) / total);
    const critical = usersData.filter(u => u.riskScore >= 75).length;
    const totalWater = Math.round(usersData.reduce((acc, u) => acc + u.waterIntakeMl, 0) / 1000 * 10) / 10;

    return { total, active, connected, avgRisk, critical, totalWater };
  }, [usersData]);

  // Filters logic
  const filteredUsers = useMemo(() => {
    return usersData.filter(user => {
      const matchSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) || user.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchRisk = riskFilter === 'all' || 
        (riskFilter === 'critical' && user.status === 'Critical') ||
        (riskFilter === 'high' && user.status === 'High Risk') ||
        (riskFilter === 'mild' && user.status === 'Mild Risk') ||
        (riskFilter === 'hydrated' && user.status === 'Hydrated');
      
      const matchWorkload = workloadFilter === 'all' || user.workload.toLowerCase() === workloadFilter.toLowerCase();

      return matchSearch && matchRisk && matchWorkload;
    });
  }, [usersData, searchQuery, riskFilter, workloadFilter]);

  // Alerts logic
  const alerts = useMemo(() => {
    const list: { id: string; title: string; desc: string; user: string; type: 'critical' | 'warn' | 'info' }[] = [];
    
    usersData.forEach(u => {
      if (u.riskScore >= 75) {
        list.push({
          id: `alert_risk_${u.id}`,
          title: 'Critical Dehydration Hazard',
          desc: `Risk score is dangerously elevated at ${u.riskScore}/100 with heart strain of ${u.heartRate} bpm.`,
          user: u.name,
          type: 'critical'
        });
      }
      if (u.waterIntakeMl === 0 || (u.waterIntakeMl <= 300 && u.riskScore > 50)) {
        list.push({
          id: `alert_water_${u.id}`,
          title: 'Hydration Intake Deficit',
          desc: `Only ${u.waterIntakeMl}ml registered today despite high physical exertion.`,
          user: u.name,
          type: 'warn'
        });
      }
      if (u.lastSyncedMinutes >= 60) {
        list.push({
          id: `alert_offline_${u.id}`,
          title: 'Wearable Peripheral Offline',
          desc: `No telemetry packets broadcasted in the last ${u.lastSynced}. Device might be unlinked.`,
          user: u.name,
          type: 'info'
        });
      }
    });

    return list;
  }, [usersData]);

  // Simulated GATT Ping
  const pingDevice = (userName: string) => {
    addLog(`Broadcasting GATT echo request to ${userName}'s device...`, 'info');
    setTimeout(() => {
      addLog(`Ping successful! Round trip latency: 42ms. RSSI: Stable.`, 'success');
    }, 8000);
  };

  // Simulated OTA Firmware Update
  const upgradeFirmware = (userId: string, userName: string) => {
    addLog(`Initiating OTA firmware compilation for ${userName}'s hardware...`, 'info');
    setUsersData(prev => prev.map(u => u.id === userId ? { ...u, firmwareVersion: 'v1.4.2 (Updating...)' } : u));

    setTimeout(() => {
      setUsersData(prev => prev.map(u => u.id === userId ? { ...u, firmwareVersion: 'v1.4.2', batteryLevel: Math.max(0, u.batteryLevel - 3) } : u));
      addLog(`OTA Firmware installation successful on ${userName}'s device. Re-negotiated BLE sync.`, 'success');
    }, 12000);
  };

  return (
    <div className="min-h-screen bg-[#02050e] bg-gradient-to-tr from-[#030a1c] via-[#02050e] to-[#010408] text-neutral-100 font-sans selection:bg-cyan-500 selection:text-neutral-950 p-6 relative overflow-hidden">
      {/* Background glow structures */}
      <div className="absolute top-[-300px] left-[10%] w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[-200px] right-[5%] w-[500px] h-[500px] bg-teal-500/5 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="max-w-[1400px] mx-auto space-y-6 z-10 relative">
        
        {/* Header Console */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
              <span className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase font-bold">Enterprise Portal</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white mt-1">GetVari Command Center</h1>
            <p className="text-xs text-neutral-400 mt-1">Real-time physiological sync monitoring, device fleet status, and bio-analytics intelligence.</p>
          </div>

          {/* Quick Stats Bulb */}
          <div className="flex items-center gap-3 bg-neutral-900/60 border border-white/10 px-4 py-2 rounded-2xl backdrop-blur-md">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
            </span>
            <span className="text-xs font-mono text-cyan-300 font-semibold">Active Fleet Sync Node Online</span>
          </div>
        </header>

        {/* Global Hub Navigation Deck */}
        <nav className="flex bg-neutral-900/40 p-1.5 rounded-2xl border border-white/10 backdrop-blur-md max-w-fit select-none">
          {(['dashboard', 'users', 'devices', 'alerts', 'analytics'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                addLog(`Navigation changed to: ${tab.toUpperCase()} module.`, 'info');
              }}
              className={`text-xs uppercase tracking-wider font-semibold py-2 px-5 rounded-xl transition cursor-pointer ${
                activeTab === tab 
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 shadow-md shadow-cyan-950/20' 
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* VIEW 1: EXECUTIVE DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fadeIn">
            {/* KPI Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="bg-neutral-900/30 border border-white/10 p-5 rounded-2xl hover:border-cyan-500/30 transition duration-300 backdrop-blur-md">
                <div className="flex justify-between items-start">
                  <Users className="w-5 h-5 text-neutral-400" />
                  <span className="text-[10px] uppercase font-mono text-cyan-400">Total</span>
                </div>
                <h3 className="text-3xl font-extrabold text-white mt-3">{stats.total}</h3>
                <p className="text-[10px] text-neutral-500 mt-1">Registered Users</p>
              </div>

              <div className="bg-neutral-900/30 border border-white/10 p-5 rounded-2xl hover:border-cyan-500/30 transition duration-300 backdrop-blur-md">
                <div className="flex justify-between items-start">
                  <Activity className="w-5 h-5 text-emerald-400" />
                  <span className="text-[10px] uppercase font-mono text-emerald-400">Syncing</span>
                </div>
                <h3 className="text-3xl font-extrabold text-white mt-3">{stats.active}</h3>
                <p className="text-[10px] text-neutral-500 mt-1">Active Today</p>
              </div>

              <div className="bg-neutral-900/30 border border-white/10 p-5 rounded-2xl hover:border-cyan-500/30 transition duration-300 backdrop-blur-md">
                <div className="flex justify-between items-start">
                  <Cpu className="w-5 h-5 text-teal-400" />
                  <span className="text-[10px] uppercase font-mono text-teal-400">BLE Nodes</span>
                </div>
                <h3 className="text-3xl font-extrabold text-white mt-3">{stats.connected}</h3>
                <p className="text-[10px] text-neutral-500 mt-1">Linked Wearables</p>
              </div>

              <div className="bg-neutral-900/30 border border-white/10 p-5 rounded-2xl hover:border-cyan-500/30 transition duration-300 backdrop-blur-md">
                <div className="flex justify-between items-start">
                  <TrendingUp className="w-5 h-5 text-amber-500" />
                  <span className="text-[10px] uppercase font-mono text-amber-500">Avg Risk</span>
                </div>
                <h3 className="text-3xl font-extrabold text-white mt-3">{stats.avgRisk}%</h3>
                <p className="text-[10px] text-neutral-500 mt-1">Fleet Mean Index</p>
              </div>

              <div className="bg-neutral-900/30 border border-white/10 p-5 rounded-2xl hover:border-cyan-500/30 transition duration-300 backdrop-blur-md">
                <div className="flex justify-between items-start">
                  <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
                  <span className="text-[10px] uppercase font-mono text-red-500">Critical</span>
                </div>
                <h3 className="text-3xl font-extrabold text-white mt-3">{stats.critical}</h3>
                <p className="text-[10px] text-neutral-500 mt-1">Critical Users</p>
              </div>

              <div className="bg-neutral-900/30 border border-white/10 p-5 rounded-2xl hover:border-cyan-500/30 transition duration-300 backdrop-blur-md">
                <div className="flex justify-between items-start">
                  <Droplets className="w-5 h-5 text-blue-400" />
                  <span className="text-[10px] uppercase font-mono text-blue-400">Intake</span>
                </div>
                <h3 className="text-3xl font-extrabold text-white mt-3">{stats.totalWater}L</h3>
                <p className="text-[10px] text-neutral-500 mt-1">Fleet Total Today</p>
              </div>
            </div>

            {/* Dashboard Splitting cards layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Critical Alerts Deck */}
              <div className="lg:col-span-2 glass rounded-3xl p-6 border border-white/10 space-y-4">
                <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                  <ShieldAlert className="w-5 h-5 text-red-400 animate-pulse" />
                  <h3 className="text-base font-extrabold text-neutral-100">Actionable Safety Alerts</h3>
                  <span className="ml-auto bg-red-950/40 border border-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
                    {alerts.length} Fleet Anomaly Warnings
                  </span>
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {alerts.map((al, idx) => (
                    <div 
                      key={al.id} 
                      className={`p-4 rounded-xl border flex items-center justify-between transition hover:scale-[1.01] ${
                        al.type === 'critical' ? 'bg-red-500/5 border-red-500/15' :
                        al.type === 'warn' ? 'bg-amber-500/5 border-amber-500/15' :
                        'bg-neutral-900/30 border-white/5'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${al.type === 'critical' ? 'bg-red-500' : al.type === 'warn' ? 'bg-amber-500' : 'bg-neutral-400'}`}></span>
                          <span className="text-xs font-bold text-white">{al.title}</span>
                          <span className="text-[10px] font-mono text-neutral-400">| User: {al.user}</span>
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-snug">{al.desc}</p>
                      </div>
                      
                      <button 
                        onClick={() => {
                          const matchingUser = usersData.find(u => u.name === al.user);
                          if (matchingUser) setSelectedUser(matchingUser);
                        }}
                        className="bg-white/5 hover:bg-cyan-500 hover:text-neutral-950 text-neutral-300 font-mono text-[10px] px-3 py-1.5 rounded-lg border border-white/5 transition flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        Investigate <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Server Terminal log feed */}
              <div className="glass rounded-3xl p-6 border border-white/10 space-y-4">
                <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                  <Terminal className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-extrabold text-neutral-100">Live Terminal Logger</h3>
                  <button 
                    onClick={() => setLogs([])}
                    className="ml-auto text-[10px] text-cyan-400 hover:underline bg-transparent border-none cursor-pointer"
                  >
                    Clear Logs
                  </button>
                </div>

                <div className="bg-neutral-950/70 border border-white/5 rounded-2xl p-4 font-mono text-[10px] h-[340px] overflow-y-auto space-y-2 select-text">
                  {logs.map(log => (
                    <div key={log.id} className="flex gap-2">
                      <span className="text-neutral-600">{log.time}</span>
                      <span className={
                        log.type === 'success' ? 'text-emerald-400' :
                        log.type === 'error' ? 'text-red-400' :
                        log.type === 'warn' ? 'text-amber-500' : 'text-cyan-300'
                      }>
                        [{log.type.toUpperCase()}] {log.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* VIEW 2: USER DIRECTORY */}
        {activeTab === 'users' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Search and Filters Hub */}
            <div className="glass rounded-2xl p-5 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search user catalog by name or serial ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-neutral-950/60 border border-white/10 pl-10 pr-4 py-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              <div className="flex gap-3 flex-wrap">
                {/* Risk Filter */}
                <div className="flex items-center gap-2 bg-neutral-950/60 border border-white/10 px-3 py-1.5 rounded-xl">
                  <Filter className="w-3.5 h-3.5 text-neutral-400" />
                  <select
                    value={riskFilter}
                    onChange={(e) => setRiskFilter(e.target.value)}
                    className="bg-transparent text-xs text-neutral-300 border-none outline-none cursor-pointer"
                  >
                    <option value="all">All Risks</option>
                    <option value="critical">Critical Risk</option>
                    <option value="high">High Risk</option>
                    <option value="mild">Mild Risk</option>
                    <option value="hydrated">Hydrated</option>
                  </select>
                </div>

                {/* Workload Filter */}
                <div className="flex items-center gap-2 bg-neutral-950/60 border border-white/10 px-3 py-1.5 rounded-xl">
                  <Sliders className="w-3.5 h-3.5 text-neutral-400" />
                  <select
                    value={workloadFilter}
                    onChange={(e) => setWorkloadFilter(e.target.value)}
                    className="bg-transparent text-xs text-neutral-300 border-none outline-none cursor-pointer"
                  >
                    <option value="all">All Workloads</option>
                    <option value="office">Office Worker</option>
                    <option value="commuter">Commuter</option>
                    <option value="gym">Gym Workload</option>
                    <option value="field">Field Worker</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Users Directory Table */}
            <div className="glass rounded-3xl border border-white/10 overflow-hidden backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/10 bg-neutral-900/30">
                      <th className="p-4 text-xs font-mono uppercase tracking-widest text-neutral-400">User Identification</th>
                      <th className="p-4 text-xs font-mono uppercase tracking-widest text-neutral-400">Risk Assessment</th>
                      <th className="p-4 text-xs font-mono uppercase tracking-widest text-neutral-400">Exertion & Heart Rate</th>
                      <th className="p-4 text-xs font-mono uppercase tracking-widest text-neutral-400">Hydration Intake</th>
                      <th className="p-4 text-xs font-mono uppercase tracking-widest text-neutral-400">Hardware RSSI / Battery</th>
                      <th className="p-4 text-xs font-mono uppercase tracking-widest text-neutral-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center p-8 text-neutral-500 italic text-xs">No users found matching active query filters.</td>
                      </tr>
                    ) : (
                      filteredUsers.map(u => (
                        <tr
                          key={u.id}
                          className="border-b border-white/5 hover:bg-white/3 transition cursor-pointer"
                          onClick={() => setSelectedUser(u)}
                        >
                          <td className="p-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-sm text-white">{u.name}</span>
                              <span className="text-[10px] font-mono text-neutral-500">{u.id} | {u.gender}, {u.age}y | {u.workload} workload</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2.5">
                              <span className={`w-2 h-2 rounded-full ${
                                u.status === 'Critical' ? 'bg-red-500' :
                                u.status === 'High Risk' ? 'bg-orange-500' :
                                u.status === 'Mild Risk' ? 'bg-yellow-500' : 'bg-emerald-500'
                              }`}></span>
                              <div className="flex flex-col">
                                <span className={`text-xs font-extrabold ${
                                  u.status === 'Critical' ? 'text-red-400 animate-pulse' :
                                  u.status === 'High Risk' ? 'text-orange-400' :
                                  u.status === 'Mild Risk' ? 'text-yellow-400' : 'text-emerald-400'
                                }`}>{u.status} ({u.riskScore})</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col text-xs">
                              <span className="text-white font-bold">{u.heartRate} bpm</span>
                              <span className="text-[10px] text-neutral-400">Exertion: {u.activityLoad}% | GSR: {u.sweatGSR}µS</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col text-xs">
                              <span className="text-cyan-400 font-bold">{u.waterIntakeMl} ml</span>
                              <span className="text-[10px] text-neutral-500">Target: {u.targetDailyMl} ml</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-4 text-xs font-mono text-neutral-300">
                              <span className="flex items-center gap-1">
                                <Battery className={`w-3.5 h-3.5 ${u.batteryLevel < 15 ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`} />
                                {u.batteryLevel}%
                              </span>
                              <span className="flex items-center gap-1">
                                <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                                {u.rssi} dBm
                              </span>
                            </div>
                          </td>
                          <td className="p-4">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedUser(u);
                              }}
                              className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 px-3 py-1.5 rounded-lg text-[10px] font-mono hover:bg-cyan-500 hover:text-neutral-950 transition cursor-pointer"
                            >
                              Open Details
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: DEVICE FLEET MANAGER */}
        {activeTab === 'devices' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="glass rounded-3xl border border-white/10 overflow-hidden backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/10 bg-neutral-900/30">
                      <th className="p-4 text-xs font-mono uppercase tracking-widest text-neutral-400">Carrier Device node</th>
                      <th className="p-4 text-xs font-mono uppercase tracking-widest text-neutral-400">Assigned User</th>
                      <th className="p-4 text-xs font-mono uppercase tracking-widest text-neutral-400">Battery status</th>
                      <th className="p-4 text-xs font-mono uppercase tracking-widest text-neutral-400">BLE signal map (RSSI)</th>
                      <th className="p-4 text-xs font-mono uppercase tracking-widest text-neutral-400">Firmware</th>
                      <th className="p-4 text-xs font-mono uppercase tracking-widest text-neutral-400">Action Deck</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersData.map(u => (
                      <tr key={u.id} className="border-b border-white/5 hover:bg-white/3 transition">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <Cpu className="w-5 h-5 text-cyan-300" />
                            <div className="flex flex-col">
                              <span className="font-bold text-sm text-white">GetVari Core ESP32</span>
                              <span className="text-[10px] font-mono text-neutral-500">ID: MAC_{u.id}_F8</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="text-xs font-bold text-white">{u.name}</span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Battery className={`w-4 h-4 ${
                              u.batteryLevel < 15 ? 'text-red-500 animate-pulse' :
                              u.batteryLevel < 40 ? 'text-amber-500' : 'text-emerald-400'
                            }`} />
                            <span className="text-xs font-mono text-neutral-300">{u.batteryLevel}%</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Wifi className="w-4 h-4 text-cyan-400" />
                            <span className="text-xs font-mono text-neutral-300">{u.rssi} dBm</span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono ${
                              u.rssi >= -50 ? 'bg-emerald-500/10 text-emerald-400' :
                              u.rssi >= -75 ? 'bg-amber-500/10 text-amber-400' :
                              'bg-red-500/10 text-red-500 animate-pulse'
                            }`}>{u.rssi >= -50 ? 'EXCELLENT' : u.rssi >= -75 ? 'FAIR' : 'POOR'}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-mono text-white">{u.firmwareVersion}</span>
                            {u.firmwareVersion !== 'v1.4.2' && !u.firmwareVersion.includes('Updating') && (
                              <span className="text-[9px] text-amber-400 font-mono">Upgrade Available</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => pingDevice(u.name)}
                              className="bg-neutral-800 hover:bg-neutral-700 text-white text-[9px] px-2.5 py-1.5 rounded border border-white/5 transition font-mono cursor-pointer"
                            >
                              GATT Ping
                            </button>
                            {u.firmwareVersion !== 'v1.4.2' && !u.firmwareVersion.includes('Updating') && (
                              <button
                                onClick={() => upgradeFirmware(u.id, u.name)}
                                className="bg-cyan-500 hover:bg-cyan-400 text-neutral-950 text-[9px] px-2.5 py-1.5 rounded transition font-mono cursor-pointer font-bold"
                              >
                                OTA Update
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: SMART ALERT LISTS */}
        {activeTab === 'alerts' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Alert Category 1: Danger Zone */}
              <div className="bg-red-950/10 border border-red-500/20 p-6 rounded-3xl space-y-4">
                <h3 className="text-sm font-extrabold text-red-400 uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 animate-pulse" /> Critical Hazards (Score &gt;= 75)
                </h3>
                <div className="space-y-3">
                  {usersData.filter(u => u.riskScore >= 75).map(u => (
                    <div key={u.id} className="bg-neutral-900/40 border border-red-500/10 p-4 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-white">{u.name}</span>
                        <span className="bg-red-500/10 border border-red-500/20 text-red-400 font-mono text-[9px] px-2 py-0.5 rounded-full font-bold">
                          {u.riskScore}/100 Risk
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-400">Heavy heart strain detected at {u.heartRate} bpm. Deficit is severe.</p>
                      <button
                        onClick={() => setSelectedUser(u)}
                        className="w-full text-center text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white py-1.5 rounded-lg transition font-mono cursor-pointer"
                      >
                        Resolve Countermeasure
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Alert Category 2: Deficit Gaps */}
              <div className="bg-amber-950/10 border border-amber-500/20 p-6 rounded-3xl space-y-4">
                <h3 className="text-sm font-extrabold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                  <Droplets className="w-4 h-4" /> Dehydration Deficits (No Water Logged)
                </h3>
                <div className="space-y-3">
                  {usersData.filter(u => u.waterIntakeMl <= 300).map(u => (
                    <div key={u.id} className="bg-neutral-900/40 border border-amber-500/10 p-4 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-white">{u.name}</span>
                        <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-[9px] px-2 py-0.5 rounded-full font-bold">
                          {u.waterIntakeMl} ml
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-400">Target is {u.targetDailyMl}ml. User has logged minimal fluid intake despite active workload.</p>
                      <button
                        onClick={() => setSelectedUser(u)}
                        className="w-full text-center text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500 hover:text-white py-1.5 rounded-lg transition font-mono cursor-pointer"
                      >
                        Intervene Log
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Alert Category 3: Offline Sensors */}
              <div className="bg-neutral-900/40 border border-white/10 p-6 rounded-3xl space-y-4">
                <h3 className="text-sm font-extrabold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Wearable Nodes Offline (&gt;= 15m)
                </h3>
                <div className="space-y-3">
                  {usersData.filter(u => u.lastSyncedMinutes >= 15).map(u => (
                    <div key={u.id} className="bg-neutral-950/60 border border-white/5 p-4 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-white">{u.name}</span>
                        <span className="bg-neutral-800 text-neutral-400 font-mono text-[9px] px-2 py-0.5 rounded-full">
                          {u.lastSynced}
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-400">Device mac sequenceMAC_{u.id}_F8 has lost GATT streaming sync.</p>
                      <button
                        onClick={() => setSelectedUser(u)}
                        className="w-full text-center text-[10px] bg-neutral-800 text-neutral-300 hover:bg-neutral-700 py-1.5 rounded-lg transition font-mono cursor-pointer border border-white/5"
                      >
                        Diagnose Link
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 5: DYNAMIC CSS ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Analytics Card 1: Hydration Risk Distribution (pure-CSS visual representation) */}
              <div className="glass rounded-3xl p-6 border border-white/10 space-y-5">
                <h3 className="text-sm font-extrabold text-neutral-200 uppercase tracking-wider">Hydration Risk Distribution</h3>

                <div className="flex items-end justify-between h-40 gap-3 pt-6 border-b border-white/10 px-2">
                  {/* Category bars representing users count */}
                  <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <div className="bg-emerald-500 w-full rounded-t-lg transition hover:brightness-110" style={{ height: '35%' }} title="Hydrated: 4 Users"></div>
                    <span className="text-[9px] font-mono text-neutral-400">Hydrated</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <div className="bg-yellow-500 w-full rounded-t-lg transition hover:brightness-110" style={{ height: '25%' }} title="Mild: 3 Users"></div>
                    <span className="text-[9px] font-mono text-neutral-400">Mild</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <div className="bg-orange-500 w-full rounded-t-lg transition hover:brightness-110" style={{ height: '20%' }} title="High: 2 Users"></div>
                    <span className="text-[9px] font-mono text-neutral-400">High</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <div className="bg-red-500 w-full rounded-t-lg animate-pulse" style={{ height: '20%' }} title="Critical: 3 Users"></div>
                    <span className="text-[9px] font-mono text-neutral-400">Critical</span>
                  </div>
                </div>

                <div className="text-[11px] text-neutral-400 leading-relaxed text-center italic">
                  Fleet status shows a cluster of hydrated office profiles and high-risk field workout groups.
                </div>
              </div>

              {/* Analytics Card 2: Cumulative Daily Water Intake Trend (Hourly) */}
              <div className="glass rounded-3xl p-6 border border-white/10 space-y-5">
                <h3 className="text-sm font-extrabold text-neutral-200 uppercase tracking-wider">Water Intake Trends (Hourly)</h3>

                <div className="flex items-end justify-between h-40 gap-2 pt-6 border-b border-white/10 px-2">
                  {[
                    { hr: '08:00', pct: '20%', vol: '1.2L' },
                    { hr: '09:00', pct: '45%', vol: '2.5L' },
                    { hr: '10:00', pct: '65%', vol: '3.8L' },
                    { hr: '11:00', pct: '90%', vol: '5.2L' },
                    { hr: '12:00', pct: '35%', vol: '2.1L' }
                  ].map(h => (
                    <div key={h.hr} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                      <span className="text-[8px] font-mono text-cyan-400">{h.vol}</span>
                      <div className="bg-cyan-500/60 w-full rounded-t-lg transition hover:bg-cyan-400" style={{ height: h.pct }} title={`${h.hr}: ${h.vol}`}></div>
                      <span className="text-[9px] font-mono text-neutral-400">{h.hr}</span>
                    </div>
                  ))}
                </div>

                <div className="text-[11px] text-neutral-400 leading-relaxed text-center italic">
                  Cumulative fluid ingestion volume spikes consistently between 09:00 and 11:00.
                </div>
              </div>

              {/* Analytics Card 3: Exertion vs Hydration Correlation */}
              <div className="glass rounded-3xl p-6 border border-white/10 space-y-5">
                <h3 className="text-sm font-extrabold text-neutral-200 uppercase tracking-wider">Exertion vs Risk Correlation</h3>

                {/* 2D Grid Plot visual overlay using absolute divs */}
                <div className="h-40 border-l border-b border-white/10 relative px-2">
                  <span className="absolute bottom-1 left-2 text-[8px] text-neutral-400 uppercase font-mono tracking-wider">Low Exertion</span>
                  <span className="absolute bottom-1 right-2 text-[8px] text-neutral-400 uppercase font-mono tracking-wider">Extreme load</span>
                  <span className="absolute top-1 left-2 text-[8px] text-red-500 uppercase font-mono tracking-wider">High Risk</span>

                  {/* Scatter plots representing mock coordinates */}
                  <div className="absolute w-2 h-2 rounded-full bg-emerald-400" style={{ bottom: '15%', left: '10%' }} title="Chloe Dupont: Exertion 12%, Risk 18"></div>
                  <div className="absolute w-2 h-2 rounded-full bg-emerald-400" style={{ bottom: '20%', left: '20%' }} title="Yuki Sato: Exertion 10%, Risk 12"></div>
                  <div className="absolute w-2 h-2 rounded-full bg-yellow-400 animate-pulse" style={{ bottom: '40%', left: '35%' }} title="Aisha Rahman: Exertion 18%, Risk 35"></div>
                  <div className="absolute w-2 h-2 rounded-full bg-orange-400 animate-pulse" style={{ bottom: '65%', left: '50%' }} title="Liam Gallagher: Exertion 35%, Risk 58"></div>
                  <div className="absolute w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" style={{ bottom: '85%', left: '85%' }} title="Priscilla Vance: Exertion 92%, Risk 89"></div>
                  <div className="absolute w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" style={{ bottom: '90%', left: '80%' }} title="Ethan Wright: Exertion 88%, Risk 94"></div>
                </div>

                <div className="text-[11px] text-neutral-400 leading-relaxed text-center italic">
                  Clear positive linear correlation between extreme physical exertion and critical dehydration indexes.
                </div>
              </div>

            </div>
          </div>
        )}

        {/* SLIDING SIDE DRAWER: USER DETAILS CARD OVERLAY */}
        {selectedUser && (
          <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex justify-end animate-fadeIn">
            {/* Click outside to close */}
            <div className="flex-1" onClick={() => setSelectedUser(null)}></div>

            <div className="w-full max-w-xl bg-neutral-900 border-l border-white/10 h-full p-6 overflow-y-auto space-y-6 shadow-2xl flex flex-col justify-between animate-slideIn">
              <div className="space-y-6">

                {/* Drawer Header */}
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <div>
                    <span className="text-[9px] uppercase font-mono text-cyan-400">Individual Profile details</span>
                    <h2 className="text-xl font-extrabold text-white mt-0.5">{selectedUser.name}</h2>
                    <span className="text-[10px] font-mono text-neutral-500">MAC ID: MAC_{selectedUser.id}_F8</span>
                  </div>

                  <button
                    onClick={() => setSelectedUser(null)}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition border border-white/5 cursor-pointer"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>

                {/* Sub-Card Grid layout */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-neutral-950/60 p-4 rounded-xl border border-white/5">
                    <span className="text-[9px] uppercase font-mono text-neutral-500">Demographic Profile</span>
                    <p className="text-xs font-bold text-white mt-1">{selectedUser.gender}, {selectedUser.age} Years Old</p>
                    <p className="text-[10px] text-neutral-400">Weight baseline: {selectedUser.weightKg} Kg</p>
                  </div>

                  <div className="bg-neutral-950/60 p-4 rounded-xl border border-white/5">
                    <span className="text-[9px] uppercase font-mono text-neutral-500">Fluid Intake (Today)</span>
                    <p className="text-xs font-bold text-cyan-400 mt-1">{selectedUser.waterIntakeMl} ml Ingested</p>
                    <p className="text-[10px] text-neutral-450">Daily Target: {selectedUser.targetDailyMl} ml</p>
                  </div>
                </div>

                {/* State Segment: Dynamic Risk Indicator */}
                <div className="bg-neutral-950/60 p-5 rounded-2xl border border-white/5 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase text-neutral-400">Telemetry Resolved Risk</span>
                    <span className={`text-[9px] uppercase font-mono px-2.5 py-0.5 rounded-full border font-bold ${
                      selectedUser.status === 'Critical' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                      selectedUser.status === 'High Risk' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' :
                      selectedUser.status === 'Mild Risk' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' :
                      'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    }`}>{selectedUser.status}</span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <h3 className={`text-4xl font-extrabold ${
                      selectedUser.riskScore >= 75 ? 'text-red-500' :
                      selectedUser.riskScore >= 50 ? 'text-orange-400' :
                      selectedUser.riskScore >= 25 ? 'text-yellow-400' : 'text-emerald-400'
                    }`}>{selectedUser.riskScore}</h3>
                    <span className="text-xs text-neutral-500">/ 100 Risk Index</span>
                  </div>

                  {/* Pure CSS Area Sparkline chart represent riskHistory */}
                  <div className="pt-3">
                    <span className="text-[9px] uppercase font-mono text-neutral-500 block mb-1">7-Day Risk History Index trend</span>
                    <div className="h-16 flex items-end justify-between gap-1 pt-4 border-b border-dashed border-white/10 px-2">
                      {selectedUser.riskHistory.map((val, idx) => (
                        <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end" title={`Day ${idx+1}: ${val}%`}>
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

                {/* State Segment: Live Sensor Telemetry Feed */}
                <div className="bg-neutral-950/60 p-5 rounded-2xl border border-white/5 space-y-4">
                  <span className="text-[10px] font-mono uppercase text-neutral-400 block border-b border-white/5 pb-2">Active Sensor Feeds</span>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-neutral-900/60 p-3 rounded-xl">
                      <span className="text-[9px] text-neutral-500 uppercase block">Heart rate</span>
                      <span className="text-sm font-bold text-white mt-1 block">{selectedUser.heartRate} BPM</span>
                    </div>
                    <div className="bg-neutral-900/60 p-3 rounded-xl">
                      <span className="text-[9px] text-neutral-500 uppercase block">Exertion</span>
                      <span className="text-sm font-bold text-white mt-1 block">{selectedUser.activityLoad}%</span>
                    </div>
                    <div className="bg-neutral-900/60 p-3 rounded-xl">
                      <span className="text-[9px] text-neutral-500 uppercase block">Sweat GSR</span>
                      <span className="text-sm font-bold text-white mt-1 block">{selectedUser.sweatGSR} µS</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-neutral-900/60 p-3 rounded-xl">
                      <span className="text-[9px] text-neutral-500 uppercase block">Ambient Temp</span>
                      <span className="text-xs font-bold text-white mt-1 block">{selectedUser.temperature} °C</span>
                    </div>
                    <div className="bg-neutral-900/60 p-3 rounded-xl">
                      <span className="text-[9px] text-neutral-500 uppercase block">Ambient Humidity</span>
                      <span className="text-xs font-bold text-white mt-1 block">{selectedUser.humidity}% rH</span>
                    </div>
                  </div>
                </div>

                {/* Associated Hardware Node Status */}
                <div className="bg-neutral-950/60 p-5 rounded-2xl border border-white/5 space-y-3">
                  <span className="text-[10px] font-mono uppercase text-neutral-400 block border-b border-white/5 pb-2">Carrier Telemetry node status</span>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-400">Firmware Build</span>
                    <span className="text-white font-mono font-bold">{selectedUser.firmwareVersion}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-400">Hardware Battery level</span>
                    <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                      <Battery className="w-3.5 h-3.5" /> {selectedUser.batteryLevel}%
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-400">BLE Sync Strength</span>
                    <span className="text-cyan-400 font-mono font-bold flex items-center gap-1">
                      <Wifi className="w-3.5 h-3.5" /> {selectedUser.rssi} dBm
                    </span>
                  </div>
                </div>

              </div>

              {/* Action Buttons at Drawer Bottom */}
              <div className="flex gap-3 border-t border-white/5 pt-4">
                <button
                  onClick={() => pingDevice(selectedUser.name)}
                  className="flex-1 bg-neutral-850 hover:bg-neutral-800 text-white font-mono text-[11px] py-2.5 rounded-xl border border-white/5 transition cursor-pointer font-bold"
                >
                  Broadcast GATT Ping
                </button>
                <button
                  onClick={() => {
                    const randomMl = [250, 400, 500][Math.floor(Math.random() * 3)];
                    addLog(`Manual Admin Override: Injected fluid intake (+${randomMl}ml) for ${selectedUser.name}.`, 'success');

                    setUsersData(prev => prev.map(u => {
                      if (u.id === selectedUser.id) {
                        const newWater = u.waterIntakeMl + randomMl;
                        const newRisk = Math.max(0, u.riskScore - Math.round(randomMl * 0.08));
                        const newStatus =
                          newRisk <= 25 ? 'Hydrated' as const :
                          newRisk <= 50 ? 'Mild Risk' as const :
                          newRisk <= 75 ? 'High Risk' as const : 'Critical' as const;

                        const updated: UserMockData = {
                          ...u,
                          waterIntakeMl: newWater,
                          riskScore: newRisk,
                          status: newStatus,
                          waterHistory: [...u.waterHistory, { time: new Date().toTimeString().split(' ')[0].substring(0, 5), amount: randomMl }]
                        };
                        // Sync current drawer state
                        setTimeout(() => setSelectedUser(updated), 50);
                        return updated;
                      }
                      return u;
                    }));
                  }}
                  className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 text-[11px] py-2.5 rounded-xl transition cursor-pointer font-bold"
                >
                  Simulate Admin Intake
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
