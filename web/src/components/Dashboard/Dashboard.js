import React from 'react';
import { useSystemStatus } from '../../hooks/useApiService';
import './Dashboard.css';

const Dashboard = ({ systemStatus = {} }) => {
  const { data: liveStatus, loading } = useSystemStatus(5000);
  
  // Use passed systemStatus or live data
  const status = systemStatus.status ? systemStatus : liveStatus || {};

  const formatUptime = (uptime) => {
    if (!uptime) return 'Unknown';
    return uptime;
  };

  // Use real data from systemStatus or fallback to defaults
  const realMetrics = status.metrics || {};
  const telemetryData = status.telemetryStats || {};
  
  const metrics = {
    flowsPerSecond: telemetryData.flowsPerSecond || 0,
    syslogMessages: telemetryData.syslogMessages || 0,
    snmpPolls: telemetryData.snmpPolls || 0,
    activeDevices: telemetryData.activeDevices || 0,
    dataBuffer: telemetryData.dataBuffer || '0B',
    cpuUsage: realMetrics.cpuUsage || status.cpu_usage || 0,
    memoryUsage: realMetrics.memoryUsage || status.memory_usage || 0,
    diskUsage: realMetrics.diskUsage || status.disk_usage || 0
  };

  if (loading && !status.status) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <h1>🦅 NoC Raven Dashboard</h1>
          <p>Loading system status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>🦅 NoC Raven Dashboard</h1>
        <p>Real-time telemetry monitoring and control</p>
      </div>

      <div className="dashboard-grid">
        {/* System Status */}
        <div className="card system-overview">
          <h2>System Overview</h2>
          <div className="overview-stats">
            <div className="stat">
              <span className="stat-label">Uptime</span>
              <span className="stat-value">{formatUptime(status.uptime || 0)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Status</span>
              <span className={`stat-value status-${status.status || 'loading'}`}>
                {status.status || 'Loading...'}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Active Devices</span>
              <span className="stat-value">{metrics.activeDevices}</span>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="card performance-metrics">
          <h2>Performance</h2>
          <div className="metrics-grid">
            <div className="metric">
              <div className="metric-header">
                <span>CPU Usage</span>
                <span className="metric-value">{metrics.cpuUsage}%</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill cpu" 
                  style={{ width: `${metrics.cpuUsage}%` }}
                ></div>
              </div>
            </div>
            
            <div className="metric">
              <div className="metric-header">
                <span>Memory Usage</span>
                <span className="metric-value">{metrics.memoryUsage}%</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill memory" 
                  style={{ width: `${metrics.memoryUsage}%` }}
                ></div>
              </div>
            </div>
            
            <div className="metric">
              <div className="metric-header">
                <span>Disk Usage</span>
                <span className="metric-value">{metrics.diskUsage}%</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill disk" 
                  style={{ width: `${metrics.diskUsage}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Telemetry Stats */}
        <div className="card telemetry-stats">
          <h2>Telemetry Statistics</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">🌊</div>
              <div className="stat-info">
                <span className="stat-number">{metrics.flowsPerSecond.toLocaleString()}</span>
                <span className="stat-description">Flows/sec</span>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">📝</div>
              <div className="stat-info">
                <span className="stat-number">{metrics.syslogMessages.toLocaleString()}</span>
                <span className="stat-description">Syslog/min</span>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">📡</div>
              <div className="stat-info">
                <span className="stat-number">{metrics.snmpPolls.toLocaleString()}</span>
                <span className="stat-description">SNMP/min</span>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">💾</div>
              <div className="stat-info">
                <span className="stat-number">{metrics.dataBuffer}</span>
                <span className="stat-description">Buffer</span>
              </div>
            </div>
          </div>
        </div>

        {/* Services Status */}
        <div className="card services-status">
          <h2>Services</h2>
          <div className="services-grid">
            {status.services && Object.entries(status.services).map(([name, service]) => (
              <div key={name} className={`service-item status-${service.status}`}>
                <div className="service-name">{name}</div>
                <div className="service-status">{service.status}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
