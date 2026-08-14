import React from 'react';
import type { User } from '@supabase/supabase-js';
import Navbar, { NavItem } from './Navbar';
import Header from './Header';

interface AdminLayoutProps {
  children: React.ReactNode;
  activeTab: NavItem;
  onTabChange: (tab: NavItem) => void;
  user: User;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, activeTab, onTabChange, user }) => {
  return (
    <div className="flex flex-col min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 relative">
      <main className="flex-1 overflow-y-auto p-5 sm:p-6 lg:p-8">
        <div className="max-w-[1280px] mx-auto">
          <Header user={user} />
          <Navbar activeTab={activeTab} onTabChange={onTabChange} />
          <div className="animate-fadeIn pb-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};


export default AdminLayout;
