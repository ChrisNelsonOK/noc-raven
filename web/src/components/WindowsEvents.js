import React, { useState, useEffect } from 'react';

const WindowsEvents = () => {
  const [windowsData, setWindowsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedHost, setSelectedHost] = useState('all');

  useEffect(() => {
    const fetchWindowsData = async () => {
      try {
        const response = await fetch('/api/data/windows');
        if (response.ok) {
          const data = await response.json();
          setWindowsData(data);
        } else {
          console.error('Failed to fetch Windows Events data');
        }
      } catch (error) {
        console.error('Error fetching Windows Events data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWindowsData();
    const interval = setInterval(fetchWindowsData, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="loading">Loading Windows Events data...</div>;
  }

  if (!windowsData) {
    return <div className="error">Failed to load Windows Events data</div>;
  }

  const formatEventLevel = (level) => {
    const levelMap = {
      'Critical': '🔴',
      'Error': '🟠', 
      'Warning': '🟡',
      'Information': '🔵',
      'Verbose': '⚪'
    };
    return levelMap[level] || level;
  };

  const filteredEvents = selectedHost === 'all' 
    ? windowsData.recent_events
    : windowsData.recent_events.filter(event => event.hostname === selectedHost);

  return (
    <div className="windows-events">
      <div className="page-header">
        <h2>🪟 Windows Events Collection</h2>
        <div className="status-badge">
          <span className={`status-indicator ${windowsData.status === 'active' ? 'status-ok' : 'status-error'}`}></span>
          Status: {windowsData.status}
        </div>
      </div>

      {/* Overview Stats */}
      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Events Received</h3>
          <div className="metric-value">{windowsData.events_received?.toLocaleString()}</div>
          <p>Average: {windowsData.average_rate}</p>
        </div>

        <div className="metric-card">
          <h3>Events Processed</h3>
          <div className="metric-value">{windowsData.events_processed?.toLocaleString()}</div>
          <p>Peak: {windowsData.peak_rate}</p>
        </div>

        <div className="metric-card">
          <h3>Source Hosts</h3>
          <div className="metric-value">{windowsData.source_hosts?.length}</div>
          <p>Active endpoints</p>
        </div>

        <div className="metric-card">
          <h3>Queue Status</h3>
          <div className="metric-value">{windowsData.events_queued}</div>
          <p>Events queued</p>
        </div>
      </div>

      {/* Event Level Distribution */}
      <div className="content-section">
        <h3>Event Level Distribution</h3>
        <div className="level-distribution">
          {Object.entries(windowsData.event_levels || {}).map(([level, count]) => (
            <div key={level} className="level-item">
              <span className="level-icon">{formatEventLevel(level)}</span>
              <span className="level-name">{level}</span>
              <span className="level-count">{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Source Hosts */}
      <div className="content-section">
        <h3>Source Hosts</h3>
        <div className="host-filter">
          <label>Filter by host:</label>
          <select 
            value={selectedHost} 
            onChange={(e) => setSelectedHost(e.target.value)}
          >
            <option value="all">All Hosts</option>
            {windowsData.source_hosts?.map(host => (
              <option key={host.hostname} value={host.hostname}>
                {host.hostname} ({host.events} events)
              </option>
            ))}
          </select>
        </div>
        
        <div className="hosts-grid">
          {windowsData.source_hosts?.map((host) => (
            <div key={host.hostname} className="host-card">
              <div className="host-header">
                <h4>{host.hostname}</h4>
                <span className="host-ip">{host.ip}</span>
              </div>
              <div className="host-stats">
                <p>Events: <strong>{host.events.toLocaleString()}</strong></p>
                <p>Last Event: <strong>{new Date(host.last_event).toLocaleTimeString()}</strong></p>
              </div>
              <div className="top-events">
                <h5>Top Event Types:</h5>
                {host.top_events?.slice(0, 3).map((event, idx) => (
                  <div key={idx} className="event-type">
                    <span className="event-id">ID {event.id}</span>
                    <span className="event-count">({event.count})</span>
                    <span className="event-desc">{event.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Events */}
      <div className="content-section">
        <h3>Recent Events {selectedHost !== 'all' && `- ${selectedHost}`}</h3>
        <div className="events-table">
          <div className="table-header">
            <span>Time</span>
            <span>Host</span>
            <span>Event ID</span>
            <span>Level</span>
            <span>Channel</span>
            <span>Message</span>
          </div>
          {filteredEvents?.slice(0, 10).map((event, idx) => (
            <div key={idx} className="table-row">
              <span className="event-time">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <span className="event-host">{event.hostname}</span>
              <span className="event-id">{event.event_id}</span>
              <span className="event-level">
                {formatEventLevel(event.level)} {event.level}
              </span>
              <span className="event-channel">{event.channel}</span>
              <span className="event-message">{event.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Configuration */}
      <div className="content-section">
        <h3>Collection Configuration</h3>
        <div className="config-grid">
          <div className="config-item">
            <label>Collection Port:</label>
            <span>{windowsData.configuration?.collection_port}</span>
          </div>
          <div className="config-item">
            <label>Protocol:</label>
            <span>{windowsData.configuration?.collection_protocol}</span>
          </div>
          <div className="config-item">
            <label>Buffer Size:</label>
            <span>{windowsData.configuration?.buffer_size}</span>
          </div>
          <div className="config-item">
            <label>Forwarding:</label>
            <span className={windowsData.configuration?.forwarding_enabled ? 'status-ok' : 'status-error'}>
              {windowsData.configuration?.forwarding_enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="config-item">
            <label>Forwarding Target:</label>
            <span>{windowsData.configuration?.forwarding_target}</span>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="content-section">
        <h3>Performance Metrics</h3>
        <div className="performance-grid">
          <div className="perf-metric">
            <label>CPU Usage:</label>
            <span>{windowsData.performance?.cpu_usage}</span>
          </div>
          <div className="perf-metric">
            <label>Memory Usage:</label>
            <span>{windowsData.performance?.memory_usage}</span>
          </div>
          <div className="perf-metric">
            <label>Disk I/O:</label>
            <span>{windowsData.performance?.disk_io_rate}</span>
          </div>
          <div className="perf-metric">
            <label>Network I/O:</label>
            <span>{windowsData.performance?.network_io_rate}</span>
          </div>
          <div className="perf-metric">
            <label>Buffer Usage:</label>
            <span>{windowsData.performance?.buffer_utilization}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WindowsEvents;