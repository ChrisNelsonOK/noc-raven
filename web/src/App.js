import React, { useState, useEffect } from 'react';
import './styles.css';
import Settings from './components/Settings';

// Simple routing implementation
const Router = ({ children }) => children;
const Route = ({ path, element, children }) => {
  const currentPath = window.location.hash.slice(1) || '/';
  if (path === currentPath) {
    return element || children;
  }
  return null;
};

const useNavigate = () => {
  return (path) => {
    window.location.hash = path;
    window.dispatchEvent(new Event('hashchange'));
  };
};

// Toast system
const ToastContainer = () => {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const handler = (e) => {
      const { type = 'info', message, ttl = 5000 } = e.detail || {};
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => setToasts((prev) => prev.filter(t => t.id !== id)), ttl);
    };
    window.addEventListener('toast', handler);
    return () => window.removeEventListener('toast', handler);
  }, []);
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
};

// API service
const apiService = {
  async fetchData(endpoint) {
    try {
      const response = await fetch(`/api${endpoint}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      return null;
    }
  }
};

// Dashboard Component
const Dashboard = () => {
  const [status, setStatus] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [services, setServices] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const [statusData] = await Promise.all([
        apiService.fetchData('/system/status')
      ]);
      
      setStatus(statusData);
      // Optional future wiring: metrics/services
      setMetrics(null);
      setServices(null);
    };

    fetchData();
    const interval = setInterval(fetchData, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (uptime) => {
    if (!uptime) return 'Unknown';
    return uptime;
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>🦅 NoC Raven Dashboard</h1>
        <p>Real-time telemetry monitoring and control</p>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>System Status</h3>
          <div className="metric-value status-ok">
            {status?.status || 'Loading...'}
          </div>
          <p>Uptime: {formatUptime(status?.uptime)}</p>
        </div>

        <div className="metric-card">
          <h3>CPU Usage</h3>
          <div className="metric-value">
            {status?.cpu_usage || 0}%
          </div>
          <div className="metric-bar">
            <div 
              className="metric-fill" 
              style={{ width: `${status?.cpu_usage || 0}%` }}
            ></div>
          </div>
        </div>

        <div className="metric-card">
          <h3>Memory Usage</h3>
          <div className="metric-value">
            {status?.memory_usage || 0}%
          </div>
          <div className="metric-bar">
            <div 
              className="metric-fill" 
              style={{ width: `${status?.memory_usage || 0}%` }}
            ></div>
          </div>
        </div>

        <div className="metric-card">
          <h3>Active Flows</h3>
          <div className="metric-value">
            {metrics?.metrics?.flows_per_second || 0}/sec
          </div>
          <p>Network flows being processed</p>
        </div>

        <div className="metric-card">
          <h3>Log Messages</h3>
          <div className="metric-value">
            {metrics?.metrics?.syslog_messages_per_minute || 0}/min
          </div>
          <p>Syslog messages received</p>
        </div>

        <div className="metric-card">
          <h3>Monitored Devices</h3>
          <div className="metric-value">
            {metrics?.metrics?.monitored_devices || 0}
          </div>
          <p>SNMP devices online</p>
        </div>
      </div>

      <div className="services-status">
        <h2>Service Status</h2>
        <div className="services-grid">
          {services?.services?.map((service, index) => (
            <div key={index} className="service-card">
              <div className="service-header">
                <h4>{service.name}</h4>
                <span className={`status-badge ${service.status}`}>
                  {service.status}
                </span>
              </div>
              <p>{service.description}</p>
              <p>Port: {service.port}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// NetFlow Component
const NetFlow = () => {
  const [flows, setFlows] = useState(null);

  useEffect(() => {
    const fetchFlows = async () => {
      const data = await apiService.fetchData('/flows');
      setFlows(data);
    };

    fetchFlows();
    const interval = setInterval(fetchFlows, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1>🌐 NetFlow Analysis</h1>
        <p>Real-time network flow monitoring and analysis</p>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <h3>Total Flows</h3>
          <div className="stat-value">{flows?.total_flows || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Active Connections</h3>
          <div className="stat-value">{flows?.flows?.length || 0}</div>
        </div>
      </div>

      <div className="flows-table">
        <h2>Recent Network Flows</h2>
        <table>
          <thead>
            <tr>
              <th>Source IP</th>
              <th>Destination IP</th>
              <th>Protocol</th>
              <th>Source Port</th>
              <th>Dest Port</th>
              <th>Bytes</th>
              <th>Packets</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {flows?.flows?.map((flow, index) => (
              <tr key={index}>
                <td>{flow.src_ip}</td>
                <td>{flow.dst_ip}</td>
                <td>{flow.protocol}</td>
                <td>{flow.src_port}</td>
                <td>{flow.dst_port}</td>
                <td>{flow.bytes.toLocaleString()}</td>
                <td>{flow.packets}</td>
                <td>{new Date(flow.timestamp).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="protocol-stats">
        <h2>Protocol Distribution</h2>
        <div className="protocol-grid">
          {flows?.top_protocols?.map((protocol, index) => (
            <div key={index} className="protocol-card">
              <h4>{protocol}</h4>
              <div className="protocol-bar">
                <div 
                  className="protocol-fill" 
                  style={{ width: `${90 - index * 20}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Syslog Component
const Syslog = () => {
  const [logs, setLogs] = useState(null);

  useEffect(() => {
    const fetchLogs = async () => {
      const data = await apiService.fetchData('/syslog');
      setLogs(data);
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  const getSeverityClass = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'error': return 'severity-error';
      case 'warning': return 'severity-warning';
      case 'info': return 'severity-info';
      default: return 'severity-default';
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>📋 Syslog Monitor</h1>
        <p>Real-time system log monitoring and analysis</p>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <h3>Total Logs</h3>
          <div className="stat-value">{logs?.total_logs || 0}</div>
        </div>
        <div className="stat-card error">
          <h3>Errors</h3>
          <div className="stat-value">{logs?.log_levels?.error || 0}</div>
        </div>
        <div className="stat-card warning">
          <h3>Warnings</h3>
          <div className="stat-value">{logs?.log_levels?.warning || 0}</div>
        </div>
        <div className="stat-card info">
          <h3>Info</h3>
          <div className="stat-value">{logs?.log_levels?.info || 0}</div>
        </div>
      </div>

      <div className="logs-container">
        <h2>Recent Log Entries</h2>
        <div className="logs-list">
          {logs?.logs?.map((log, index) => (
            <div key={index} className={`log-entry ${getSeverityClass(log.severity)}`}>
              <div className="log-header">
                <span className="log-timestamp">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
                <span className="log-host">{log.host}</span>
                <span className={`log-severity ${getSeverityClass(log.severity)}`}>
                  {log.severity}
                </span>
              </div>
              <div className="log-message">{log.message}</div>
              <div className="log-facility">Facility: {log.facility}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// SNMP Component
const SNMP = () => {
  const [devices, setDevices] = useState(null);

  useEffect(() => {
    const fetchDevices = async () => {
      const data = await apiService.fetchData('/snmp');
      setDevices(data);
    };

    fetchDevices();
    const interval = setInterval(fetchDevices, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1>🔌 SNMP Monitoring</h1>
        <p>Network device monitoring via SNMP</p>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <h3>Total Devices</h3>
          <div className="stat-value">{devices?.total_devices || 0}</div>
        </div>
        <div className="stat-card success">
          <h3>Online</h3>
          <div className="stat-value">{devices?.device_status?.online || 0}</div>
        </div>
        <div className="stat-card warning">
          <h3>Warning</h3>
          <div className="stat-value">{devices?.device_status?.warning || 0}</div>
        </div>
        <div className="stat-card error">
          <h3>Offline</h3>
          <div className="stat-value">{devices?.device_status?.offline || 0}</div>
        </div>
      </div>

      <div className="devices-grid">
        {devices?.devices?.map((device, index) => (
          <div key={index} className="device-card">
            <div className="device-header">
              <h3>{device.hostname}</h3>
              <span className="device-ip">{device.ip}</span>
            </div>
            <div className="device-info">
              <p><strong>Uptime:</strong> {device.uptime}</p>
            </div>
            <div className="interfaces">
              <h4>Interfaces</h4>
              {device.interfaces?.map((iface, idx) => (
                <div key={idx} className="interface">
                  <div className="interface-name">{iface.name}</div>
                  <div className={`interface-status ${iface.status}`}>
                    {iface.status}
                  </div>
                  <div className="interface-stats">
                    <span>In: {iface.in_octets?.toLocaleString()} bytes</span>
                    <span>Out: {iface.out_octets?.toLocaleString()} bytes</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Metrics Component
const Metrics = () => {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      const data = await apiService.fetchData('/metrics');
      setMetrics(data);
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1>📊 System Metrics</h1>
        <p>Real-time performance metrics and analytics</p>
      </div>

      <div className="metrics-section">
        <h2>Telemetry Metrics</h2>
        <div className="metrics-grid">
          <div className="metric-card">
            <h3>Flows/Second</h3>
            <div className="metric-value">
              {metrics?.metrics?.flows_per_second || 0}
            </div>
            <div className="metric-trend">↗ +12% from last hour</div>
          </div>

          <div className="metric-card">
            <h3>Syslog Messages/Min</h3>
            <div className="metric-value">
              {metrics?.metrics?.syslog_messages_per_minute || 0}
            </div>
            <div className="metric-trend">↘ -5% from last hour</div>
          </div>

          <div className="metric-card">
            <h3>SNMP Polls/Min</h3>
            <div className="metric-value">
              {metrics?.metrics?.snmp_polls_per_minute || 0}
            </div>
            <div className="metric-trend">→ Stable</div>
          </div>

          <div className="metric-card">
            <h3>Storage Used</h3>
            <div className="metric-value">
              {metrics?.metrics?.storage_used_gb || 0} GB
            </div>
            <div className="metric-trend">↗ +0.1 GB today</div>
          </div>
        </div>
      </div>

      <div className="performance-section">
        <h2>Performance Metrics</h2>
        <div className="performance-grid">
          <div className="perf-card">
            <h3>Response Time</h3>
            <div className="perf-value">
              {metrics?.performance?.avg_response_time_ms || 0}ms
            </div>
            <div className="perf-bar">
              <div 
                className="perf-fill good" 
                style={{ width: '85%' }}
              ></div>
            </div>
          </div>

          <div className="perf-card">
            <h3>CPU Load</h3>
            <div className="perf-value">
              {metrics?.performance?.cpu_load || 0}
            </div>
            <div className="perf-bar">
              <div 
                className="perf-fill good" 
                style={{ width: '23%' }}
              ></div>
            </div>
          </div>

          <div className="perf-card">
            <h3>Memory Usage</h3>
            <div className="perf-value">
              {metrics?.performance?.memory_usage_mb || 0} MB
            </div>
            <div className="perf-bar">
              <div 
                className="perf-fill good" 
                style={{ width: '40%' }}
              ></div>
            </div>
          </div>

          <div className="perf-card">
            <h3>Disk I/O Ops</h3>
            <div className="perf-value">
              {metrics?.performance?.disk_io_ops || 0}
            </div>
            <div className="perf-bar">
              <div 
                className="perf-fill good" 
                style={{ width: '60%' }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


// Main App Component
const App = () => {
  const [currentPath, setCurrentPath] = useState(window.location.hash.slice(1) || '/');
  const navigate = useNavigate();

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(window.location.hash.slice(1) || '/');
    };
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const menuItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/flows', label: 'Flow', icon: '🌐' },
    { path: '/syslog', label: 'Syslog', icon: '📋' },
    { path: '/snmp', label: 'SNMP', icon: '🔌' },
    { path: '/metrics', label: 'Metrics', icon: '📈' },
    { path: '/windows', label: 'Windows Events', icon: '🪟' },
    { path: '/settings', label: 'Settings', icon: '⚙️' }
  ];

return (
    <div className="app">
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
        <Router>
          <Route path="/" element={<Dashboard />} />
          <Route path="/flows" element={<NetFlow />} />
          <Route path="/syslog" element={<Syslog />} />
          <Route path="/snmp" element={<SNMP />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/windows" element={<Settings initialTab="windows" />} />
        </Router>
      </div>
    </div>
  );
};

export default App;
