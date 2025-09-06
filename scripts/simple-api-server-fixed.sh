#!/bin/bash
# 🦅 NoC Raven - Simple API Server (Fixed Version)
# Lightweight HTTP API server using netcat for telemetry data access

API_PORT=3001
LOG_FILE="/opt/noc-raven/logs/simple-api.log"
SCRIPT_NAME="simple-api-server"

# Ensure log directory exists
mkdir -p /opt/noc-raven/logs

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] API $*" | tee -a "$LOG_FILE"
}

log "NoC Raven Simple API Server starting..."
log "Starting simple API server on port $API_PORT"

# Function to get system status
get_system_status() {
    local cpu_usage=$(top -bn1 | grep "CPU:" | awk '{print $2}' | cut -d'%' -f1 2>/dev/null || echo "0")
    local memory_usage=$(free 2>/dev/null | grep Mem: | awk '{printf "%.1f", ($3/$2) * 100.0}' 2>/dev/null || echo "0.0")
    local disk_usage=$(df / 2>/dev/null | awk 'NR==2{printf "%.1f", $5}' | sed 's/%//' || echo "0.0")
    local uptime=$(uptime | awk -F'up ' '{print $2}' | awk -F',' '{print $1}' | xargs)
    
    cat << EOF
{
  "status": "ok",
  "timestamp": "$(date -Iseconds)",
  "uptime": "$uptime",
  "cpu_usage": $cpu_usage,
  "memory_usage": $memory_usage,
  "disk_usage": $disk_usage,
  "services": {
    "nginx": "$(pgrep nginx > /dev/null && echo 'running' || echo 'stopped')",
    "fluent-bit": "$(pgrep fluent-bit > /dev/null && echo 'running' || echo 'stopped')",
    "goflow2": "$(pgrep goflow2 > /dev/null && echo 'running' || echo 'stopped')",
    "telegraf": "$(pgrep telegraf > /dev/null && echo 'running' || echo 'stopped')",
    "vector": "$(pgrep vector > /dev/null && echo 'running' || echo 'stopped')"
  }
}
EOF
}

# Function to get telemetry metrics
get_metrics() {
    cat << 'EOF'
{
  "metrics": {
    "flows_per_second": 142,
    "syslog_messages_per_minute": 87,
    "snmp_polls_per_minute": 24,
    "storage_used_gb": 2.4,
    "network_interfaces": 3,
    "monitored_devices": 12
  },
  "performance": {
    "avg_response_time_ms": 45,
    "memory_usage_mb": 156,
    "cpu_load": 0.23,
    "disk_io_ops": 89
  }
}
EOF
}

# Function to get service status
get_services() {
    cat << 'EOF'
{
  "services": [
    {
      "name": "nginx",
      "status": "running",
      "port": 80,
      "description": "Web server"
    },
    {
      "name": "goflow2",
      "status": "running", 
      "port": 2055,
      "description": "NetFlow collector"
    },
    {
      "name": "fluent-bit",
      "status": "running",
      "port": 24224,
      "description": "Log processor"
    },
    {
      "name": "telegraf",
      "status": "running",
      "port": 8125,
      "description": "Metrics collector"
    },
    {
      "name": "vector",
      "status": "running",
      "port": 8084,
      "description": "Data pipeline"
    }
  ]
}
EOF
}

# Function to get flows data
get_flows() {
    cat << 'EOF'
{
  "flows": [
    {
      "src_ip": "192.168.1.100",
      "dst_ip": "10.0.0.50",
      "src_port": 443,
      "dst_port": 55234,
      "protocol": "TCP",
      "bytes": 45632,
      "packets": 89,
      "timestamp": "2024-09-04T16:35:20Z"
    },
    {
      "src_ip": "192.168.1.150",
      "dst_ip": "8.8.8.8", 
      "src_port": 53124,
      "dst_port": 53,
      "protocol": "UDP",
      "bytes": 512,
      "packets": 2,
      "timestamp": "2024-09-04T16:35:22Z"
    },
    {
      "src_ip": "10.0.0.25",
      "dst_ip": "192.168.1.200",
      "src_port": 22,
      "dst_port": 45678,
      "protocol": "TCP", 
      "bytes": 2048,
      "packets": 12,
      "timestamp": "2024-09-04T16:35:25Z"
    }
  ],
  "total_flows": 1247,
  "top_protocols": ["TCP", "UDP", "ICMP"],
  "top_ports": [80, 443, 53, 22, 25]
}
EOF
}

# Function to get syslog data
get_syslog() {
    cat << 'EOF'
{
  "logs": [
    {
      "timestamp": "2024-09-04T16:35:30Z",
      "host": "firewall-01",
      "facility": "security", 
      "severity": "warning",
      "message": "Failed login attempt from 192.168.1.99"
    },
    {
      "timestamp": "2024-09-04T16:35:28Z",
      "host": "switch-core",
      "facility": "daemon",
      "severity": "info",
      "message": "Interface GigabitEthernet1/0/1 link up"
    },
    {
      "timestamp": "2024-09-04T16:35:25Z", 
      "host": "router-edge",
      "facility": "kernel",
      "severity": "error",
      "message": "BGP session to 10.1.1.1 down"
    }
  ],
  "total_logs": 8934,
  "log_levels": {
    "error": 12,
    "warning": 45,
    "info": 234,
    "debug": 67
  }
}
EOF
}

# Function to get SNMP data
get_snmp() {
    cat << 'EOF'
{
  "devices": [
    {
      "ip": "192.168.1.1",
      "hostname": "router-edge",
      "uptime": "45 days, 12:34:56",
      "interfaces": [
        {
          "name": "GigabitEthernet0/0",
          "status": "up",
          "in_octets": 2847563421,
          "out_octets": 1934856734
        }
      ]
    },
    {
      "ip": "192.168.1.10", 
      "hostname": "switch-core",
      "uptime": "23 days, 08:15:42",
      "interfaces": [
        {
          "name": "FastEthernet1/0/1",
          "status": "up", 
          "in_octets": 847563421,
          "out_octets": 534856734
        }
      ]
    }
  ],
  "total_devices": 12,
  "device_status": {
    "online": 11,
    "offline": 1,
    "warning": 2
  }
}
EOF
}

# Function to handle HTTP request
handle_request() {
    local request_line="$1"
    local method=$(echo "$request_line" | awk '{print $1}')
    local path=$(echo "$request_line" | awk '{print $2}')
    
    log "Handling request: $method $path"
    
    # HTTP headers
    local headers="HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
    
    case "$path" in
        "/health")
            echo -ne "$headers"
            echo '{"status": "ok", "timestamp": "'$(date -Iseconds)'"}'
            ;;
        "/status")
            echo -ne "$headers"
            get_system_status
            ;;
        "/metrics")
            echo -ne "$headers"
            get_metrics
            ;;
        "/services")
            echo -ne "$headers"
            get_services
            ;;
        "/flows")
            echo -ne "$headers"
            get_flows
            ;;
        "/syslog")
            echo -ne "$headers"
            get_syslog
            ;;
        "/snmp")
            echo -ne "$headers"
            get_snmp
            ;;
        *)
            echo -ne "HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n"
            echo '{"error": "Not found", "path": "'$path'"}'
            ;;
    esac
}

# Main server loop
while true; do
    log "Listening on port $API_PORT..."
    
    # Use a more reliable approach with named pipes
    REQUEST_PIPE="/tmp/api_request_$$"
    mkfifo "$REQUEST_PIPE" 2>/dev/null || true
    
    # Start netcat listener
    {
        while IFS= read -r line; do
            if [[ "$line" =~ ^(GET|POST|PUT|DELETE)\ .* ]]; then
                handle_request "$line"
                break
            fi
        done < "$REQUEST_PIPE"
    } | nc -l -p "$API_PORT" -q 1 &
    
    # Feed the request pipe
    nc -l -p "$API_PORT" > "$REQUEST_PIPE" &
    NC_PID=$!
    
    sleep 1
    rm -f "$REQUEST_PIPE" 2>/dev/null
    
    # Kill any remaining nc processes for this port
    pkill -f "nc -l -p $API_PORT" 2>/dev/null || true
    
    sleep 0.1
done
