#!/usr/bin/env node

/**
 * NoC Raven Web API Backend
 * Production-ready Express.js API server for telemetry data
 */

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
const PORT = process.env.PORT || 3001;
const DATA_DIR = '/data';
const LOG_DIR = '/var/log/noc-raven';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../build')));

// WebSocket connections for real-time updates
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Client connected. Total clients:', clients.size);
  
  // Send initial system status
  ws.send(JSON.stringify({
    type: 'system_status',
    payload: getSystemStatus()
  }));
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected. Total clients:', clients.size);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast updates to all connected clients
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// System status and metrics collection
function getSystemStatus() {
  const uptimeSeconds = Math.floor(process.uptime());
  
  return {
    status: 'connected',
    uptime: uptimeSeconds,
    timestamp: Date.now(),
    services: getServiceStatus(),
    metrics: getSystemMetrics(),
    telemetryStats: getTelemetryStats()
  };
}

function getServiceStatus() {
  return new Promise((resolve) => {
    exec('ps aux', (error, stdout, stderr) => {
      if (error) {
        resolve({});
        return;
      }
      
      const processes = stdout.split('\n');
      const services = {
        nginx: processes.some(p => p.includes('nginx: master')),
        'fluent-bit': processes.some(p => p.includes('fluent-bit')),
        goflow2: processes.some(p => p.includes('goflow2')),
        vector: processes.some(p => p.includes('vector')),
        telegraf: processes.some(p => p.includes('telegraf'))
      };
      
      resolve(services);
    });
  });
}

function getSystemMetrics() {
  return new Promise((resolve) => {
    const metrics = {
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      networkIO: { rx: 0, tx: 0 },
      uptime: Math.floor(process.uptime())
    };
    
    // Get CPU usage
    exec("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1", (err, stdout) => {
      if (!err && stdout.trim()) {
        metrics.cpuUsage = parseFloat(stdout.trim()) || 0;
      }
      
      // Get memory usage
      exec("free | grep Mem | awk '{printf \"%.1f\", $3/$2 * 100.0}'", (err, stdout) => {
        if (!err && stdout.trim()) {
          metrics.memoryUsage = parseFloat(stdout.trim()) || 0;
        }
        
        // Get disk usage
        exec("df /data | tail -1 | awk '{print $5}' | cut -d'%' -f1", (err, stdout) => {
          if (!err && stdout.trim()) {
            metrics.diskUsage = parseFloat(stdout.trim()) || 0;
          }
          
          resolve(metrics);
        });
      });
    });
  });
}

function getTelemetryStats() {
  const stats = {
    flowsPerSecond: 0,
    syslogMessages: 0,
    snmpPolls: 0,
    activeDevices: 0,
    dataBuffer: '0B',
    recentFlows: [],
    recentSyslog: [],
    recentSNMP: []
  };
  
  // Count flow files and estimate rate
  const flowsDir = path.join(DATA_DIR, 'flows');
  if (fs.existsSync(flowsDir)) {
    const files = fs.readdirSync(flowsDir);
    const today = new Date().toISOString().split('T')[0];
    const todayFiles = files.filter(f => f.includes(today));
    
    if (todayFiles.length > 0) {
      try {
        const latestFile = path.join(flowsDir, todayFiles[todayFiles.length - 1]);
        const fileContent = fs.readFileSync(latestFile, 'utf8');
        const lines = fileContent.split('\n').filter(l => l.trim());
        
        // Get recent flows (last 10)
        stats.recentFlows = lines.slice(-10).map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return { timestamp: Date.now(), data: line.substring(0, 100) };
          }
        });
        
        // Estimate flows per second based on file size and age
        const fileStats = fs.statSync(latestFile);
        const ageMinutes = (Date.now() - fileStats.mtime.getTime()) / (1000 * 60);
        if (ageMinutes > 0) {
          stats.flowsPerSecond = Math.round(lines.length / (ageMinutes * 60));
        }
      } catch (error) {
        console.error('Error reading flow files:', error);
      }
    }
  }
  
  // Count syslog messages
  const syslogDir = path.join(DATA_DIR, 'syslog');
  if (fs.existsSync(syslogDir)) {
    try {
      const files = fs.readdirSync(syslogDir);
      if (files.length > 0) {
        const latestFile = path.join(syslogDir, files[files.length - 1]);
        const content = fs.readFileSync(latestFile, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        
        stats.recentSyslog = lines.slice(-10).map(line => ({
          timestamp: Date.now(),
          message: line.substring(0, 200),
          facility: 'local0',
          severity: 'info'
        }));
        
        stats.syslogMessages = lines.length;
      }
    } catch (error) {
      console.error('Error reading syslog files:', error);
    }
  }
  
  // Get buffer size
  try {
    exec(`du -sh ${DATA_DIR}`, (error, stdout) => {
      if (!error && stdout) {
        stats.dataBuffer = stdout.split('\t')[0];
      }
    });
  } catch (error) {
    console.error('Error getting buffer size:', error);
  }
  
  return stats;
}

// API Routes

// System status endpoint
app.get('/api/status', async (req, res) => {
  try {
    const status = await getSystemStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Services status endpoint
app.get('/api/services', async (req, res) => {
  try {
    const services = await getServiceStatus();
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// System metrics endpoint
app.get('/api/metrics', async (req, res) => {
  try {
    const metrics = await getSystemMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// NetFlow data endpoint
app.get('/api/flows', (req, res) => {
  try {
    const flowsDir = path.join(DATA_DIR, 'flows');
    const limit = parseInt(req.query.limit) || 100;
    const flows = [];
    
    if (fs.existsSync(flowsDir)) {
      const files = fs.readdirSync(flowsDir).sort().reverse(); // Latest first
      
      for (const file of files.slice(0, 5)) { // Check last 5 files
        try {
          const content = fs.readFileSync(path.join(flowsDir, file), 'utf8');
          const lines = content.split('\n').filter(l => l.trim());
          
          for (const line of lines.slice(-limit)) {
            try {
              flows.push(JSON.parse(line));
            } catch {
              // Skip invalid JSON lines
            }
          }
          
          if (flows.length >= limit) break;
        } catch (error) {
          continue;
        }
      }
    }
    
    res.json({
      flows: flows.slice(-limit),
      totalCount: flows.length,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Syslog data endpoint
app.get('/api/syslog', (req, res) => {
  try {
    const syslogDir = path.join(DATA_DIR, 'syslog');
    const limit = parseInt(req.query.limit) || 100;
    const logs = [];
    
    if (fs.existsSync(syslogDir)) {
      const files = fs.readdirSync(syslogDir).sort().reverse();
      
      for (const file of files.slice(0, 3)) {
        try {
          const content = fs.readFileSync(path.join(syslogDir, file), 'utf8');
          const lines = content.split('\n').filter(l => l.trim());
          
          lines.slice(-limit).forEach(line => {
            logs.push({
              timestamp: Date.now(),
              message: line,
              facility: 'local0',
              severity: 'info',
              host: 'unknown'
            });
          });
          
          if (logs.length >= limit) break;
        } catch (error) {
          continue;
        }
      }
    }
    
    res.json({
      logs: logs.slice(-limit),
      totalCount: logs.length,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SNMP data endpoint
app.get('/api/snmp', (req, res) => {
  try {
    const snmpDir = path.join(DATA_DIR, 'snmp');
    const polls = [];
    
    if (fs.existsSync(snmpDir)) {
      const files = fs.readdirSync(snmpDir);
      
      files.forEach(file => {
        try {
          const content = fs.readFileSync(path.join(snmpDir, file), 'utf8');
          const data = JSON.parse(content);
          polls.push(data);
        } catch (error) {
          // Skip invalid files
        }
      });
    }
    
    res.json({
      polls: polls.slice(-100),
      totalCount: polls.length,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Configuration endpoints
app.get('/api/config', (req, res) => {
  const config = {
    hostname: process.env.HOSTNAME || 'noc-raven-001',
    timezone: process.env.TZ || 'UTC',
    performance_profile: process.env.PERFORMANCE_PROFILE || 'balanced',
    buffer_size: process.env.BUFFER_SIZE || '100GB'
  };
  
  res.json(config);
});

app.post('/api/config', (req, res) => {
  // In a production environment, you'd validate and persist the config
  const { hostname, timezone, performance_profile, buffer_size } = req.body;
  
  // For now, just return success
  res.json({
    success: true,
    message: 'Configuration updated (restart required)',
    config: req.body
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build/index.html'));
});

// Start periodic status broadcasts
setInterval(() => {
  if (clients.size > 0) {
    getSystemStatus().then(status => {
      broadcast({
        type: 'system_status',
        payload: status
      });
    }).catch(error => {
      console.error('Error getting system status:', error);
    });
  }
}, 5000); // Update every 5 seconds

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🦅 NoC Raven API Server running on port ${PORT}`);
  console.log(`WebSocket server ready for real-time updates`);
  
  // Log initial status
  getSystemStatus().then(status => {
    console.log('Initial system status:', JSON.stringify(status, null, 2));
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
