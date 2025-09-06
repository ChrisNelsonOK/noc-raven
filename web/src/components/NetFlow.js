import React, { useState, useEffect } from 'react';
import './NetFlow.css';

const NetFlow = () => {
  const [flows, setFlows] = useState([]);
  const [viewMode, setViewMode] = useState('both'); // 'both' | 'netflow' | 'sflow'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalFlows: 0,
    flowsPerSecond: 0,
    topSources: [],
    topDestinations: [],
    protocolDistribution: {}
  });
  const [configuredPorts, setConfiguredPorts] = useState({ nfv5: 2055, ipfix: 4739, sflow: 6343 });

  useEffect(() => {
    fetchFlows();
    fetchConfiguredPorts();
    const interval = setInterval(fetchFlows, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchConfiguredPorts = async () => {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      const p = cfg?.collection?.netflow?.ports || {};
      setConfiguredPorts({
        nfv5: p.netflow_v5 ?? 2055,
        ipfix: p.ipfix ?? 4739,
        sflow: p.sflow ?? 6343,
      });
    } catch (e) {
      // non-fatal
    }
  };

  const fetchFlows = async () => {
    try {
      const response = await fetch('/api/flows?limit=50');
      const data = await response.json();
      
      // Optionally filter by type if the flow objects provide a Type field
      const all = data.flows || [];
      let filtered = all;
      if (viewMode !== 'both') {
        filtered = all.filter(f => {
          const t = (f.Type || f.type || '').toString().toLowerCase();
          if (viewMode === 'netflow') return t.includes('netflow') || t.includes('ipfix');
          if (viewMode === 'sflow') return t.includes('sflow');
          return true;
        });
      }
      setFlows(filtered);
      calculateStats(data.flows || []);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const calculateStats = (flowData) => {
    const sources = {};
    const destinations = {};
    const protocols = {};
    
    flowData.forEach(flow => {
      // Count sources
      const srcIP = flow.SrcIP || flow.srcIP || 'unknown';
      sources[srcIP] = (sources[srcIP] || 0) + 1;
      
      // Count destinations
      const dstIP = flow.DstIP || flow.dstIP || 'unknown';
      destinations[dstIP] = (destinations[dstIP] || 0) + 1;
      
      // Count protocols
      const proto = flow.Protocol || flow.protocol || 'unknown';
      protocols[proto] = (protocols[proto] || 0) + 1;
    });

    const topSources = Object.entries(sources)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([ip, count]) => ({ ip, count }));

    const topDestinations = Object.entries(destinations)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([ip, count]) => ({ ip, count }));

    setStats({
      totalFlows: flowData.length,
      flowsPerSecond: Math.round(flowData.length / 60), // Approximate
      topSources,
      topDestinations,
      protocolDistribution: protocols
    });
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getProtocolName = (proto) => {
    const protocolMap = {
      1: 'ICMP',
      6: 'TCP',
      17: 'UDP',
      47: 'GRE',
      50: 'ESP',
      51: 'AH'
    };
    return protocolMap[proto] || proto;
  };

  if (loading) {
    return (
      <div className="netflow-page">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading NetFlow data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="netflow-page">
        <div className="error">
          <h2>⚠️ Error Loading NetFlow Data</h2>
          <p>{error}</p>
          <button onClick={fetchFlows} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="netflow-page">
      <header className="page-header">
        <h1>🌊 NetFlow Analysis</h1>
        <p>Real-time network flow monitoring and analysis</p>
        <div className="last-updated">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </header>

      <div className="flow-toggle">
        <div className="toggle-row">
          <span className="toggle-label">View:</span>
          <button className={`toggle-btn ${viewMode==='both'?'active':''}`} onClick={() => setViewMode('both')}>Both</button>
          <button className={`toggle-btn ${viewMode==='netflow'?'active':''}`} onClick={() => setViewMode('netflow')}>NetFlow/IPFIX</button>
          <button className={`toggle-btn ${viewMode==='sflow'?'active':''}`} onClick={() => setViewMode('sflow')}>sFlow</button>
        </div>
        <div className="ports-row">
          <span className="ports-label">Configured ports:</span>
          <span className="port-chip">NetFlow v5: {configuredPorts.nfv5}</span>
          <span className="port-chip">IPFIX: {configuredPorts.ipfix}</span>
          <span className="port-chip">sFlow: {configuredPorts.sflow}</span>
        </div>
      </div>

      <div className="netflow-stats">
        <div className="stat-card">
          <div className="stat-value">{stats.totalFlows.toLocaleString()}</div>
          <div className="stat-label">Total Flows</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.flowsPerSecond}</div>
          <div className="stat-label">Flows/sec</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.topSources.length}</div>
          <div className="stat-label">Active Sources</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Object.keys(stats.protocolDistribution).length}</div>
          <div className="stat-label">Protocols</div>
        </div>
      </div>

      <div className="netflow-grid">
        {/* Top Sources */}
        <div className="card top-sources">
          <h2>Top Sources</h2>
          <div className="source-list">
            {stats.topSources.map((source, index) => (
              <div key={index} className="source-item">
                <span className="ip-address">{source.ip}</span>
                <span className="flow-count">{source.count} flows</span>
              </div>
            ))}
            {stats.topSources.length === 0 && (
              <div className="no-data">No flow data available</div>
            )}
          </div>
        </div>

        {/* Top Destinations */}
        <div className="card top-destinations">
          <h2>Top Destinations</h2>
          <div className="destination-list">
            {stats.topDestinations.map((dest, index) => (
              <div key={index} className="destination-item">
                <span className="ip-address">{dest.ip}</span>
                <span className="flow-count">{dest.count} flows</span>
              </div>
            ))}
            {stats.topDestinations.length === 0 && (
              <div className="no-data">No flow data available</div>
            )}
          </div>
        </div>

        {/* Protocol Distribution */}
        <div className="card protocol-distribution">
          <h2>Protocol Distribution</h2>
          <div className="protocol-list">
            {Object.entries(stats.protocolDistribution).map(([proto, count]) => (
              <div key={proto} className="protocol-item">
                <span className="protocol-name">{getProtocolName(proto)}</span>
                <span className="protocol-count">{count}</span>
                <div className="protocol-bar">
                  <div 
                    className="protocol-fill"
                    style={{ 
                      width: `${(count / stats.totalFlows) * 100}%` 
                    }}
                  ></div>
                </div>
              </div>
            ))}
            {Object.keys(stats.protocolDistribution).length === 0 && (
              <div className="no-data">No protocol data available</div>
            )}
          </div>
        </div>

        {/* Recent Flows */}
        <div className="card recent-flows">
          <h2>Recent Flows</h2>
          <div className="flows-table-container">
            <table className="flows-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source</th>
                  <th>Destination</th>
                  <th>Protocol</th>
                  <th>Bytes</th>
                  <th>Packets</th>
                </tr>
              </thead>
              <tbody>
                {flows.slice(-20).map((flow, index) => (
                  <tr key={index}>
                    <td>{formatTimestamp(flow.TimeReceived || Date.now() / 1000)}</td>
                    <td>{flow.SrcIP || flow.srcIP || 'N/A'}</td>
                    <td>{flow.DstIP || flow.dstIP || 'N/A'}</td>
                    <td>{getProtocolName(flow.Protocol || flow.protocol)}</td>
                    <td>{formatBytes(flow.Bytes || flow.bytes)}</td>
                    <td>{flow.Packets || flow.packets || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {flows.length === 0 && (
              <div className="no-data">
                <p>No NetFlow data available</p>
                <small>
                  Ensure GoFlow2 collector is running and receiving flow data
                </small>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetFlow;
