import React, { useState, useEffect } from 'react';

const BufferStatus = () => {
  const [bufferData, setBufferData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBufferStatus = async () => {
      try {
        const response = await fetch('/api/buffer/status');
        if (response.ok) {
          const data = await response.json();
          setBufferData(data);
          setError(null);
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.error('Error fetching buffer status:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBufferStatus();
    const interval = setInterval(fetchBufferStatus, 15000); // Update every 15 seconds
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num);
  };

  const getHealthStatus = (stats) => {
    if (!stats) return 'unknown';
    const utilizationPct = (stats.total_records / 1000000) * 100; // Assuming 1M max records
    if (utilizationPct > 80) return 'critical';
    if (utilizationPct > 60) return 'warning';
    return 'healthy';
  };

  const getHealthColor = (status) => {
    switch (status) {
      case 'healthy': return '#28a745';
      case 'warning': return '#ffc107';
      case 'critical': return '#dc3545';
      default: return '#6c757d';
    }
  };

  if (loading) {
    return <div className="loading">Loading buffer status...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <h2>⚠️ Buffer Status Unavailable</h2>
        <p>Error: {error}</p>
        <p>The buffer manager service may be starting up or unavailable.</p>
      </div>
    );
  }

  if (!bufferData) {
    return <div className="error">No buffer data available</div>;
  }

  return (
    <div className="buffer-status">
      <div className="page-header">
        <h2>🗄️ Buffer Storage Status</h2>
        <div className="status-badge">
          <span className={`status-indicator ${bufferData.enabled ? 'status-ok' : 'status-error'}`}></span>
          Buffer System: {bufferData.enabled ? 'Active' : 'Disabled'}
        </div>
      </div>

      {/* System Overview */}
      <div className="content-section">
        <h3>System Overview</h3>
        <div className="overview-grid">
          <div className="overview-card">
            <h4>Buffer Status</h4>
            <div className="overview-value">
              {bufferData.enabled ? '🟢 Active' : '🔴 Disabled'}
            </div>
          </div>
          <div className="overview-card">
            <h4>Services Monitored</h4>
            <div className="overview-value">
              {Object.keys(bufferData.services || {}).length}
            </div>
          </div>
          <div className="overview-card">
            <h4>Last Updated</h4>
            <div className="overview-value">
              {new Date(bufferData.updated_at * 1000).toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>

      {/* Service Details */}
      <div className="content-section">
        <h3>Service Buffer Details</h3>
        <div className="services-grid">
          {Object.entries(bufferData.services || {}).map(([serviceName, stats]) => {
            const healthStatus = getHealthStatus(stats);
            const healthColor = getHealthColor(healthStatus);

            return (
              <div key={serviceName} className="service-buffer-card">
                <div className="service-header">
                  <h4>
                    {serviceName === 'vector' ? '🪟 Vector (Windows Events)' :
                     serviceName === 'fluent-bit' ? '📋 Fluent Bit (Syslog)' :
                     serviceName === 'goflow2' ? '🌐 GoFlow2 (NetFlow)' :
                     serviceName === 'telegraf' ? '🔌 Telegraf (SNMP)' :
                     `📊 ${serviceName}`}
                  </h4>
                  <div 
                    className="health-indicator"
                    style={{ backgroundColor: healthColor }}
                    title={`Health: ${healthStatus}`}
                  ></div>
                </div>

                <div className="service-stats">
                  <div className="stat-row">
                    <span className="stat-label">Total Records:</span>
                    <span className="stat-value">{formatNumber(stats.total_records)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Storage Used:</span>
                    <span className="stat-value">{formatBytes(stats.total_size)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Forwarded:</span>
                    <span className="stat-value">{formatNumber(stats.forwarded)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Pending:</span>
                    <span className="stat-value">{formatNumber(stats.pending)}</span>
                  </div>
                </div>

                <div className="service-timeline">
                  <div className="timeline-item">
                    <span className="timeline-label">Oldest:</span>
                    <span className="timeline-value">
                      {stats.oldest_record ? 
                        new Date(stats.oldest_record * 1000).toLocaleString() : 
                        'No data'
                      }
                    </span>
                  </div>
                  <div className="timeline-item">
                    <span className="timeline-label">Newest:</span>
                    <span className="timeline-value">
                      {stats.newest_record ? 
                        new Date(stats.newest_record * 1000).toLocaleString() : 
                        'No data'
                      }
                    </span>
                  </div>
                </div>

                {/* Progress bar for buffer utilization */}
                <div className="buffer-utilization">
                  <div className="utilization-header">
                    <span>Buffer Utilization</span>
                    <span>{((stats.total_records / 1000000) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="utilization-bar">
                    <div 
                      className="utilization-fill"
                      style={{ 
                        width: `${Math.min((stats.total_records / 1000000) * 100, 100)}%`,
                        backgroundColor: healthColor
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Management Actions */}
      <div className="content-section">
        <h3>Buffer Management</h3>
        <div className="management-actions">
          <button 
            className="action-btn cleanup-btn"
            onClick={() => handleCleanup()}
          >
            🧹 Run Cleanup
          </button>
          <button 
            className="action-btn config-btn"
            onClick={() => window.open('/api/buffer/config', '_blank')}
          >
            ⚙️ View Config
          </button>
          <button 
            className="action-btn refresh-btn"
            onClick={() => window.location.reload()}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Storage Warnings */}
      {Object.values(bufferData.services || {}).some(stats => getHealthStatus(stats) !== 'healthy') && (
        <div className="content-section">
          <h3>⚠️ Storage Alerts</h3>
          <div className="alerts-container">
            {Object.entries(bufferData.services || {}).map(([serviceName, stats]) => {
              const healthStatus = getHealthStatus(stats);
              if (healthStatus === 'healthy') return null;

              return (
                <div key={serviceName} className={`alert alert-${healthStatus}`}>
                  <strong>{serviceName}</strong>: 
                  {healthStatus === 'critical' ? 
                    ' Buffer is >80% full. Consider increasing retention limits or checking forwarding.' :
                    ' Buffer is >60% full. Monitor usage closely.'
                  }
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // Helper function for cleanup
  async function handleCleanup() {
    try {
      const response = await fetch('/api/buffer/cleanup', { method: 'POST' });
      if (response.ok) {
        alert('Cleanup completed successfully');
        window.location.reload();
      } else {
        throw new Error(`Cleanup failed: HTTP ${response.status}`);
      }
    } catch (error) {
      alert(`Cleanup error: ${error.message}`);
    }
  }
};

export default BufferStatus;