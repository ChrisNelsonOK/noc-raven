import React, { useState, useEffect } from 'react';
import './SNMP.css';

const SNMP = () => {
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalPolls: 0,
    pollsPerMinute: 0,
    activeDevices: 0,
    topDevices: [],
    oidDistribution: {}
  });

  useEffect(() => {
    fetchSNMP();
    const interval = setInterval(fetchSNMP, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchSNMP = async () => {
    try {
      const response = await fetch('/api/snmp');
      const data = await response.json();
      
      setPolls(data.polls || []);
      calculateStats(data.polls || []);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const calculateStats = (pollData) => {
    const devices = new Set();
    const oids = {};
    
    pollData.forEach(poll => {
      if (poll.device) {
        devices.add(poll.device);
      }
      if (poll.oid) {
        oids[poll.oid] = (oids[poll.oid] || 0) + 1;
      }
    });

    const deviceCounts = {};
    pollData.forEach(poll => {
      if (poll.device) {
        deviceCounts[poll.device] = (deviceCounts[poll.device] || 0) + 1;
      }
    });

    const topDevices = Object.entries(deviceCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([device, count]) => ({ device, count }));

    setStats({
      totalPolls: pollData.length,
      pollsPerMinute: Math.round(pollData.length / 10), // Approximate
      activeDevices: devices.size,
      topDevices,
      oidDistribution: oids
    });
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const getOIDName = (oid) => {
    const oidNames = {
      '1.3.6.1.2.1.1.1.0': 'sysDescr',
      '1.3.6.1.2.1.1.3.0': 'sysUpTime',
      '1.3.6.1.2.1.1.4.0': 'sysContact',
      '1.3.6.1.2.1.1.5.0': 'sysName',
      '1.3.6.1.2.1.1.6.0': 'sysLocation',
      '1.3.6.1.2.1.2.1.0': 'ifNumber',
      '1.3.6.1.2.1.2.2.1.2': 'ifDescr',
      '1.3.6.1.2.1.2.2.1.3': 'ifType',
      '1.3.6.1.2.1.2.2.1.5': 'ifSpeed',
      '1.3.6.1.2.1.2.2.1.7': 'ifAdminStatus',
      '1.3.6.1.2.1.2.2.1.8': 'ifOperStatus',
      '1.3.6.1.2.1.2.2.1.10': 'ifInOctets',
      '1.3.6.1.2.1.2.2.1.16': 'ifOutOctets'
    };
    
    return oidNames[oid] || oid;
  };

  if (loading) {
    return (
      <div className="snmp-page">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading SNMP data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="snmp-page">
        <div className="error">
          <h2>⚠️ Error Loading SNMP Data</h2>
          <p>{error}</p>
          <button onClick={fetchSNMP} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="snmp-page">
      <header className="page-header">
        <h1>📡 SNMP Monitor</h1>
        <p>Simple Network Management Protocol monitoring and device management</p>
        <div className="last-updated">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </header>

      <div className="snmp-stats">
        <div className="stat-card">
          <div className="stat-value">{stats.totalPolls.toLocaleString()}</div>
          <div className="stat-label">Total Polls</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.pollsPerMinute}</div>
          <div className="stat-label">Polls/min</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.activeDevices}</div>
          <div className="stat-label">Active Devices</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Object.keys(stats.oidDistribution).length}</div>
          <div className="stat-label">Monitored OIDs</div>
        </div>
      </div>

      <div className="snmp-grid">
        {/* Top Devices */}
        <div className="card top-devices">
          <h2>Top Polled Devices</h2>
          <div className="device-list">
            {stats.topDevices.map((device, index) => (
              <div key={index} className="device-item">
                <div className="device-icon">🖥️</div>
                <div className="device-info">
                  <span className="device-name">{device.device}</span>
                  <span className="device-count">{device.count} polls</span>
                </div>
                <div className="device-status online">●</div>
              </div>
            ))}
            {stats.topDevices.length === 0 && (
              <div className="no-data">No device data available</div>
            )}
          </div>
        </div>

        {/* OID Distribution */}
        <div className="card oid-distribution">
          <h2>OID Distribution</h2>
          <div className="oid-list">
            {Object.entries(stats.oidDistribution).slice(0, 10).map(([oid, count]) => (
              <div key={oid} className="oid-item">
                <div className="oid-name">{getOIDName(oid)}</div>
                <div className="oid-value">{oid}</div>
                <div className="oid-count">{count}</div>
                <div className="oid-bar">
                  <div 
                    className="oid-fill"
                    style={{ 
                      width: `${(count / stats.totalPolls) * 100}%` 
                    }}
                  ></div>
                </div>
              </div>
            ))}
            {Object.keys(stats.oidDistribution).length === 0 && (
              <div className="no-data">No OID data available</div>
            )}
          </div>
        </div>

        {/* Recent SNMP Polls */}
        <div className="card recent-polls">
          <h2>Recent SNMP Polls</h2>
          <div className="polls-container">
            {polls.length > 0 ? (
              <table className="polls-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Device</th>
                    <th>OID</th>
                    <th>Value</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {polls.slice(-20).map((poll, index) => (
                    <tr key={index}>
                      <td>{formatTimestamp(poll.timestamp || Date.now())}</td>
                      <td>{poll.device || 'Unknown'}</td>
                      <td title={poll.oid}>
                        {getOIDName(poll.oid || '')}
                      </td>
                      <td className="poll-value">
                        {String(poll.value || 'N/A').substring(0, 50)}
                        {String(poll.value || '').length > 50 ? '...' : ''}
                      </td>
                      <td>{poll.type || 'string'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="no-data">
                <p>No SNMP poll data available</p>
                <small>
                  Configure SNMP polling in Telegraf to collect device data
                </small>
              </div>
            )}
          </div>
        </div>

        {/* SNMP Configuration */}
        <div className="card snmp-config">
          <h2>SNMP Configuration</h2>
          <div className="config-info">
            <div className="config-item">
              <strong>Protocol Versions:</strong>
              <span>SNMPv1, SNMPv2c, SNMPv3</span>
            </div>
            <div className="config-item">
              <strong>Default Community:</strong>
              <span>public (read-only)</span>
            </div>
            <div className="config-item">
              <strong>Timeout:</strong>
              <span>5 seconds</span>
            </div>
            <div className="config-item">
              <strong>Retries:</strong>
              <span>3 attempts</span>
            </div>
            <div className="config-item">
              <strong>Poll Interval:</strong>
              <span>60 seconds</span>
            </div>
          </div>
          
          <div className="config-actions">
            <button className="config-button">
              📝 Edit Configuration
            </button>
            <button className="config-button">
              🔄 Reload Devices
            </button>
            <button className="config-button">
              📊 View MIB Browser
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SNMP;
