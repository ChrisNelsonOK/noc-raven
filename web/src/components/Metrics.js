import React, { useState, useEffect } from 'react';

const Metrics = () => {
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/metrics')
      .then(res => res.json())
      .then(data => {
        setMetrics(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading metrics...</div>;

  return (
    <div className="metrics-page">
      <header className="page-header">
        <h1>📈 System Metrics</h1>
        <p>System performance and resource utilization metrics</p>
      </header>

      <div className="metrics-grid">
        <div className="card">
          <h2>CPU Usage</h2>
          <div className="metric-value">{metrics.cpu_usage || "0%"}</div>
        </div>

        <div className="card">
          <h2>Memory Usage</h2>
          <div className="metric-value">{metrics.memory_usage || "0%"}</div>
        </div>

        <div className="card">
          <h2>Disk Usage</h2>
          <div className="metric-value">{metrics.disk_usage || "0%"}</div>
        </div>

        <div className="card">
          <h2>Uptime</h2>
          <div className="metric-value">{metrics.uptime || "0h"}</div>
        </div>

        <div className="card">
          <h2>Memory Details</h2>
          <div className="metric-details">
            <div>Total: {metrics.memory ? Math.round(metrics.memory.total / 1024 / 1024 / 1024) : 0} GB</div>
            <div>Used: {metrics.memory ? Math.round(metrics.memory.used / 1024 / 1024 / 1024) : 0} GB</div>
            <div>Available: {metrics.memory ? Math.round(metrics.memory.available / 1024 / 1024 / 1024) : 0} GB</div>
          </div>
        </div>

        <div className="card">
          <h2>Network Interfaces</h2>
          <div className="metric-value">{metrics.network?.interfaces || "No data"}</div>
        </div>
      </div>
    </div>
  );
};

export default Metrics;
