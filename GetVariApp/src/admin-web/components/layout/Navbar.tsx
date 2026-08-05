import React from 'react';
import {
  LayoutDashboard,
  Users,
  Cpu,
  AlertTriangle,
  BarChart3,
  MessageSquare,
  Sparkles,
  Bell,
  Settings
} from 'lucide-react';

export type NavItem = 'dashboard' | 'users' | 'devices' | 'alerts' | 'analytics' | 'feedback' | 'journey';

interface NavbarProps {
  activeTab: NavItem;
  onTabChange: (tab: NavItem) => void;
}

const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  const navItems: { id: NavItem; label: string }[] = [
    { id: 'dashboard', label: 'DASHBOARD' },
    { id: 'users', label: 'USERS' },
    { id: 'journey', label: 'USER JOURNEY' },
    { id: 'devices', label: 'DEVICES' },
    { id: 'alerts', label: 'ALERTS' },
    { id: 'analytics', label: 'ANALYTICS' },
    { id: 'feedback', label: 'FEEDBACK' },
  ];

  return (
    <nav className="inline-flex bg-neutral-900/50 p-1.5 rounded-2xl border border-white/5 backdrop-blur-md mb-8">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onTabChange(item.id)}
          className={`px-6 py-2 rounded-xl text-xs font-bold tracking-widest transition-all duration-200 ${
            activeTab === item.id
              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
              : 'text-neutral-500 hover:text-neutral-300 border border-transparent'
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
};

export default Navbar;
