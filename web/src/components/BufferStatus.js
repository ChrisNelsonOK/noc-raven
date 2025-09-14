import React, { useState, useEffect } from 'react';

const BufferStatus = () => {
  const [bufferData, setBufferData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBufferStatus = async () => {
      try {
        const response = await fetch('/api/buffer');
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
          <span className="status-indicator status-ok"></span>
          Buffer System: Active (Uptime: {bufferData.uptime || 'Unknown'})
        </div>
      </div>

      {/* System Overview */}
      <div className="content-section">
        <h3>System Overview</h3>
        <div className="overview-grid">
          <div className="overview-card">
            <h4>Buffer Status</h4>
            <div className="overview-value">
              🟢 Active
            </div>
          </div>
          <div className="overview-card">
            <h4>Buffer Size</h4>
            <div className="overview-value">
              {bufferData.buffer_size || 'Unknown'}
            </div>
          </div>
          <div className="overview-card">
            <h4>Utilization</h4>
            <div className="overview-value">
              {bufferData.utilization || '0%'}
            </div>
          </div>
          <div className="overview-card">
            <h4>Health Score</h4>
            <div className="overview-value">
              {bufferData.health_score || 0}/100
            </div>
          </div>
        </div>
      </div>

      {/* Service Details */}
      <div className="content-section">
        <h3>Service Throughput Metrics</h3>
        <div className="services-grid">
          {Object.entries(bufferData.throughput_metrics || {}).map(([serviceName, metrics]) => {
            const utilizationMetrics = bufferData.utilization_metrics?.[serviceName] || {};
            const healthStatus = 'healthy'; // Default to healthy since we don't have specific health data
            const healthColor = getHealthColor(healthStatus);

            return (
              <div key={serviceName} className="service-buffer-card">
                <div className="service-header">
                  <h4>
                    {serviceName === 'windows' ? '🪟 Windows Events' :
                     serviceName === 'syslog' ? '📋 Syslog' :
                     serviceName === 'netflow' ? '🌐 NetFlow' :
                     serviceName === 'snmp' ? '🔌 SNMP' :
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
                    <span className="stat-label">Bytes/sec:</span>
                    <span className="stat-value">{formatBytes(metrics.bytes_per_sec || 0)}/s</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Max Bytes/sec:</span>
                    <span className="stat-value">{formatBytes(metrics.max_bytes_per_sec || 0)}/s</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Entries:</span>
                    <span className="stat-value">{utilizationMetrics.entries || 0}K</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Rate/sec:</span>
                    <span className="stat-value">{utilizationMetrics.rate_per_sec || 0}</span>
                  </div>
                </div>

                {/* Progress bar for throughput utilization */}
                <div className="buffer-utilization">
                  <div className="utilization-header">
                    <span>Throughput Utilization</span>
                    <span>{((metrics.bytes_per_sec / metrics.max_bytes_per_sec) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="utilization-bar">
                    <div
                      className="utilization-fill"
                      style={{
                        width: `${Math.min((metrics.bytes_per_sec / metrics.max_bytes_per_sec) * 100, 100)}%`,
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

      {/* Performance Metrics */}
      <div className="content-section">
        <h3>📊 Performance Metrics</h3>
        <div className="performance-grid">
          {Object.entries(bufferData.performance_metrics || {}).map(([metric, value]) => (
            <div key={metric} className="performance-card">
              <h4>{metric.replace('_', ' ').toUpperCase()}</h4>
              <div className="performance-value">{value}</div>
            </div>
          ))}
        </div>
      </div>
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