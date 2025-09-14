import React, { useState, useEffect } from 'react';
import './Syslog.css';

const Syslog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({
    severity: 'all',
    facility: 'all',
    search: ''
  });
  const [stats, setStats] = useState({
    totalLogs: 0,
    messagesPerMinute: 0,
    severityDistribution: {},
    facilityDistribution: {},
    topHosts: []
  });

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000); // Refresh every 3 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/syslog?limit=100');
      const data = await response.json();
      
      setLogs(data.logs || []);
      calculateStats(data.logs || []);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const calculateStats = (logData) => {
    const severities = {};
    const facilities = {};
    const hosts = {};
    
    logData.forEach(log => {
      // Count severities
      const sev = log.severity || 'info';
      severities[sev] = (severities[sev] || 0) + 1;
      
      // Count facilities
      const fac = log.facility || 'local0';
      facilities[fac] = (facilities[fac] || 0) + 1;
      
      // Count hosts
      const host = log.host || 'unknown';
      hosts[host] = (hosts[host] || 0) + 1;
    });

    const topHosts = Object.entries(hosts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([host, count]) => ({ host, count }));

    setStats({
      totalLogs: logData.length,
      messagesPerMinute: Math.round(logData.length / 5), // Approximate
      severityDistribution: severities,
      facilityDistribution: facilities,
      topHosts
    });
  };

  const getSeverityColor = (severity) => {
    const colors = {
      'emerg': '#dc2626',    // red
      'alert': '#ea580c',    // orange-red
      'crit': '#f59e0b',     // amber
      'err': '#eab308',      // yellow
      'warning': '#84cc16',  // lime
      'notice': '#22c55e',   // green
      'info': '#3b82f6',     // blue
      'debug': '#6b7280'     // gray
    };
    return colors[severity] || colors.info;
  };

  const getSeverityIcon = (severity) => {
    const icons = {
      'emerg': '🚨',
      'alert': '⚠️',
      'crit': '❌',
      'err': '🔴',
      'warning': '🟡',
      'notice': '🔵',
      'info': 'ℹ️',
      'debug': '🔍'
    };
    return icons[severity] || icons.info;
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const filteredLogs = logs.filter(log => {
    if (filter.severity !== 'all' && log.severity !== filter.severity) {
      return false;
    }
    if (filter.facility !== 'all' && log.facility !== filter.facility) {
      return false;
    }
    if (filter.search && !log.message.toLowerCase().includes(filter.search.toLowerCase())) {
      return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="syslog-page">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading Syslog data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="syslog-page">
        <div className="error">
          <h2>⚠️ Error Loading Syslog Data</h2>
          <p>{error}</p>
          <button onClick={fetchLogs} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="syslog-page">
      <header className="page-header">
        <h1>📝 Syslog Monitor</h1>
        <p>Real-time system log monitoring and analysis</p>
        <div className="last-updated">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </header>

      <div className="syslog-stats">
        <div className="stat-card">
          <div className="stat-value">{stats.totalLogs.toLocaleString()}</div>
          <div className="stat-label">Total Messages</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.messagesPerMinute}</div>
          <div className="stat-label">Messages/min</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Object.keys(stats.severityDistribution).length}</div>
          <div className="stat-label">Severity Levels</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.topHosts.length}</div>
          <div className="stat-label">Active Hosts</div>
        </div>
      </div>

      <div className="syslog-controls">
        <div className="filter-group">
          <label>Severity:</label>
          <select 
            value={filter.severity} 
            onChange={(e) => setFilter({...filter, severity: e.target.value})}
          >
            <option value="all">All</option>
            <option value="emerg">Emergency</option>
            <option value="alert">Alert</option>
            <option value="crit">Critical</option>
            <option value="err">Error</option>
            <option value="warning">Warning</option>
            <option value="notice">Notice</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Facility:</label>
          <select 
            value={filter.facility} 
            onChange={(e) => setFilter({...filter, facility: e.target.value})}
          >
            <option value="all">All</option>
            <option value="kern">Kernel</option>
            <option value="user">User</option>
            <option value="mail">Mail</option>
            <option value="daemon">Daemon</option>
            <option value="auth">Auth</option>
            <option value="syslog">Syslog</option>
            <option value="local0">Local0</option>
            <option value="local1">Local1</option>
          </select>
        </div>

        <div className="filter-group search-group">
          <label>Search:</label>
          <input 
            type="text" 
            placeholder="Filter messages..."
            value={filter.search}
            onChange={(e) => setFilter({...filter, search: e.target.value})}
          />
        </div>

        <button onClick={() => setFilter({severity: 'all', facility: 'all', search: ''})}>
          Clear Filters
        </button>
      </div>

      <div className="syslog-grid">
        {/* Severity Distribution */}
        <div className="card severity-distribution">
          <h2>Severity Distribution</h2>
          <div className="severity-list">
            {Object.entries(stats.severityDistribution).map(([severity, count]) => (
              <div key={severity} className="severity-item">
                <span className="severity-icon">{getSeverityIcon(severity)}</span>
                <span className="severity-name">{severity.toUpperCase()}</span>
                <span className="severity-count">{count}</span>
                <div className="severity-bar">
                  <div 
                    className="severity-fill"
                    style={{ 
                      width: `${(count / stats.totalLogs) * 100}%`,
                      backgroundColor: getSeverityColor(severity)
                    }}
                  ></div>
                </div>
              </div>
            ))}
            {Object.keys(stats.severityDistribution).length === 0 && (
              <div className="no-data">No severity data available</div>
            )}
          </div>
        </div>

        {/* Top Hosts */}
        <div className="card top-hosts">
          <h2>Top Hosts</h2>
          <div className="host-list">
            {stats.topHosts.map((host, index) => (
              <div key={index} className="host-item">
                <span className="host-name">{host.host}</span>
                <span className="host-count">{host.count} messages</span>
              </div>
            ))}
            {stats.topHosts.length === 0 && (
              <div className="no-data">No host data available</div>
            )}
          </div>
        </div>

        {/* Recent Log Messages */}
        <div className="card recent-logs">
          <h2>Recent Log Messages</h2>
          <div className="log-count">
            Showing {filteredLogs.length} of {logs.length} messages
          </div>
          <div className="logs-container">
            {Array.isArray(filteredLogs) ? filteredLogs.slice(-50).reverse().map((log, index) => (
              <div key={index} className="log-entry">
                <div className="log-header">
                  <span className="log-time">{formatTimestamp(log.timestamp)}</span>
                  <span 
                    className="log-severity"
                    style={{ color: getSeverityColor(log.severity) }}
                  >
                    {getSeverityIcon(log.severity)} {log.severity?.toUpperCase()}
                  </span>
                  <span className="log-facility">{log.facility}</span>
                  <span className="log-host">{log.host}</span>
                </div>
                <div className="log-message">{log.message}</div>
              </div>
            )) : (
              <div className="no-data">
                <p>No syslog data available</p>
              </div>
            )}
            {Array.isArray(filteredLogs) && filteredLogs.length === 0 && (
              <div className="no-data">
                <p>No matching syslog messages</p>
                <small>
                  {logs.length === 0 
                    ? "Ensure Fluent Bit is configured to receive syslog messages" 
                    : "Try adjusting your filters"
                  }
                </small>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Syslog;
