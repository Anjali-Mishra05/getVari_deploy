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
    <nav className="inline-flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm mb-12">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onTabChange(item.id)}
          className={`px-6 py-2.5 rounded-xl text-[10px] font-black tracking-[0.2em] transition-all duration-200 ${
            activeTab === item.id
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
              : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
};

export default Navbar;
