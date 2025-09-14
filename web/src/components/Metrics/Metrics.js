import React from 'react';
import { useApiData } from '../../hooks/useApiService';
import './Metrics.css';

const Metrics = () => {
  const { data: metrics, loading, error } = useApiData('/metrics', 5000);

  if (loading && !metrics) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>📈 System Metrics</h1>
          <p>Loading system metrics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>📈 System Metrics</h1>
          <p className="error">Error loading metrics: {error}</p>
        </div>
      </div>
    );
  }

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatNumber = (num) => {
    if (!num) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>📈 System Metrics</h1>
        <p>Comprehensive system performance and telemetry metrics</p>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <h3>CPU Usage</h3>
          <div className="stat-value">{metrics?.cpu_usage || '0%'}</div>
          <div className="stat-label">current usage</div>
        </div>
        <div className="stat-card">
          <h3>Memory Usage</h3>
          <div className="stat-value">{metrics?.memory_usage || '0%'}</div>
          <div className="stat-label">{formatBytes(metrics?.memory?.used)} used</div>
        </div>
        <div className="stat-card">
          <h3>Disk Usage</h3>
          <div className="stat-value">{metrics?.disk_usage || '0%'}</div>
          <div className="stat-label">{formatBytes(metrics?.disk?.used)} used</div>
        </div>
        <div className="stat-card">
          <h3>Network I/O</h3>
          <div className="stat-value">{formatBytes(metrics?.network?.bytes_per_sec)}/s</div>
          <div className="stat-label">current rate</div>
        </div>
      </div>

      <div className="content-grid">
        <div className="card">
          <h2>Service Performance</h2>
          <div className="service-metrics">
            <div className="no-data">No service metrics available</div>
          </div>
        </div>

        <div className="card">
          <h2>Telemetry Throughput</h2>
          <div className="throughput-chart">
            <div className="throughput-item">
              <div className="throughput-label">Syslog Messages</div>
              <div className="throughput-value">{formatNumber(metrics?.telemetry?.syslog_messages || 0)}/min</div>
              <div className="throughput-bar">
                <div 
                  className="throughput-fill syslog"
                  style={{ width: `${Math.min((metrics?.telemetry?.syslog_messages || 0) / 1000 * 100, 100)}%` }}
                ></div>
              </div>
            </div>
            <div className="throughput-item">
              <div className="throughput-label">NetFlow Records</div>
              <div className="throughput-value">{formatNumber(metrics?.telemetry?.netflow_records || 0)}/min</div>
              <div className="throughput-bar">
                <div 
                  className="throughput-fill netflow"
                  style={{ width: `${Math.min((metrics?.telemetry?.netflow_records || 0) / 500 * 100, 100)}%` }}
                ></div>
              </div>
            </div>
            <div className="throughput-item">
              <div className="throughput-label">SNMP Traps</div>
              <div className="throughput-value">{formatNumber(metrics?.telemetry?.snmp_traps || 0)}/min</div>
              <div className="throughput-bar">
                <div 
                  className="throughput-fill snmp"
                  style={{ width: `${Math.min((metrics?.telemetry?.snmp_traps || 0) / 100 * 100, 100)}%` }}
                ></div>
              </div>
            </div>
            <div className="throughput-item">
              <div className="throughput-label">Windows Events</div>
              <div className="throughput-value">{formatNumber(metrics?.telemetry?.windows_events || 0)}/min</div>
              <div className="throughput-bar">
                <div 
                  className="throughput-fill windows"
                  style={{ width: `${Math.min((metrics?.telemetry?.windows_events || 0) / 200 * 100, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Network Statistics</h2>
          <div className="network-stats">
            <div className="network-item">
              <span className="network-label">Bytes Received</span>
              <span className="network-value">0 B</span>
            </div>
            <div className="network-item">
              <span className="network-label">Bytes Sent</span>
              <span className="network-value">0 B</span>
            </div>
            <div className="network-item">
              <span className="network-label">Packets Received</span>
              <span className="network-value">0</span>
            </div>
            <div className="network-item">
              <span className="network-label">Packets Sent</span>
              <span className="network-value">0</span>
            </div>
            <div className="network-item">
              <span className="network-label">Dropped Packets</span>
              <span className="network-value error">0</span>
            </div>
            <div className="network-item">
              <span className="network-label">Error Packets</span>
              <span className="network-value error">0</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Storage Metrics</h2>
          <div className="storage-metrics">
            {metrics?.disk ? (
              <div className="filesystem-item">
                <div className="filesystem-header">
                  <span className="filesystem-path">/</span>
                  <span className="filesystem-usage">{metrics.disk_usage || '0%'}</span>
                </div>
                <div className="filesystem-bar">
                  <div
                    className="filesystem-fill"
                    style={{
                      width: `${parseFloat(metrics.disk_usage) || 0}%`,
                      backgroundColor: parseFloat(metrics.disk_usage) > 90 ? '#e74c3c' :
                                      parseFloat(metrics.disk_usage) > 75 ? '#f39c12' : '#27ae60'
                    }}
                  ></div>
                </div>
                <div className="filesystem-details">
                  <span>Used: {formatBytes(metrics.disk.used)}</span>
                  <span>Available: {formatBytes(metrics.disk.available)}</span>
                  <span>Total: {formatBytes(metrics.disk.total)}</span>
                </div>
              </div>
            ) : (
              <div className="no-data">No filesystem data available</div>
            )}
          </div>
        </div>

        <div className="card">
          <h2>Process Information</h2>
          <div className="process-list">
            <div className="no-data">No process data available</div>
          </div>
        </div>

        <div className="card">
          <h2>System Load</h2>
          <div className="load-metrics">
            <div className="load-item">
              <span className="load-label">1 minute</span>
              <span className="load-value">0</span>
            </div>
            <div className="load-item">
              <span className="load-label">5 minutes</span>
              <span className="load-value">0</span>
            </div>
            <div className="load-item">
              <span className="load-label">15 minutes</span>
              <span className="load-value">0</span>
            </div>
            <div className="load-item">
              <span className="load-label">CPU Cores</span>
              <span className="load-value">0</span>
            </div>
          </div>
          <div className="load-chart">
            <div className="load-bar">
              <div 
                className="load-fill"
                style={{ 
                  width: `${Math.min((metrics?.system?.load_1m || 0) / (metrics?.system?.cpu_cores || 1) * 100, 100)}%`,
                  backgroundColor: (metrics?.system?.load_1m || 0) / (metrics?.system?.cpu_cores || 1) > 0.8 ? '#e74c3c' : 
                                  (metrics?.system?.load_1m || 0) / (metrics?.system?.cpu_cores || 1) > 0.6 ? '#f39c12' : '#27ae60'
                }}
              ></div>
            </div>
            <div className="load-label">Current Load Average</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Metrics;
