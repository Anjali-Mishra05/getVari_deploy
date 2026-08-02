import React from 'react';
import Navbar, { NavItem } from './Navbar';
import Header from './Header';

interface AdminLayoutProps {
  children: React.ReactNode;
  activeTab: NavItem;
  onTabChange: (tab: NavItem) => void;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, activeTab, onTabChange }) => {
  return (
    <div className="flex flex-col min-h-screen bg-[#02050e] text-neutral-100 font-sans selection:bg-cyan-500 selection:text-neutral-950 relative overflow-hidden">
      {/* Background glow structures */}
      <div className="absolute top-[-300px] left-[10%] w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[-200px] right-[5%] w-[500px] h-[500px] bg-teal-500/5 rounded-full blur-[140px] pointer-events-none"></div>

      <main className="flex-1 overflow-y-auto p-12 relative z-10">
        <div className="max-w-[1600px] mx-auto">
          <Header />
          <Navbar activeTab={activeTab} onTabChange={onTabChange} />
          <div className="animate-fadeIn">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
