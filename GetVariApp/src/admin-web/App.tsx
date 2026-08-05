import React, { useState } from 'react';
import AdminLayout from './components/layout/AdminLayout';
import { NavItem } from './components/layout/Navbar';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import DevicesPage from './pages/DevicesPage';
import AlertsPage from './pages/AlertsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import FeedbackPage from './pages/FeedbackPage';
import JourneyPage from './pages/JourneyPage';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavItem>('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardPage />;
      case 'users': return <UsersPage />;
      case 'journey': return <JourneyPage />;
      case 'devices': return <DevicesPage />;
      case 'alerts': return <AlertsPage />;
      case 'analytics': return <AnalyticsPage />;
      case 'feedback': return <FeedbackPage />;
      default: return <DashboardPage />;
    }
  };

  return (
    <AdminLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </AdminLayout>
  );
};

export default App;
