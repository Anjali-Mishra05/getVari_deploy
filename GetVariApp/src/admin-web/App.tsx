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
import AppConfigPage from './pages/AppConfigPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminErrorBoundary from './components/shared/AdminErrorBoundary';
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

  // `app_metadata` is set from the Supabase dashboard only; `user_metadata`
  // can be edited by the account itself, so it is not proof of anything.
  const isAdmin = session?.user?.app_metadata?.is_admin === true;

  if (!session || !isAdmin) {
    return <AdminLoginPage />;
  }

  // Each page fails on its own: all of them stay mounted (hidden by CSS), so
  // without a boundary one page's render error unmounted every page and left
  // only the dark page background.
  return (
    <AdminLayout activeTab={activeTab} onTabChange={setActiveTab} user={session.user}>
      <div className={activeTab === 'dashboard' ? 'block' : 'hidden'}>
        <AdminErrorBoundary label="the dashboard">
          <DashboardPage />
        </AdminErrorBoundary>
      </div>
      <div className={activeTab === 'users' ? 'block' : 'hidden'}>
        <AdminErrorBoundary label="the user directory">
          <UsersPage />
        </AdminErrorBoundary>
      </div>
      <div className={activeTab === 'journey' ? 'block' : 'hidden'}>
        <AdminErrorBoundary label="user journeys">
          <JourneyPage />
        </AdminErrorBoundary>
      </div>
      <div className={activeTab === 'devices' ? 'block' : 'hidden'}>
        <AdminErrorBoundary label="devices">
          <DevicesPage />
        </AdminErrorBoundary>
      </div>
      <div className={activeTab === 'alerts' ? 'block' : 'hidden'}>
        <AdminErrorBoundary label="alerts">
          <AlertsPage />
        </AdminErrorBoundary>
      </div>
      <div className={activeTab === 'analytics' ? 'block' : 'hidden'}>
        <AdminErrorBoundary label="analytics">
          <AnalyticsPage />
        </AdminErrorBoundary>
      </div>
      <div className={activeTab === 'feedback' ? 'block' : 'hidden'}>
        <AdminErrorBoundary label="feedback">
          <FeedbackPage />
        </AdminErrorBoundary>
      </div>
      {/* Mounted only when open: the config editor holds unsaved edits, and a
          hidden-but-mounted copy would keep them across a tab switch and
          publish them the next time someone pressed Save. */}
      {activeTab === 'config' && (
        <AdminErrorBoundary label="the app configuration">
          <AppConfigPage />
        </AdminErrorBoundary>
      )}
    </AdminLayout>
  );
};

export default App;
