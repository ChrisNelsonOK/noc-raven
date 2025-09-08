import React from 'react';
import './Dashboard.css';

const Dashboard = ({ systemStatus }) => {
  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // Use real data from systemStatus or fallback to defaults
  const realMetrics = systemStatus.metrics || {};
  const telemetryData = systemStatus.telemetryStats || {};
  
  const metrics = {
    flowsPerSecond: telemetryData.flowsPerSecond || 0,
    syslogMessages: telemetryData.syslogMessages || 0,
    snmpPolls: telemetryData.snmpPolls || 0,
    activeDevices: telemetryData.activeDevices || 0,
    dataBuffer: telemetryData.dataBuffer || '0B',
    cpuUsage: realMetrics.cpuUsage || 0,
    memoryUsage: realMetrics.memoryUsage || 0,
    diskUsage: realMetrics.diskUsage || 0
  };

  // Use real service status from systemStatus
  const services = systemStatus.services || {};
  const serviceStatus = [
    { name: 'GoFlow2 Collector', status: services.goflow2 ? 'running' : 'stopped', port: '2055/UDP' },
    { name: 'Fluent Bit', status: services['fluent-bit'] ? 'running' : 'stopped', port: '5140/UDP' },
    { name: 'Vector Pipeline', status: services.vector ? 'running' : 'stopped', port: '8084/TCP' },
    { name: 'Web Interface', status: services.nginx ? 'running' : 'stopped', port: '80/TCP' },
    { name: 'Telegraf', status: services.telegraf ? 'running' : 'stopped', port: 'N/A' }
  ];

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>🦅 NoC Raven Dashboard</h1>
        <p>Telemetry Collection & Forwarding Appliance</p>
      </header>

      <div className="dashboard-grid">
        {/* System Status */}
        <div className="card system-overview">
          <h2>System Overview</h2>
          <div className="overview-stats">
            <div className="stat">
              <span className="stat-label">Uptime</span>
              <span className="stat-value">{formatUptime(systemStatus.uptime || 0)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Status</span>
              <span className={`stat-value status-${systemStatus.status || 'loading'}`}>
                {systemStatus.status || 'Loading...'}
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
                <span className="stat-number">{metrics.snmpPolls}</span>
                <span className="stat-description">SNMP Polls/min</span>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">💾</div>
              <div className="stat-info">
                <span className="stat-number">{metrics.dataBuffer}</span>
                <span className="stat-description">Buffer Size</span>
              </div>
            </div>
          </div>
        </div>

        {/* Service Status */}
        <div className="card service-status">
          <h2>Service Status</h2>
          <div className="services-list">
            {serviceStatus.map((service, index) => (
              <div key={index} className="service-item">
                <div className="service-info">
                  <span className="service-name">{service.name}</span>
                  <span className="service-port">{service.port}</span>
                </div>
                <div className={`service-status-indicator status-${service.status}`}>
                  <span className={`status-indicator status-${service.status === 'running' ? 'online' : 'offline'}`}></span>
                  <span className="status-text">{service.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
