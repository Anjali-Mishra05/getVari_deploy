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

export type NavItem = 'dashboard' | 'users' | 'devices' | 'alerts' | 'analytics' | 'feedback' | 'journey' | 'config';

interface NavbarProps {
  activeTab: NavItem;
  onTabChange: (tab: NavItem) => void;
}

const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  const navItems: { id: NavItem; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'users', label: 'User Directory' },
    { id: 'journey', label: 'User Journey' },
    { id: 'devices', label: 'Hardware Fleet' },
    { id: 'alerts', label: 'Safety Alerts' },
    { id: 'analytics', label: 'Bio-Analytics' },
    { id: 'feedback', label: 'User Feedback' },
    { id: 'config', label: 'App Config' },
  ];

  return (
    <div className="mb-8 w-full">
      <nav className="inline-flex bg-slate-50 p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto max-w-full scrollbar-hide no-scrollbar">
        <div className="flex flex-nowrap">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`px-5 py-2.5 rounded-lg text-[10px] sm:text-[10.5px] font-black transition-all duration-200 whitespace-nowrap tracking-widest ${
                activeTab === item.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-100 border border-blue-700'
                  : 'text-slate-500 hover:text-blue-600 hover:bg-white/50'
              }`}
            >
              {item.label.toUpperCase()}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};


export default Navbar;
