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
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 relative overflow-hidden">
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
