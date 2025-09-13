import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';

const Navigation = ({ systemStatus }) => {
  const location = useLocation();

  const navigationItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/flows', label: 'Flow', icon: '🌊' },
    { path: '/syslog', label: 'Syslog', icon: '📝' },
    { path: '/snmp', label: 'SNMP', icon: '📡' },
    { path: '/windows', label: 'Windows Events', icon: '🪟' },
    { path: '/metrics', label: 'Metrics', icon: '📈' },
    { path: '/settings', label: 'Settings', icon: '⚙️' }
  ];

  return (
    <nav className="navigation">
      <div className="nav-header">
        <h1 className="nav-logo">
          🦅 NoC Raven
        </h1>
        <div className="system-status">
          <span className={`status-indicator status-${systemStatus.status}`}></span>
          <span className="status-text">{systemStatus.status}</span>
        </div>
      </div>
      
      <ul className="nav-menu">
        {navigationItems.map((item) => (
          <li key={item.path} className="nav-item">
            <Link
              to={item.path}
              className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      
      <div className="nav-footer">
        <div className="version-info">
          <small>Version 1.0.0-alpha</small>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
