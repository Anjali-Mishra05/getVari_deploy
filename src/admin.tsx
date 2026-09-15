import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminConsole from '../GetVariApp/src/admin-web/App';
import './index.css';

ReactDOM.createRoot(document.getElementById('admin-root')!).render(
  <React.StrictMode>
    <AdminConsole />
  </React.StrictMode>
);
