import React, { Suspense, lazy } from 'react';
import './styles.css';
import Dashboard from './components/Dashboard/Dashboard';
import ToastContainer from './components/ToastContainer';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useSystemStatus } from './hooks/useApiService';

// Lazy load components for better performance
const Settings = lazy(() => import('./components/Settings'));
const NetFlow = lazy(() => import('./components/NetFlow/NetFlow'));
const Syslog = lazy(() => import('./components/Syslog/Syslog'));
const SNMP = lazy(() => import('./components/SNMP/SNMP'));
const WindowsEvents = lazy(() => import('./components/WindowsEvents/WindowsEvents'));
const BufferStatus = lazy(() => import('./components/BufferStatus/BufferStatus'));
const Metrics = lazy(() => import('./components/Metrics/Metrics'));

// Menu items for navigation
const menuItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/flows', label: 'NetFlow', icon: '🌊' },
  { path: '/syslog', label: 'Syslog', icon: '📝' },
  { path: '/snmp', label: 'SNMP', icon: '📡' },
  { path: '/windows', label: 'Windows Events', icon: '🪟' },
  { path: '/buffer', label: 'Buffer Status', icon: '💾' },
  { path: '/metrics', label: 'Metrics', icon: '📈' },
  { path: '/settings', label: 'Settings', icon: '⚙️' }
];

// Main App Component
const App = () => {
  const location = useLocation();
  const currentPath = location.pathname || '/';
  const navigate = useNavigate();

  const { data: status } = useSystemStatus(5000);

  return (
    <div className="app" data-testid="app-loaded">
      <ToastContainer />
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>🦅 NoC Raven</h2>
          <p>Telemetry Control Panel</p>
        </div>
        <nav className="sidebar-nav">
          {menuItems.map(item => (
            <button
              key={item.path}
              className={`nav-item ${currentPath === item.path ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="main-content">
        <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
          <Routes>
            <Route path="/" element={<Dashboard systemStatus={status || {}} />} />
            <Route path="/dashboard" element={<Dashboard systemStatus={status || {}} />} />
            <Route path="/flows" element={<NetFlow />} />
            <Route path="/syslog" element={<Syslog />} />
            <Route path="/snmp" element={<SNMP />} />
            <Route path="/windows" element={<WindowsEvents />} />
            <Route path="/buffer" element={<BufferStatus />} />
            <Route path="/metrics" element={<Metrics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Dashboard systemStatus={status || {}} />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
};

export default App;
