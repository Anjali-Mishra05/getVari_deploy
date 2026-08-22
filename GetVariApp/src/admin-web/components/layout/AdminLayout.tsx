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
    <div className="flex flex-col min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 relative overflow-x-hidden">
      <main className="flex-1 w-full p-4 sm:p-6 lg:p-8">
        <div className="max-w-[1280px] mx-auto w-full">
          <Header user={user} />
          <Navbar activeTab={activeTab} onTabChange={onTabChange} />
          <div className="animate-fadeIn pb-8 w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};


export default AdminLayout;
