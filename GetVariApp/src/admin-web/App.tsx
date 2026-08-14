import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import AdminLayout from './components/layout/AdminLayout';
import { NavItem } from './components/layout/Navbar';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import DevicesPage from './pages/DevicesPage';
import AlertsPage from './pages/AlertsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import FeedbackPage from './pages/FeedbackPage';
import JourneyPage from './pages/JourneyPage';
import AdminLoginPage from './pages/AdminLoginPage';
import { supabase } from '../services/SupabaseClient';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavItem>('dashboard');
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm font-black tracking-widest text-slate-400">LOADING ADMIN PORTAL...</div>;
  }

  const isAdmin = session?.user?.user_metadata?.is_admin === true;

  if (!session || !isAdmin) {
    return <AdminLoginPage />;
  }

  return (
    <AdminLayout activeTab={activeTab} onTabChange={setActiveTab} user={session.user}>
      <div className={activeTab === 'dashboard' ? 'block' : 'hidden'}>
        <DashboardPage />
      </div>
      <div className={activeTab === 'users' ? 'block' : 'hidden'}>
        <UsersPage />
      </div>
      <div className={activeTab === 'journey' ? 'block' : 'hidden'}>
        <JourneyPage />
      </div>
      <div className={activeTab === 'devices' ? 'block' : 'hidden'}>
        <DevicesPage />
      </div>
      <div className={activeTab === 'alerts' ? 'block' : 'hidden'}>
        <AlertsPage />
      </div>
      <div className={activeTab === 'analytics' ? 'block' : 'hidden'}>
        <AnalyticsPage />
      </div>
      <div className={activeTab === 'feedback' ? 'block' : 'hidden'}>
        <FeedbackPage />
      </div>
    </AdminLayout>
  );
};

export default App;
