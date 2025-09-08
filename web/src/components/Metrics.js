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
          <div className="metric-value">{metrics.cpuUsage || 0}%</div>
        </div>
        
        <div className="card">
          <h2>Memory Usage</h2>
          <div className="metric-value">{metrics.memoryUsage || 0}%</div>
        </div>
        
        <div className="card">
          <h2>Disk Usage</h2>
          <div className="metric-value">{metrics.diskUsage || 0}%</div>
        </div>
        
        <div className="card">
          <h2>Uptime</h2>
          <div className="metric-value">{Math.floor((metrics.uptime || 0) / 3600)}h</div>
        </div>
      </div>
    </div>
  );
};

export default Metrics;
