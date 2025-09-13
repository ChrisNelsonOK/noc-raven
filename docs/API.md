# 🚀 NoC Raven API Documentation

## Overview

The NoC Raven Config Service provides a RESTful API for managing telemetry collection configuration and service control. All endpoints return JSON responses and support CORS for development.

**Base URL**: `http://localhost:9080/api`  
**Content-Type**: `application/json`

---

## 🔧 Configuration Management

### GET /api/config
Retrieve the current system configuration.

**Response**:
```json
{
  "syslog_port": 514,
  "netflow_port": 2055,
  "ipfix_port": 4739,
  "sflow_port": 6343,
  "snmp_trap_port": 162,
  "windows_events_port": 8084,
  "forwarding_enabled": true,
  "compression_enabled": false,
  "log_level": "info"
}
```

### POST /api/config
Update system configuration. Changes trigger automatic service restarts.

**Request Body**:
```json
{
  "syslog_port": 1514,
  "netflow_port": 2055,
  "forwarding_enabled": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Configuration updated successfully",
  "restarted_services": ["fluent-bit", "goflow2"]
}
```

**Service Restart Logic**:
- `syslog_port` changes → restart `fluent-bit`
- `netflow_port`, `ipfix_port`, `sflow_port` changes → restart `goflow2`
- `snmp_trap_port` changes → restart `telegraf`
- `windows_events_port` changes → restart `vector`

---

## 🔄 Service Management

### POST /api/services/{service}/restart
Restart a specific service.

**Supported Services**:
- `fluent-bit` (aliases: `syslog`, `fluentbit`)
- `goflow2` (aliases: `netflow`, `flows`)
- `telegraf` (aliases: `snmp`)
- `vector` (aliases: `windows`, `win-events`)
- `buffer-service` (aliases: `buffer`)

**Example**: `POST /api/services/fluent-bit/restart`

**Response**:
```json
{
  "success": true,
  "message": "Service fluent-bit restarted successfully",
  "service": "fluent-bit",
  "status": "running"
}
```

**Error Response**:
```json
{
  "error": "Service restart failed",
  "service": "fluent-bit",
  "details": "supervisorctl restart failed"
}
```

---

## 📊 System Status

### GET /api/system/status
Get comprehensive system and service status.

**Response**:
```json
{
  "system": {
    "uptime": "2 days, 14:32:15",
    "cpu_usage": 15.2,
    "memory_usage": 68.5,
    "disk_usage": 42.1,
    "load_average": [0.8, 0.9, 1.1]
  },
  "services": {
    "fluent-bit": {
      "status": "running",
      "pid": 1234,
      "uptime": "1 day, 12:15:30",
      "cpu_usage": 2.1,
      "memory_usage": 45.2
    },
    "goflow2": {
      "status": "running", 
      "pid": 1235,
      "uptime": "1 day, 12:15:25",
      "cpu_usage": 1.8,
      "memory_usage": 32.1
    }
  },
  "telemetry": {
    "syslog_messages": 15420,
    "netflow_records": 8932,
    "snmp_traps": 45,
    "windows_events": 2341
  }
}
```

---

## 📈 Telemetry Data Endpoints

### GET /api/syslog
Get recent syslog messages and statistics.

**Query Parameters**:
- `limit` (default: 100) - Number of recent messages
- `severity` - Filter by severity level

**Response**:
```json
{
  "total_messages": 15420,
  "severity_counts": {
    "emergency": 0,
    "alert": 2,
    "critical": 5,
    "error": 23,
    "warning": 156,
    "notice": 892,
    "info": 12341,
    "debug": 2001
  },
  "recent_messages": [
    {
      "timestamp": "2024-01-15T10:30:45Z",
      "hostname": "server01",
      "facility": "daemon",
      "severity": "info",
      "message": "Service started successfully"
    }
  ]
}
```

### GET /api/netflow
Get NetFlow statistics and recent flows.

**Response**:
```json
{
  "total_flows": 8932,
  "flows_per_minute": 145,
  "top_talkers": [
    {
      "src_ip": "192.168.1.100",
      "dst_ip": "10.0.0.50", 
      "bytes": 1048576,
      "packets": 1024
    }
  ],
  "protocols": {
    "TCP": 6543,
    "UDP": 2234,
    "ICMP": 155
  }
}
```

### GET /api/snmp
Get SNMP trap information and device status.

**Response**:
```json
{
  "total_traps": 45,
  "devices": [
    {
      "ip": "192.168.1.1",
      "hostname": "switch01",
      "status": "up",
      "last_seen": "2024-01-15T10:29:12Z",
      "trap_count": 12
    }
  ],
  "recent_traps": [
    {
      "timestamp": "2024-01-15T10:25:30Z",
      "source_ip": "192.168.1.1",
      "oid": "1.3.6.1.4.1.9.9.41.1.2.3.1.5",
      "value": "Interface GigabitEthernet0/1 is down"
    }
  ]
}
```

### GET /api/windows
Get Windows Event Log data via Vector.

**Response**:
```json
{
  "total_events": 2341,
  "event_levels": {
    "critical": 2,
    "error": 15,
    "warning": 89,
    "information": 2180,
    "verbose": 55
  },
  "event_sources": {
    "System": 1205,
    "Application": 892,
    "Security": 244
  },
  "recent_events": [
    {
      "timestamp": "2024-01-15T10:28:45Z",
      "level": "Information",
      "source": "System",
      "event_id": 7036,
      "computer": "WIN-SERVER01",
      "message": "The Windows Event Log service entered the running state."
    }
  ]
}
```

### GET /api/buffer
Get buffer service status and metrics.

**Response**:
```json
{
  "health_score": 95,
  "buffer_size": 1048576,
  "buffer_used": 524288,
  "utilization_percent": 50,
  "throughput": {
    "messages_per_second": 125,
    "messages_in": 15420,
    "messages_out": 15380,
    "dropped_messages": 5,
    "error_rate": 0.03
  },
  "queues": [
    {
      "name": "syslog_queue",
      "size": 1024,
      "max_size": 10000,
      "status": "active",
      "processing_rate": 45
    }
  ]
}
```

### GET /api/metrics
Get comprehensive system metrics.

**Response**:
```json
{
  "system": {
    "cpu_usage": 15.2,
    "memory_usage": 68.5,
    "disk_usage": 42.1,
    "network_io": 1048576,
    "load_1m": 0.8,
    "load_5m": 0.9,
    "load_15m": 1.1,
    "cpu_cores": 4
  },
  "services": [
    {
      "name": "fluent-bit",
      "status": "running",
      "cpu_usage": 2.1,
      "memory_usage": 47185920,
      "uptime": "1d 12h 15m"
    }
  ],
  "telemetry": {
    "syslog_messages": 15420,
    "netflow_records": 8932,
    "snmp_traps": 45,
    "windows_events": 2341
  }
}
```

---

## 🔒 Authentication

**Development Mode**: Authentication is disabled by default for beta release.

**Production Mode**: Set `API_KEY` environment variable to enable API key authentication.

```bash
export API_KEY="your-secure-api-key"
```

Include in requests:
```bash
curl -H "X-API-Key: your-secure-api-key" http://localhost:9080/api/config
```

---

## 🚨 Error Handling

All endpoints return appropriate HTTP status codes:

- `200` - Success
- `400` - Bad Request (invalid JSON, missing parameters)
- `401` - Unauthorized (invalid API key)
- `404` - Not Found (invalid endpoint)
- `500` - Internal Server Error

**Error Response Format**:
```json
{
  "error": "Configuration validation failed",
  "details": "Port 514 is already in use",
  "timestamp": "2024-01-15T10:30:45Z"
}
```

---

## 📝 Rate Limiting

No rate limiting is currently implemented. For production deployments, consider implementing rate limiting at the reverse proxy level.

---

## 🔄 WebSocket Support

Real-time updates are not currently supported via WebSocket. Use polling with appropriate intervals:

- System status: 5-10 seconds
- Telemetry data: 10-30 seconds  
- Configuration: On-demand only

---

## 🧪 Testing

Test the API using curl:

```bash
# Get current config
curl http://localhost:9080/api/config

# Update syslog port
curl -X POST http://localhost:9080/api/config \
  -H "Content-Type: application/json" \
  -d '{"syslog_port": 1514}'

# Restart service
curl -X POST http://localhost:9080/api/services/fluent-bit/restart

# Get system status
curl http://localhost:9080/api/system/status
```
