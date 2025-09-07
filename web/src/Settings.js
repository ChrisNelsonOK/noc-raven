import React, { useState, useEffect } from 'react';

// Settings Component with Telemetry Configuration
// Updated: 2025-09-06T21:53:31Z - Added Windows Events tab and fixed service restarts
const Settings = ({ initialTab }) => {
  const [config, setConfig] = useState({
    collection: {
      syslog: {
        enabled: true,
        port: 514,
        protocol: 'UDP',
        bindAddress: '0.0.0.0'
      },
      netflow: {
        enabled: true,
        port: 2055,
        protocol: 'UDP',
        bindAddress: '0.0.0.0'
      },
      snmp: {
        enabled: true,
        port: 161,
        protocol: 'UDP',
        bindAddress: '0.0.0.0',
        pollInterval: 300
      },
      sflow: {
        enabled: true,
        port: 6343,
        protocol: 'UDP',
        bindAddress: '0.0.0.0',
        sampleRate: 1000,
        agentAddress: '0.0.0.0'
      },
      telegraf: {
        enabled: true,
        port: 8125,
        protocol: 'UDP',
        bindAddress: '0.0.0.0'
      },
      windows: {
        enabled: false,
        port: 8085,
        protocol: 'HTTP',
        bindAddress: '0.0.0.0',
        format: 'json',
        bufferSize: 10
      }
    },
    forwarding: {
      syslog: {
        enabled: false,
        targetHost: '',
        targetPort: 514,
        protocol: 'UDP',
        format: 'RFC3164'
      },
      netflow: {
        enabled: false,
        targetHost: '',
        targetPort: 2055,
        protocol: 'UDP',
        version: 'v9'
      },
      snmp: {
        enabled: false,
        targetHost: '',
        targetPort: 162,
        protocol: 'UDP',
        community: 'public'
      },
      metrics: {
        enabled: false,
        targetHost: '',
        targetPort: 9090,
        protocol: 'HTTP',
        endpoint: '/api/v1/write'
      }
    },
    alerts: {
      cpuThreshold: 85,
      memoryThreshold: 90,
      diskThreshold: 80,
      networkThreshold: 95,
      emailEnabled: false,
      emailServer: '',
      emailPort: 587,
      emailUsername: '',
      emailPassword: '',
      emailRecipients: ''
    },
    retention: {
      netflowDays: 30,
      syslogDays: 90,
      metricsDays: 365,
      snmpDays: 180
    },
    performance: {
      maxConcurrentFlows: 10000,
      bufferSize: '64MB',
      compressionEnabled: true,
      indexingEnabled: true
    }
  });

  const [activeTab, setActiveTab] = useState(initialTab || 'collection');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Load configuration on component mount
  useEffect(() => {
    console.log('Loading NoC Raven configuration with Windows Events support');
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const data = await response.json();
        setConfig(prevConfig => ({ ...prevConfig, ...data }));
      }
    } catch (error) {
      console.error('Failed to load configuration:', error);
    }
  };

  const saveConfiguration = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        const result = await response.json();
        setSaveStatus(`✓ ${result.message || 'Configuration saved successfully'}`);
        setTimeout(() => setSaveStatus(''), 5000);
      } else if (response.status === 405) {
        setSaveStatus('⚠️ Configuration API not fully implemented - changes saved to browser only');
        setTimeout(() => setSaveStatus(''), 8000);
      } else {
        setSaveStatus('✗ Failed to save configuration');
        setTimeout(() => setSaveStatus(''), 5000);
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      setSaveStatus('⚠️ Backend configuration API unavailable - changes are temporary');
      setTimeout(() => setSaveStatus(''), 8000);
    }
    setSaving(false);
  };

  const restartService = async (serviceName) => {
    try {
      const response = await fetch(`/api/services/${serviceName}/restart`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setSaveStatus(`✓ ${serviceName} restarted successfully`);
        setTimeout(() => setSaveStatus(''), 3000);
      } else {
        setSaveStatus(`✗ Failed to restart ${serviceName}`);
      }
    } catch (error) {
      setSaveStatus(`✗ Error restarting ${serviceName}`);
    }
  };

  const updateConfig = (section, subsection, field, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [subsection]: {
          ...prev[section][subsection],
          [field]: value
        }
      }
    }));
  };

  const updateSimpleConfig = (section, field, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const tabs = [
    { id: 'collection', label: 'Collection Ports', icon: '📥' },
    { id: 'forwarding', label: 'Data Forwarding', icon: '📤' },
    { id: 'windows', label: 'Windows Events', icon: '🪟' },
    { id: 'alerts', label: 'Alerts & Notifications', icon: '🚨' },
    { id: 'retention', label: 'Data Retention', icon: '🗄️' },
    { id: 'performance', label: 'Performance', icon: '⚡' }
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1>⚙️ NoC Raven Configuration</h1>
        <p>Configure telemetry collection, forwarding, and system settings</p>
      </div>

      {/* Configuration Tabs */}
      <div className="config-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`config-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="config-content">
        {/* Collection Configuration */}
        {activeTab === 'collection' && (
          <div className="config-section">
            <h2>📥 Telemetry Collection Ports</h2>
            <p>Configure ports and protocols for collecting telemetry data from network devices</p>
            
            <div className="service-configs">
              {/* Syslog Configuration */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>📋 Syslog Collection</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.collection.syslog.enabled}
                      onChange={(e) => updateConfig('collection', 'syslog', 'enabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Listen Port</label>
                    <input
                      type="number"
                      value={config.collection.syslog.port}
                      onChange={(e) => updateConfig('collection', 'syslog', 'port', parseInt(e.target.value))}
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div className="config-field">
                    <label>Protocol</label>
                    <select
                      value={config.collection.syslog.protocol}
                      onChange={(e) => updateConfig('collection', 'syslog', 'protocol', e.target.value)}
                    >
                      <option value="UDP">UDP</option>
                      <option value="TCP">TCP</option>
                      <option value="TLS">TLS</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label>Bind Address</label>
                    <input
                      type="text"
                      value={config.collection.syslog.bindAddress}
                      onChange={(e) => updateConfig('collection', 'syslog', 'bindAddress', e.target.value)}
                      placeholder="0.0.0.0 (all interfaces)"
                    />
                  </div>
                </div>
                <button 
                  className="restart-btn" 
                  onClick={() => restartService('fluent-bit')}
                >
                  🔄 Restart Syslog Service
                </button>
              </div>

              {/* NetFlow Configuration */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>🌐 NetFlow Collection</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.collection.netflow.enabled}
                      onChange={(e) => updateConfig('collection', 'netflow', 'enabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Listen Port</label>
                    <input
                      type="number"
                      value={config.collection.netflow.port}
                      onChange={(e) => updateConfig('collection', 'netflow', 'port', parseInt(e.target.value))}
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div className="config-field">
                    <label>Protocol</label>
                    <select
                      value={config.collection.netflow.protocol}
                      onChange={(e) => updateConfig('collection', 'netflow', 'protocol', e.target.value)}
                    >
                      <option value="UDP">UDP</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label>Bind Address</label>
                    <input
                      type="text"
                      value={config.collection.netflow.bindAddress}
                      onChange={(e) => updateConfig('collection', 'netflow', 'bindAddress', e.target.value)}
                      placeholder="0.0.0.0 (all interfaces)"
                    />
                  </div>
                </div>
                <button 
                  className="restart-btn" 
                  onClick={() => restartService('goflow2')}
                >
                  🔄 Restart NetFlow Service
                </button>
              </div>

              {/* SNMP Configuration */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>🔌 SNMP Monitoring</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.collection.snmp.enabled}
                      onChange={(e) => updateConfig('collection', 'snmp', 'enabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Listen Port</label>
                    <input
                      type="number"
                      value={config.collection.snmp.port}
                      onChange={(e) => updateConfig('collection', 'snmp', 'port', parseInt(e.target.value))}
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div className="config-field">
                    <label>Poll Interval (seconds)</label>
                    <input
                      type="number"
                      value={config.collection.snmp.pollInterval}
                      onChange={(e) => updateConfig('collection', 'snmp', 'pollInterval', parseInt(e.target.value))}
                      min="30"
                      max="3600"
                    />
                  </div>
                  <div className="config-field">
                    <label>Bind Address</label>
                    <input
                      type="text"
                      value={config.collection.snmp.bindAddress}
                      onChange={(e) => updateConfig('collection', 'snmp', 'bindAddress', e.target.value)}
                      placeholder="0.0.0.0 (all interfaces)"
                    />
                  </div>
                </div>
                <button 
                  className="restart-btn" 
                  onClick={() => restartService('telegraf')}
                >
                  🔄 Restart SNMP Service
                </button>
              </div>

              {/* sFlow Configuration */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>🌊 sFlow Collection</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.collection.sflow?.enabled || false}
                      onChange={(e) => updateConfig('collection', 'sflow', 'enabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Listen Port</label>
                    <input
                      type="number"
                      value={config.collection.sflow?.port || 6343}
                      onChange={(e) => updateConfig('collection', 'sflow', 'port', parseInt(e.target.value))}
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div className="config-field">
                    <label>Protocol</label>
                    <select
                      value={config.collection.sflow?.protocol || 'UDP'}
                      onChange={(e) => updateConfig('collection', 'sflow', 'protocol', e.target.value)}
                    >
                      <option value="UDP">UDP</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label>Sample Rate</label>
                    <input
                      type="number"
                      value={config.collection.sflow?.sampleRate || 1000}
                      onChange={(e) => updateConfig('collection', 'sflow', 'sampleRate', parseInt(e.target.value))}
                      min="100"
                      max="10000"
                      step="100"
                    />
                  </div>
                  <div className="config-field">
                    <label>Agent Address</label>
                    <input
                      type="text"
                      value={config.collection.sflow?.agentAddress || '0.0.0.0'}
                      onChange={(e) => updateConfig('collection', 'sflow', 'agentAddress', e.target.value)}
                      placeholder="0.0.0.0 (auto-detect)"
                    />
                  </div>
                  <div className="config-field">
                    <label>Bind Address</label>
                    <input
                      type="text"
                      value={config.collection.sflow?.bindAddress || '0.0.0.0'}
                      onChange={(e) => updateConfig('collection', 'sflow', 'bindAddress', e.target.value)}
                      placeholder="0.0.0.0 (all interfaces)"
                    />
                  </div>
                </div>
                <button 
                  className="restart-btn" 
                  onClick={() => restartService('goflow2')}
                >
                  🔄 Restart sFlow Service
                </button>
              </div>

              {/* Windows Events Configuration */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>🪟 Windows Events Collection</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.collection.windows?.enabled || false}
                      onChange={(e) => updateConfig('collection', 'windows', 'enabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Listen Port</label>
                    <input
                      type="number"
                      value={config.collection.windows?.port || 8085}
                      onChange={(e) => updateConfig('collection', 'windows', 'port', parseInt(e.target.value))}
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div className="config-field">
                    <label>Protocol</label>
                    <select
                      value={config.collection.windows?.protocol || 'HTTP'}
                      onChange={(e) => updateConfig('collection', 'windows', 'protocol', e.target.value)}
                    >
                      <option value="HTTP">HTTP</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label>Input Format</label>
                    <select
                      value={config.collection.windows?.format || 'json'}
                      onChange={(e) => updateConfig('collection', 'windows', 'format', e.target.value)}
                    >
                      <option value="json">JSON</option>
                      <option value="xml">XML</option>
                      <option value="text">Plain Text</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label>Buffer Size (MB)</label>
                    <input
                      type="number"
                      value={config.collection.windows?.bufferSize || 10}
                      onChange={(e) => updateConfig('collection', 'windows', 'bufferSize', parseInt(e.target.value))}
                      min="1"
                      max="1000"
                      step="1"
                    />
                  </div>
                  <div className="config-field">
                    <label>Bind Address</label>
                    <input
                      type="text"
                      value={config.collection.windows?.bindAddress || '0.0.0.0'}
                      onChange={(e) => updateConfig('collection', 'windows', 'bindAddress', e.target.value)}
                      placeholder="0.0.0.0 (all interfaces)"
                    />
                  </div>
                </div>
                <button 
                  className="restart-btn" 
                  onClick={() => restartService('fluent-bit')}
                >
                  🔄 Restart Windows Events Service
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Forwarding Configuration */}
        {activeTab === 'forwarding' && (
          <div className="config-section">
            <h2>📤 Data Forwarding Configuration</h2>
            <p>Configure forwarding of collected telemetry to remote systems</p>
            
            <div className="service-configs">
              {/* Syslog Forwarding */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>📋 Syslog Forwarding</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.forwarding.syslog?.enabled || false}
                      onChange={(e) => updateConfig('forwarding', 'syslog', 'enabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Target Host/IP</label>
                    <input
                      type="text"
                      value={config.forwarding.syslog?.targetHost || ''}
                      onChange={(e) => updateConfig('forwarding', 'syslog', 'targetHost', e.target.value)}
                      placeholder="192.168.1.100 or syslog.company.com"
                    />
                  </div>
                  <div className="config-field">
                    <label>Target Port</label>
                    <input
                      type="number"
                      value={config.forwarding.syslog?.targetPort || 514}
                      onChange={(e) => updateConfig('forwarding', 'syslog', 'targetPort', parseInt(e.target.value))}
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div className="config-field">
                    <label>Protocol</label>
                    <select
                      value={config.forwarding.syslog?.protocol || 'UDP'}
                      onChange={(e) => updateConfig('forwarding', 'syslog', 'protocol', e.target.value)}
                    >
                      <option value="UDP">UDP</option>
                      <option value="TCP">TCP</option>
                      <option value="TLS">TLS</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label>Message Format</label>
                    <select
                      value={config.forwarding.syslog?.format || 'RFC3164'}
                      onChange={(e) => updateConfig('forwarding', 'syslog', 'format', e.target.value)}
                    >
                      <option value="RFC3164">RFC3164 (Legacy)</option>
                      <option value="RFC5424">RFC5424 (Modern)</option>
                      <option value="JSON">JSON</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* NetFlow Forwarding */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>🌐 NetFlow Forwarding</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.forwarding.netflow?.enabled || false}
                      onChange={(e) => updateConfig('forwarding', 'netflow', 'enabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Target Host/IP</label>
                    <input
                      type="text"
                      value={config.forwarding.netflow?.targetHost || ''}
                      onChange={(e) => updateConfig('forwarding', 'netflow', 'targetHost', e.target.value)}
                      placeholder="192.168.1.100 or collector.company.com"
                    />
                  </div>
                  <div className="config-field">
                    <label>Target Port</label>
                    <input
                      type="number"
                      value={config.forwarding.netflow?.targetPort || 2055}
                      onChange={(e) => updateConfig('forwarding', 'netflow', 'targetPort', parseInt(e.target.value))}
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div className="config-field">
                    <label>NetFlow Version</label>
                    <select
                      value={config.forwarding.netflow?.version || 'v9'}
                      onChange={(e) => updateConfig('forwarding', 'netflow', 'version', e.target.value)}
                    >
                      <option value="v5">NetFlow v5</option>
                      <option value="v9">NetFlow v9</option>
                      <option value="ipfix">IPFIX</option>
                      <option value="sflow">sFlow</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Metrics Forwarding (for PRTG integration) */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>📊 Metrics Forwarding (PRTG/Prometheus)</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.forwarding.metrics?.enabled || false}
                      onChange={(e) => updateConfig('forwarding', 'metrics', 'enabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Target Host/IP</label>
                    <input
                      type="text"
                      value={config.forwarding.metrics?.targetHost || ''}
                      onChange={(e) => updateConfig('forwarding', 'metrics', 'targetHost', e.target.value)}
                      placeholder="prtg.company.com or prometheus.local"
                    />
                  </div>
                  <div className="config-field">
                    <label>Target Port</label>
                    <input
                      type="number"
                      value={config.forwarding.metrics?.targetPort || 8080}
                      onChange={(e) => updateConfig('forwarding', 'metrics', 'targetPort', parseInt(e.target.value))}
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div className="config-field">
                    <label>Protocol</label>
                    <select
                      value={config.forwarding.metrics?.protocol || 'HTTP'}
                      onChange={(e) => updateConfig('forwarding', 'metrics', 'protocol', e.target.value)}
                    >
                      <option value="HTTP">HTTP</option>
                      <option value="HTTPS">HTTPS</option>
                      <option value="UDP">UDP</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label>API Endpoint</label>
                    <input
                      type="text"
                      value={config.forwarding.metrics?.endpoint || ''}
                      onChange={(e) => updateConfig('forwarding', 'metrics', 'endpoint', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* SNMP Forwarding */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>🔗 SNMP Forwarding</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.forwarding.snmp?.enabled || false}
                      onChange={(e) => updateConfig('forwarding', 'snmp', 'enabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Target Host/IP</label>
                    <input
                      type="text"
                      value={config.forwarding.snmp?.targetHost || ''}
                      onChange={(e) => updateConfig('forwarding', 'snmp', 'targetHost', e.target.value)}
                      placeholder="snmp.company.com or 192.168.1.100"
                    />
                  </div>
                  <div className="config-field">
                    <label>Target Port</label>
                    <input
                      type="number"
                      value={config.forwarding.snmp?.targetPort || 162}
                      onChange={(e) => updateConfig('forwarding', 'snmp', 'targetPort', parseInt(e.target.value))}
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div className="config-field">
                    <label>SNMP Version</label>
                    <select
                      value={config.forwarding.snmp?.version || 'v2c'}
                      onChange={(e) => updateConfig('forwarding', 'snmp', 'version', e.target.value)}
                    >
                      <option value="v1">SNMP v1</option>
                      <option value="v2c">SNMP v2c</option>
                      <option value="v3">SNMP v3</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label>Community String</label>
                    <input
                      type="text"
                      value={config.forwarding.snmp?.community || 'public'}
                      onChange={(e) => updateConfig('forwarding', 'snmp', 'community', e.target.value)}
                      placeholder="public"
                    />
                  </div>
                  {config.forwarding.snmp?.version === 'v3' && (
                    <>
                      <div className="config-field">
                        <label>Username</label>
                        <input
                          type="text"
                          value={config.forwarding.snmp?.username || ''}
                          onChange={(e) => updateConfig('forwarding', 'snmp', 'username', e.target.value)}
                          placeholder="snmpuser"
                        />
                      </div>
                      <div className="config-field">
                        <label>Auth Protocol</label>
                        <select
                          value={config.forwarding.snmp?.authProtocol || 'SHA'}
                          onChange={(e) => updateConfig('forwarding', 'snmp', 'authProtocol', e.target.value)}
                        >
                          <option value="MD5">MD5</option>
                          <option value="SHA">SHA</option>
                          <option value="SHA224">SHA224</option>
                          <option value="SHA256">SHA256</option>
                        </select>
                      </div>
                      <div className="config-field">
                        <label>Auth Password</label>
                        <input
                          type="password"
                          value={config.forwarding.snmp?.authPassword || ''}
                          onChange={(e) => updateConfig('forwarding', 'snmp', 'authPassword', e.target.value)}
                          placeholder="Authentication password"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* sFlow Forwarding */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>🌊 sFlow Forwarding</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.forwarding.sflow?.enabled || false}
                      onChange={(e) => updateConfig('forwarding', 'sflow', 'enabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Target Host/IP</label>
                    <input
                      type="text"
                      value={config.forwarding.sflow?.targetHost || ''}
                      onChange={(e) => updateConfig('forwarding', 'sflow', 'targetHost', e.target.value)}
                      placeholder="sflow.company.com or 192.168.1.100"
                    />
                  </div>
                  <div className="config-field">
                    <label>Target Port</label>
                    <input
                      type="number"
                      value={config.forwarding.sflow?.targetPort || 6343}
                      onChange={(e) => updateConfig('forwarding', 'sflow', 'targetPort', parseInt(e.target.value))}
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div className="config-field">
                    <label>Sample Rate</label>
                    <input
                      type="number"
                      value={config.forwarding.sflow?.sampleRate || 1000}
                      onChange={(e) => updateConfig('forwarding', 'sflow', 'sampleRate', parseInt(e.target.value))}
                      min="1"
                      max="1000000"
                      placeholder="1000"
                    />
                  </div>
                  <div className="config-field">
                    <label>Agent Address</label>
                    <input
                      type="text"
                      value={config.forwarding.sflow?.agentAddress || ''}
                      onChange={(e) => updateConfig('forwarding', 'sflow', 'agentAddress', e.target.value)}
                      placeholder="192.168.1.50 (collector IP)"
                    />
                  </div>
                  <div className="config-field">
                    <label>sFlow Version</label>
                    <select
                      value={config.forwarding.sflow?.version || '5'}
                      onChange={(e) => updateConfig('forwarding', 'sflow', 'version', e.target.value)}
                    >
                      <option value="4">sFlow v4</option>
                      <option value="5">sFlow v5</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Windows Events Forwarding */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>🪟 Windows Events Forwarding</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.forwarding.windows?.enabled || false}
                      onChange={(e) => updateConfig('forwarding', 'windows', 'enabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Target Host/IP</label>
                    <input
                      type="text"
                      value={config.forwarding.windows?.targetHost || ''}
                      onChange={(e) => updateConfig('forwarding', 'windows', 'targetHost', e.target.value)}
                      placeholder="events.company.com or 192.168.1.100"
                    />
                  </div>
                  <div className="config-field">
                    <label>Target Port</label>
                    <input
                      type="number"
                      value={config.forwarding.windows?.targetPort || 8085}
                      onChange={(e) => updateConfig('forwarding', 'windows', 'targetPort', parseInt(e.target.value))}
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div className="config-field">
                    <label>Input Format</label>
                    <select
                      value={config.forwarding.windows?.format || 'http'}
                      onChange={(e) => updateConfig('forwarding', 'windows', 'format', e.target.value)}
                    >
                      <option value="http">HTTP JSON</option>
                      <option value="syslog">Syslog</option>
                      <option value="winlogbeat">Winlogbeat</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label>Event Log Channels</label>
                    <input
                      type="text"
                      value={config.forwarding.windows?.channels || 'System,Security,Application'}
                      onChange={(e) => updateConfig('forwarding', 'windows', 'channels', e.target.value)}
                      placeholder="System,Security,Application"
                    />
                  </div>
                  <div className="config-field">
                    <label>Buffer Size (MB)</label>
                    <input
                      type="number"
                      value={config.forwarding.windows?.bufferSize || 10}
                      onChange={(e) => updateConfig('forwarding', 'windows', 'bufferSize', parseInt(e.target.value))}
                      min="1"
                      max="1000"
                      placeholder="10"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Windows Events Configuration */}
        {activeTab === 'windows' && (
          <div className="config-section">
            <h2>🪟 Windows Events Configuration</h2>
            <p>Configure Windows Event Log collection and processing settings</p>
            
            <div className="service-configs">
              {/* Collection Settings */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>📥 Event Collection</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.collection.windows?.enabled || false}
                      onChange={(e) => updateConfig('collection', 'windows', 'enabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Collection Port</label>
                    <input
                      type="number"
                      value={config.collection.windows?.port || 8085}
                      onChange={(e) => updateConfig('collection', 'windows', 'port', parseInt(e.target.value))}
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div className="config-field">
                    <label>Input Protocol</label>
                    <select
                      value={config.collection.windows?.protocol || 'HTTP'}
                      onChange={(e) => updateConfig('collection', 'windows', 'protocol', e.target.value)}
                    >
                      <option value="HTTP">HTTP</option>
                      <option value="HTTPS">HTTPS</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label>Event Format</label>
                    <select
                      value={config.collection.windows?.format || 'json'}
                      onChange={(e) => updateConfig('collection', 'windows', 'format', e.target.value)}
                    >
                      <option value="json">JSON</option>
                      <option value="xml">XML</option>
                      <option value="text">Plain Text</option>
                      <option value="evtx">Windows EVTX</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label>Buffer Size (MB)</label>
                    <input
                      type="number"
                      value={config.collection.windows?.bufferSize || 10}
                      onChange={(e) => updateConfig('collection', 'windows', 'bufferSize', parseInt(e.target.value))}
                      min="1"
                      max="1000"
                    />
                  </div>
                  <div className="config-field">
                    <label>Bind Address</label>
                    <input
                      type="text"
                      value={config.collection.windows?.bindAddress || '0.0.0.0'}
                      onChange={(e) => updateConfig('collection', 'windows', 'bindAddress', e.target.value)}
                      placeholder="0.0.0.0 (all interfaces)"
                    />
                  </div>
                  <div className="config-field">
                    <label>Max Connections</label>
                    <input
                      type="number"
                      value={config.collection.windows?.maxConnections || 100}
                      onChange={(e) => updateConfig('collection', 'windows', 'maxConnections', parseInt(e.target.value))}
                      min="1"
                      max="1000"
                    />
                  </div>
                </div>
                <button 
                  className="restart-btn" 
                  onClick={() => restartService('fluent-bit')}
                >
                  🔄 Restart Collection Service
                </button>
              </div>

              {/* Event Log Channels */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>📂 Event Log Channels</h3>
                </div>
                <div className="config-grid">
                  <div className="config-field span-2">
                    <label>Event Log Channels (comma-separated)</label>
                    <textarea
                      value={config.collection.windows?.channels || 'System,Security,Application'}
                      onChange={(e) => updateConfig('collection', 'windows', 'channels', e.target.value)}
                      placeholder="System,Security,Application,Setup,Microsoft-Windows-Sysmon/Operational"
                      rows="3"
                    />
                  </div>
                  <div className="config-field">
                    <label>Event Level Filter</label>
                    <select
                      value={config.collection.windows?.eventLevel || 'all'}
                      onChange={(e) => updateConfig('collection', 'windows', 'eventLevel', e.target.value)}
                    >
                      <option value="all">All Events</option>
                      <option value="critical">Critical Only</option>
                      <option value="error">Error & Above</option>
                      <option value="warning">Warning & Above</option>
                      <option value="info">Information & Above</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label>Max Events per Batch</label>
                    <input
                      type="number"
                      value={config.collection.windows?.batchSize || 1000}
                      onChange={(e) => updateConfig('collection', 'windows', 'batchSize', parseInt(e.target.value))}
                      min="10"
                      max="10000"
                    />
                  </div>
                </div>
              </div>

              {/* Forwarding Settings */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>📤 Event Forwarding</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.forwarding.windows?.enabled || false}
                      onChange={(e) => updateConfig('forwarding', 'windows', 'enabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Target Host/IP</label>
                    <input
                      type="text"
                      value={config.forwarding.windows?.targetHost || ''}
                      onChange={(e) => updateConfig('forwarding', 'windows', 'targetHost', e.target.value)}
                      placeholder="events.company.com or 192.168.1.100"
                    />
                  </div>
                  <div className="config-field">
                    <label>Target Port</label>
                    <input
                      type="number"
                      value={config.forwarding.windows?.targetPort || 8085}
                      onChange={(e) => updateConfig('forwarding', 'windows', 'targetPort', parseInt(e.target.value))}
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div className="config-field">
                    <label>Output Format</label>
                    <select
                      value={config.forwarding.windows?.format || 'http'}
                      onChange={(e) => updateConfig('forwarding', 'windows', 'format', e.target.value)}
                    >
                      <option value="http">HTTP JSON</option>
                      <option value="syslog">Syslog</option>
                      <option value="tcp">TCP JSON</option>
                      <option value="udp">UDP JSON</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label>Compression</label>
                    <select
                      value={config.forwarding.windows?.compression || 'none'}
                      onChange={(e) => updateConfig('forwarding', 'windows', 'compression', e.target.value)}
                    >
                      <option value="none">None</option>
                      <option value="gzip">GZIP</option>
                      <option value="lz4">LZ4</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label>Forward Buffer (MB)</label>
                    <input
                      type="number"
                      value={config.forwarding.windows?.bufferSize || 10}
                      onChange={(e) => updateConfig('forwarding', 'windows', 'bufferSize', parseInt(e.target.value))}
                      min="1"
                      max="1000"
                    />
                  </div>
                  <div className="config-field">
                    <label>Retry Attempts</label>
                    <input
                      type="number"
                      value={config.forwarding.windows?.retryAttempts || 3}
                      onChange={(e) => updateConfig('forwarding', 'windows', 'retryAttempts', parseInt(e.target.value))}
                      min="0"
                      max="10"
                    />
                  </div>
                </div>
              </div>

              {/* Advanced Settings */}
              <div className="service-config-card">
                <div className="service-header">
                  <h3>⚙️ Advanced Settings</h3>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Authentication Required</label>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={config.collection.windows?.authRequired || false}
                        onChange={(e) => updateConfig('collection', 'windows', 'authRequired', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="config-field">
                    <label>Rate Limiting (events/sec)</label>
                    <input
                      type="number"
                      value={config.collection.windows?.rateLimit || 1000}
                      onChange={(e) => updateConfig('collection', 'windows', 'rateLimit', parseInt(e.target.value))}
                      min="10"
                      max="10000"
                    />
                  </div>
                  <div className="config-field">
                    <label>Enable Debugging</label>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={config.collection.windows?.debug || false}
                        onChange={(e) => updateConfig('collection', 'windows', 'debug', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="config-field">
                    <label>Log Rotation Size (MB)</label>
                    <input
                      type="number"
                      value={config.collection.windows?.logRotationSize || 100}
                      onChange={(e) => updateConfig('collection', 'windows', 'logRotationSize', parseInt(e.target.value))}
                      min="10"
                      max="1000"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Alerts Configuration */}
        {activeTab === 'alerts' && (
          <div className="config-section">
            <h2>🚨 Alerts & Notifications</h2>
            <p>Configure system monitoring thresholds and notification settings</p>
            
            <div className="alert-configs">
              <div className="alert-thresholds">
                <h3>System Alert Thresholds</h3>
                <div className="config-grid">
                  <div className="config-field">
                    <label>CPU Usage Alert (%)</label>
                    <input
                      type="number"
                      value={config.alerts?.cpuThreshold || 80}
                      onChange={(e) => updateSimpleConfig('alerts', 'cpuThreshold', parseInt(e.target.value))}
                      min="0"
                      max="100"
                    />
                  </div>
                  <div className="config-field">
                    <label>Memory Usage Alert (%)</label>
                    <input
                      type="number"
                      value={config.alerts?.memoryThreshold || 85}
                      onChange={(e) => updateSimpleConfig('alerts', 'memoryThreshold', parseInt(e.target.value))}
                      min="0"
                      max="100"
                    />
                  </div>
                  <div className="config-field">
                    <label>Disk Usage Alert (%)</label>
                    <input
                      type="number"
                      value={config.alerts?.diskThreshold || 90}
                      onChange={(e) => updateSimpleConfig('alerts', 'diskThreshold', parseInt(e.target.value))}
                      min="0"
                      max="100"
                    />
                  </div>
                  <div className="config-field">
                    <label>Network Usage Alert (%)</label>
                    <input
                      type="number"
                      value={config.alerts?.networkThreshold || 95}
                      onChange={(e) => updateSimpleConfig('alerts', 'networkThreshold', parseInt(e.target.value))}
                      min="0"
                      max="100"
                    />
                  </div>
                </div>
              </div>

              <div className="email-config">
                <div className="service-header">
                  <h3>📧 Email Notifications</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.alerts?.emailEnabled || false}
                      onChange={(e) => updateSimpleConfig('alerts', 'emailEnabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>SMTP Server</label>
                    <input
                      type="text"
                      value={config.alerts?.emailServer || ''}
                      onChange={(e) => updateSimpleConfig('alerts', 'emailServer', e.target.value)}
                      placeholder="smtp.gmail.com"
                    />
                  </div>
                  <div className="config-field">
                    <label>SMTP Port</label>
                    <input
                      type="number"
                      value={config.alerts?.emailPort || 587}
                      onChange={(e) => updateSimpleConfig('alerts', 'emailPort', parseInt(e.target.value))}
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div className="config-field">
                    <label>Username</label>
                    <input
                      type="text"
                      value={config.alerts?.emailUsername || ''}
                      onChange={(e) => updateSimpleConfig('alerts', 'emailUsername', e.target.value)}
                      placeholder="noc@company.com"
                    />
                  </div>
                  <div className="config-field">
                    <label>Recipients (comma-separated)</label>
                    <input
                      type="text"
                      value={config.alerts?.emailRecipients || ''}
                      onChange={(e) => updateSimpleConfig('alerts', 'emailRecipients', e.target.value)}
                      placeholder="admin@company.com, ops@company.com"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Data Retention */}
        {activeTab === 'retention' && (
          <div className="config-section">
            <h2>🗄️ Data Retention Settings</h2>
            <p>Configure how long different types of telemetry data are stored</p>
            
            <div className="retention-configs">
              <div className="config-grid">
                <div className="config-field">
                  <label>NetFlow Data Retention (days)</label>
                  <select
                    value={config.retention?.netflowDays || 30}
                    onChange={(e) => updateSimpleConfig('retention', 'netflowDays', parseInt(e.target.value))}
                  >
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={180}>180 days</option>
                    <option value={365}>1 year</option>
                  </select>
                </div>
                <div className="config-field">
                  <label>Syslog Data Retention (days)</label>
                  <select
                    value={config.retention?.syslogDays || 30}
                    onChange={(e) => updateSimpleConfig('retention', 'syslogDays', parseInt(e.target.value))}
                  >
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={180}>180 days</option>
                    <option value={365}>1 year</option>
                  </select>
                </div>
                <div className="config-field">
                  <label>Metrics Data Retention (days)</label>
                  <select
                    value={config.retention?.metricsDays || 90}
                    onChange={(e) => updateSimpleConfig('retention', 'metricsDays', parseInt(e.target.value))}
                  >
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={180}>180 days</option>
                    <option value={365}>1 year</option>
                    <option value={730}>2 years</option>
                  </select>
                </div>
                <div className="config-field">
                  <label>SNMP Data Retention (days)</label>
                  <select
                    value={config.retention?.snmpDays || 90}
                    onChange={(e) => updateSimpleConfig('retention', 'snmpDays', parseInt(e.target.value))}
                  >
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={180}>180 days</option>
                    <option value={365}>1 year</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Performance Settings */}
        {activeTab === 'performance' && (
          <div className="config-section">
            <h2>⚡ Performance Tuning</h2>
            <p>Optimize system performance for your environment</p>
            
            <div className="performance-configs">
              <div className="config-grid">
                <div className="config-field">
                  <label>Max Concurrent Flows</label>
                  <input
                    type="number"
                    value={config.performance?.maxConcurrentFlows || 10000}
                    onChange={(e) => updateSimpleConfig('performance', 'maxConcurrentFlows', parseInt(e.target.value))}
                    min="1000"
                    max="100000"
                    step="1000"
                  />
                </div>
                <div className="config-field">
                  <label>Buffer Size</label>
                  <select
                    value={config.performance?.bufferSize || '64MB'}
                    onChange={(e) => updateSimpleConfig('performance', 'bufferSize', e.target.value)}
                  >
                    <option value="32MB">32MB</option>
                    <option value="64MB">64MB</option>
                    <option value="128MB">128MB</option>
                    <option value="256MB">256MB</option>
                  </select>
                </div>
                <div className="config-field">
                  <label>Enable Compression</label>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.performance?.compressionEnabled || true}
                      onChange={(e) => updateSimpleConfig('performance', 'compressionEnabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="config-field">
                  <label>Enable Indexing</label>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.performance?.indexingEnabled || true}
                      onChange={(e) => updateSimpleConfig('performance', 'indexingEnabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save Configuration */}
      <div className="config-actions">
        <div className="save-status">
          {saveStatus && <span className="status-message">{saveStatus}</span>}
        </div>
        <div className="action-buttons">
          <button 
            className="btn-secondary" 
            onClick={loadConfiguration}
            disabled={saving}
          >
            🔄 Reload Configuration
          </button>
          <button 
            className="btn-primary" 
            onClick={saveConfiguration}
            disabled={saving}
          >
            {saving ? '⏳ Saving...' : '💾 Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
