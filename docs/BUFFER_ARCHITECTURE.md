# NoC Raven Buffer Architecture Design

## Overview
The NoC Raven buffer system provides a 2-week capacity ring buffer for telemetry data retention during VPN disconnections or network outages. The system ensures no data loss while managing disk space efficiently.

## Architecture Components

### 1. Buffer Manager Service
- **Language**: Go (for performance and integration with config-service)
- **Port**: 5005 (internal)
- **Database**: SQLite with WAL mode for concurrent access
- **Location**: `/opt/noc-raven/bin/buffer-manager`

### 2. Storage Layout
```
/data/buffer/
├── db/
│   ├── telemetry.db          # SQLite database
│   ├── telemetry.db-wal      # Write-ahead log
│   └── telemetry.db-shm      # Shared memory
├── files/                    # Large binary data
│   ├── flows/                # NetFlow binary data
│   ├── logs/                 # Syslog compressed archives
│   └── events/               # Windows Events archives
└── config/
    └── buffer-config.json    # Buffer configuration
```

### 3. Database Schema

#### Tables
```sql
-- Telemetry data with service-specific columns
CREATE TABLE telemetry_buffer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT NOT NULL,           -- fluent-bit, goflow2, telegraf, vector
    timestamp INTEGER NOT NULL,      -- Unix timestamp
    data_type TEXT NOT NULL,         -- flow, syslog, snmp, windows
    data_size INTEGER NOT NULL,      -- Size in bytes
    file_path TEXT,                  -- Path to binary file (if large)
    json_data TEXT,                  -- JSON data (if small)
    source_ip TEXT,                  -- Source IP for correlation
    forwarded INTEGER DEFAULT 0,     -- 0=buffered, 1=forwarded
    retry_count INTEGER DEFAULT 0,   -- Retry attempts
    created_at INTEGER NOT NULL,     -- Insert timestamp
    expires_at INTEGER NOT NULL      -- Auto-delete timestamp (14 days)
);

-- Indexes for performance
CREATE INDEX idx_telemetry_timestamp ON telemetry_buffer(timestamp);
CREATE INDEX idx_telemetry_service ON telemetry_buffer(service);
CREATE INDEX idx_telemetry_forwarded ON telemetry_buffer(forwarded);
CREATE INDEX idx_telemetry_expires ON telemetry_buffer(expires_at);

-- Buffer statistics
CREATE TABLE buffer_stats (
    id INTEGER PRIMARY KEY,
    service TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

### 4. Retention Policy

#### Time-based Rotation
- **Default**: 14 days (configurable)
- **Implementation**: Automatic cleanup via expires_at column
- **Frequency**: Cleanup runs every hour

#### Size-based Rotation
- **Max DB Size**: 2GB per service
- **Max File Storage**: 10GB total
- **Overflow**: Oldest entries deleted when limits reached

### 5. Service Integration

#### Vector (Windows Events)
- **Buffer Mode**: JSON records in database
- **Trigger**: VPN down or forwarding failure
- **Recovery**: Automatic replay on VPN restoration

#### Fluent Bit (Syslog)
- **Buffer Mode**: Compressed files + metadata in DB
- **File Format**: Gzip compressed JSON lines
- **Rotation**: 100MB per file, metadata tracking

#### GoFlow2 (NetFlow)
- **Buffer Mode**: Binary flow records + DB metadata
- **File Format**: Compressed binary format
- **Performance**: Minimal DB overhead for high volume

#### Telegraf (SNMP)
- **Buffer Mode**: JSON records in database
- **Enrichment**: Device metadata preservation
- **Recovery**: Trap replay with timestamp correction

## Configuration

### Buffer Manager Config
```json
{
    "enabled": true,
    "max_retention_days": 14,
    "max_db_size_gb": 2,
    "max_file_size_gb": 10,
    "cleanup_interval_minutes": 60,
    "services": {
        "vector": {
            "enabled": true,
            "buffer_mode": "database",
            "max_records": 1000000
        },
        "fluent-bit": {
            "enabled": true,
            "buffer_mode": "files",
            "max_file_size_mb": 100
        },
        "goflow2": {
            "enabled": true,
            "buffer_mode": "files",
            "max_records": 10000000
        },
        "telegraf": {
            "enabled": true,
            "buffer_mode": "database",
            "max_records": 500000
        }
    }
}
```

## API Endpoints

### Buffer Manager API
- `GET /api/buffer/status` - Buffer health and statistics
- `GET /api/buffer/stats/{service}` - Service-specific statistics
- `POST /api/buffer/flush/{service}` - Force forward buffered data
- `POST /api/buffer/cleanup` - Manual cleanup operation
- `GET /api/buffer/config` - Current configuration
- `POST /api/buffer/config` - Update configuration

## Monitoring

### Key Metrics
- Buffer utilization per service
- Disk space usage
- Forwarding success/failure rates
- Cleanup operation frequency
- Data age distribution

### Alerts
- Buffer >80% full
- Disk space <1GB available
- Forwarding failures >10/min
- Data older than 14 days found

## Implementation Priority

1. **Core buffer-manager service** (Go)
2. **SQLite database setup** with schema
3. **Vector integration** (Windows Events buffering)
4. **Fluent Bit integration** (Syslog buffering)
5. **Web UI monitoring** (buffer status page)
6. **Automated cleanup** and retention
7. **GoFlow2 integration** (NetFlow buffering)
8. **Telegraf integration** (SNMP buffering)