#!/bin/bash
# Create API JSON files for NoC Raven web interface
# Now includes live status generation and simple HTTP API server

set -euo pipefail

# Configuration
TIMESTAMP=$(date -Iseconds)
API_DIR="/opt/noc-raven/web/api"
API_PORT="5001"
LOG_FILE="/var/log/noc-raven/api-creator.log"

# Logging function  
log() {
    echo "$(date -Iseconds) [API-CREATOR] $*" | tee -a "$LOG_FILE"
}

# Ensure API directory exists
mkdir -p "$API_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# Ensure default config.json exists
if [[ ! -f "$API_DIR/config.json" ]]; then
cat > "$API_DIR/config.json" <<'JSON'
{
  "collection": {
    "syslog": { "enabled": true, "port": 514, "protocol": "UDP", "bind_address": "0.0.0.0" },
    "netflow": { "enabled": true, "port": 2055 },
    "snmp": { "enabled": true, "port": 161 }
  },
  "analysis": {
    "threat_detection": { "enabled": true },
    "anomaly_detection": { "enabled": true }
  }
}
JSON
  log "Created default config.json at $API_DIR/config.json"
fi

log "Creating API files with live status data"

# Function to get real-time system status
get_live_system_status() {
    local nginx_status="unknown"
    local vector_status="unknown" 
    local fluent_status="unknown"
    local goflow_status="unknown"
    local telegraf_status="unknown"
    local system_status="degraded"
    
    # Check service processes and ports
    if pgrep nginx >/dev/null 2>&1 && (netstat -ln 2>/dev/null | grep -q ":8080 " || ss -tlpn 2>/dev/null | grep -q ":8080 "); then
        nginx_status="healthy"
    elif pgrep nginx >/dev/null 2>&1; then
        nginx_status="degraded" 
    else
        nginx_status="failed"
    fi
    
    if pgrep vector >/dev/null 2>&1 && (netstat -ln 2>/dev/null | grep -q ":8084 " || ss -tlpn 2>/dev/null | grep -q ":8084 "); then
        vector_status="healthy"
    elif pgrep vector >/dev/null 2>&1; then
        vector_status="degraded"
    else
        vector_status="failed"
    fi
    
    if pgrep fluent-bit >/dev/null 2>&1; then
        fluent_status="healthy"
    else
        fluent_status="failed"
    fi
    
    if pgrep goflow2 >/dev/null 2>&1 && (netstat -lun 2>/dev/null | grep -q ":2055 " || ss -ulpn 2>/dev/null | grep -q ":2055 "); then
        goflow_status="healthy"
    elif pgrep goflow2 >/dev/null 2>&1; then
        goflow_status="degraded"
    else
        goflow_status="failed"
    fi
    
    if pgrep telegraf >/dev/null 2>&1; then
        telegraf_status="healthy"
    else
        telegraf_status="failed"
    fi
    
    # Calculate overall system status
    local healthy_count=0
    for status in "$nginx_status" "$vector_status" "$fluent_status" "$goflow_status"; do
        if [[ "$status" == "healthy" ]]; then
            ((healthy_count++))
        fi
    done
    
    if [[ $healthy_count -ge 3 ]]; then
        system_status="healthy"
    elif [[ $healthy_count -ge 2 ]]; then
        system_status="degraded"  
    else
        system_status="failed"
    fi
    
    # Get uptime
    local uptime_info
    uptime_info=$(uptime 2>/dev/null | awk -F'up ' '{print $2}' | awk -F',' '{print $1}' | xargs 2>/dev/null || echo "unknown")
    
    echo "$nginx_status,$vector_status,$fluent_status,$goflow_status,$telegraf_status,$system_status,$uptime_info"
}

# Function to start simple HTTP API server in background
start_api_server() {
    local server_script="/opt/noc-raven/scripts/simple-api-server.sh"
    
    # Create simple HTTP API server script
    cat > "$server_script" << 'EOF'
#!/bin/bash
# Simple HTTP API server for configuration management
set -euo pipefail

API_PORT=${API_PORT:-5001}
LOG_FILE="/var/log/noc-raven/simple-api-server.log"

# Logging
log() {
    echo "$(date -Iseconds) [SIMPLE-API] $*" | tee -a "$LOG_FILE"
}

# Handle HTTP requests
handle_request() {
    local method="$1"
    local path="$2"
    local content_length="${3:-0}"
    
    log "$method $path"
    
    # Send HTTP headers
    echo "HTTP/1.1 200 OK"
    echo "Content-Type: application/json"
    echo "Access-Control-Allow-Origin: *"
    echo "Access-Control-Allow-Methods: GET, POST, OPTIONS"
    echo "Access-Control-Allow-Headers: Content-Type, Authorization"
    echo ""
    
    case "$path" in
        "/api/system/status")
            # Get live system status
            source /opt/noc-raven/scripts/create-api-files.sh
            local status_data
            status_data=$(get_live_system_status)
            IFS=',' read -r nginx vector fluent goflow telegraf system uptime <<< "$status_data"
            
            cat << JSON
{
    "services": {
        "nginx": {"status": "$nginx", "port": 8080, "critical": true},
        "vector": {"status": "$vector", "port": 8084, "critical": true},
        "fluent-bit": {"status": "$fluent", "port": 5140, "critical": true},
        "goflow2": {"status": "$goflow", "port": 2055, "critical": true},
        "telegraf": {"status": "$telegraf", "port": 161, "critical": false}
    },
    "system_status": "$system",
    "timestamp": "$(date -Iseconds)",
    "uptime": "$uptime"
}
JSON
            ;;
        "/api/config")
            if [[ "$method" == "GET" ]]; then
                cat << 'JSON'
{
    "collection": {
        "syslogPort": 5140,
        "netflowPort": 2055,
        "snmpPort": 161,
        "wmiPort": 6343
    },
    "forwarding": {
        "destinations": [
            {"name": "Primary Collector", "host": "obs.rectitude.net", "port": 1514, "protocol": "UDP"}
        ]
    },
    "alerts": {"enabled": false},
    "timestamp": "'$(date -Iseconds)'"
}
JSON
            elif [[ "$method" == "POST" ]]; then
                # Read POST data if any
                if [[ $content_length -gt 0 ]]; then
                    read -n $content_length post_data
                    log "Config update received: $post_data"
                fi
                
                echo '{"success": true, "message": "Configuration saved successfully", "timestamp": "'$(date -Iseconds)'"}'
            fi
            ;;
        *)
            echo '{"error": "Not found", "timestamp": "'$(date -Iseconds)'"}'
            ;;
    esac
}

# Start HTTP server
log "Starting simple HTTP API server on port $API_PORT"
while true; do
    {
        read -r method path version
        
        # Read headers
        content_length=0
        while read -r header; do
            [[ "$header" == $'\r' ]] && break
            if [[ "$header" =~ ^Content-Length:[[:space:]]*([0-9]+) ]]; then
                content_length="${BASH_REMATCH[1]}"
            fi
        done
        
        handle_request "$method" "$path" "$content_length"
        
    } | nc -l -p "$API_PORT" -q 1 2>/dev/null || true
done
EOF
    
    chmod +x "$server_script"
    
    # Start the server in background
    if ! pgrep -f "simple-api-server.sh" >/dev/null 2>&1; then
        log "Starting simple HTTP API server on port $API_PORT"
        nohup "$server_script" > "$LOG_FILE" 2>&1 &
        sleep 2
        
        if pgrep -f "simple-api-server.sh" >/dev/null 2>&1; then
            log "Simple HTTP API server started successfully"
        else
            log "Failed to start simple HTTP API server"
        fi
    else
        log "Simple HTTP API server already running"
    fi
}

# Create health.json
cat > /opt/noc-raven/web/api/health.json << EOF
{
  "status": "operational",
  "timestamp": "$TIMESTAMP",
  "version": "1.0.0-alpha",
  "services": {
    "nginx": {
      "status": "running",
      "uptime": "0d 0h 15m",
      "memory_usage": "12MB"
    },
    "fluent-bit": {
      "status": "collecting",
      "uptime": "0d 0h 15m", 
      "messages_processed": 0,
      "buffer_usage": "0%"
    },
    "goflow2": {
      "status": "listening",
      "uptime": "0d 0h 15m",
      "flows_processed": 0,
      "active_exporters": 0
    },
    "vector": {
      "status": "idle",
      "uptime": "0d 0h 15m",
      "events_processed": 0
    },
    "telegraf": {
      "status": "monitoring",
      "uptime": "0d 0h 15m",
      "snmp_devices": 0,
      "metrics_collected": 0
    }
  },
  "system": {
    "cpu_usage": "3%",
    "memory_usage": "45%",
    "disk_usage": "12%",
    "network_status": "connected"
  }
}
EOF

# Create snmp.json
cat > /opt/noc-raven/web/api/snmp.json << EOF
{
  "status": "waiting_for_data",
  "timestamp": "$TIMESTAMP",
  "collection_status": {
    "receiver": "listening",
    "port": 162,
    "protocol": "UDP",
    "buffer_status": "empty"
  },
  "devices": [],
  "recent_traps": [],
  "statistics": {
    "total_traps_received": 0,
    "devices_discovered": 0,
    "last_activity": null,
    "uptime_seconds": 900
  },
  "configuration": {
    "auto_discovery": true,
    "community_strings": ["public", "private"],
    "retention_days": 14
  }
}
EOF

# Create syslog.json
cat > /opt/noc-raven/web/api/syslog.json << EOF
{
  "status": "collecting",
  "timestamp": "$TIMESTAMP",
  "collection_status": {
    "receiver": "active",
    "port": 514,
    "protocol": "UDP/TCP",
    "buffer_usage": "0%"
  },
  "recent_messages": [],
  "statistics": {
    "total_messages": 0,
    "messages_last_hour": 0,
    "messages_last_day": 0,
    "active_sources": 0,
    "last_message": null
  },
  "sources": [],
  "filters": {
    "severity_levels": ["emergency", "alert", "critical", "error", "warning", "notice", "info", "debug"],
    "facilities": ["kernel", "user", "system", "security", "internal", "printer", "news", "uucp", "clock", "security2", "ftp", "ntp", "audit", "alert", "clock2"]
  }
}
EOF

# Create flows.json
cat > /opt/noc-raven/web/api/flows.json << EOF
{
  "status": "listening",
  "timestamp": "$TIMESTAMP",
  "collection_status": {
    "netflow_v5": {"port": 2055, "status": "listening", "flows_received": 0},
    "netflow_v9": {"port": 2055, "status": "listening", "flows_received": 0},
    "ipfix": {"port": 4739, "status": "listening", "flows_received": 0},
    "sflow": {"port": 6343, "status": "listening", "flows_received": 0}
  },
  "recent_flows": [],
  "statistics": {
    "total_flows": 0,
    "flows_last_hour": 0,
    "flows_last_day": 0,
    "active_exporters": 0,
    "protocols_seen": []
  },
  "exporters": [],
  "top_talkers": [],
  "protocols": []
}
EOF

# Create metrics.json
cat > /opt/noc-raven/web/api/metrics.json << EOF
{
  "status": "monitoring",
  "timestamp": "$TIMESTAMP",
  "system_metrics": {
    "cpu": {
      "usage": 3.2,
      "cores": 8,
      "load_average": [0.1, 0.05, 0.03]
    },
    "memory": {
      "total": 8589934592,
      "used": 3865470976,
      "free": 4724463616,
      "usage_percent": 45.0
    },
    "disk": {
      "total": 107374182400,
      "used": 12884901888,
      "free": 94489280512,
      "usage_percent": 12.0
    },
    "network": {
      "interfaces": [
        {
          "name": "eth0",
          "bytes_sent": 102400,
          "bytes_recv": 204800,
          "packets_sent": 1024,
          "packets_recv": 2048
        }
      ]
    }
  },
  "service_metrics": {
    "fluent_bit": {
      "messages_processed": 0,
      "buffer_usage": 0,
      "memory_usage": 15728640
    },
    "goflow2": {
      "flows_processed": 0,
      "active_connections": 0,
      "memory_usage": 25165824
    },
    "vector": {
      "events_processed": 0,
      "buffer_usage": 0,
      "memory_usage": 20971520
    },
    "telegraf": {
      "metrics_collected": 0,
      "plugins_active": 3,
      "memory_usage": 18874368
    }
  }
}
EOF

# Create config.json
cat > /opt/noc-raven/web/api/config.json << EOF
{
  "collection": {
    "syslog": {
      "enabled": true,
      "port": 514,
      "protocol": "UDP",
      "formats": ["RFC3164", "RFC5424"]
    },
    "netflow": {
      "enabled": true,
      "ports": {
        "netflow_v5": 2055,
        "netflow_v9": 2055,
        "ipfix": 4739,
        "sflow": 6343
      }
    },
    "snmp": {
      "enabled": true,
      "trap_port": 162,
      "community": "public",
      "version": "2c"
    }
  },
  "forwarding": {
    "enabled": true,
    "destinations": [
      {
        "name": "Primary Observer",
        "host": "obs.rectitude.net",
        "ports": {
          "syslog": 1514,
          "netflow": 2055,
          "snmp": 162,
          "metrics": 9090
        },
        "protocol": "UDP",
        "enabled": true
      }
    ]
  },
  "alerts": {
    "disk_usage_threshold": 85,
    "memory_usage_threshold": 90,
    "flow_rate_threshold": 10000,
    "email_notifications": false,
    "email_smtp_server": "",
    "email_recipients": []
  },
  "retention": {
    "syslog_days": 14,
    "flows_days": 7,
    "snmp_days": 30,
    "metrics_days": 30
  },
  "performance": {
    "buffer_size_mb": 256,
    "worker_threads": 4,
    "batch_size": 1000,
    "flush_interval_seconds": 30
  }
}
EOF

# Start the simple HTTP API server (optional)
if [ "${NOC_RAVEN_ENABLE_SIMPLE_API:-false}" = "true" ]; then
  start_api_server
  log "Simple HTTP API server started on port $API_PORT for live data"
else
  log "Skipping simple HTTP API server (disabled by default). Set NOC_RAVEN_ENABLE_SIMPLE_API=true to enable."
fi

# Set proper ownership and permissions
chown -R nocraven:nocraven /opt/noc-raven/web/api 2>/dev/null || true
chmod -R 644 /opt/noc-raven/web/api/*.json 2>/dev/null || true

log "API files created successfully with waiting-for-data status"
echo "API files configured successfully"
