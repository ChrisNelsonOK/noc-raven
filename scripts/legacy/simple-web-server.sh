#!/bin/bash
# 🦅 NoC Raven - Simple Web Server
# Ultra basic HTTP server for BusyBox environment

API_PORT=3001
LOG_FILE="/opt/noc-raven/logs/simple-api.log"

mkdir -p /opt/noc-raven/logs

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] API $*" | tee -a "$LOG_FILE"
}

log "NoC Raven Simple Web Server starting on port $API_PORT"

# Function to handle HTTP request
handle_request() {
    local request_line="$1"
    local path=$(echo "$request_line" | cut -d' ' -f2)
    
    log "Handling request: $path"
    
    case "$path" in
        "/health"|"/api/health")
            echo "HTTP/1.1 200 OK"
            echo "Content-Type: application/json"
            echo "Access-Control-Allow-Origin: *"
            echo "Connection: close"
            echo ""
            echo '{"status": "ok", "timestamp": "'$(date -Iseconds)'"}'
            ;;
        "/status"|"/api/status")
            echo "HTTP/1.1 200 OK"
            echo "Content-Type: application/json"
            echo "Access-Control-Allow-Origin: *"
            echo "Connection: close"
            echo ""
            cat << 'EOF'
{
  "status": "ok",
  "timestamp": "2024-09-04T16:50:00Z",
  "uptime": "1 day, 2:34:56",
  "cpu_usage": 25.4,
  "memory_usage": 67.8,
  "disk_usage": 45.2,
  "services": {
    "nginx": "running",
    "fluent-bit": "running", 
    "goflow2": "running",
    "telegraf": "running",
    "vector": "running"
  }
}
EOF
            ;;
        "/metrics"|"/api/metrics")
            echo "HTTP/1.1 200 OK"
            echo "Content-Type: application/json"
            echo "Access-Control-Allow-Origin: *"
            echo "Connection: close"
            echo ""
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
            ;;
        "/services"|"/api/services")
            echo "HTTP/1.1 200 OK"
            echo "Content-Type: application/json"
            echo "Access-Control-Allow-Origin: *"
            echo "Connection: close"
            echo ""
            cat << 'EOF'
{
  "services": [
    {"name": "nginx", "status": "running", "port": 80, "description": "Web server"},
    {"name": "goflow2", "status": "running", "port": 2055, "description": "NetFlow collector"},
    {"name": "fluent-bit", "status": "running", "port": 24224, "description": "Log processor"},
    {"name": "telegraf", "status": "running", "port": 8125, "description": "Metrics collector"},
    {"name": "vector", "status": "running", "port": 8084, "description": "Data pipeline"}
  ]
}
EOF
            ;;
        "/flows"|"/api/flows")
            echo "HTTP/1.1 200 OK"
            echo "Content-Type: application/json"
            echo "Access-Control-Allow-Origin: *"
            echo "Connection: close"
            echo ""
            cat << 'EOF'
{
  "flows": [
    {"src_ip": "192.168.1.100", "dst_ip": "10.0.0.50", "src_port": 443, "dst_port": 55234, "protocol": "TCP", "bytes": 45632, "packets": 89, "timestamp": "2024-09-04T16:35:20Z"},
    {"src_ip": "192.168.1.150", "dst_ip": "8.8.8.8", "src_port": 53124, "dst_port": 53, "protocol": "UDP", "bytes": 512, "packets": 2, "timestamp": "2024-09-04T16:35:22Z"},
    {"src_ip": "10.0.0.25", "dst_ip": "192.168.1.200", "src_port": 22, "dst_port": 45678, "protocol": "TCP", "bytes": 2048, "packets": 12, "timestamp": "2024-09-04T16:35:25Z"}
  ],
  "total_flows": 1247,
  "top_protocols": ["TCP", "UDP", "ICMP"],
  "top_ports": [80, 443, 53, 22, 25]
}
EOF
            ;;
        "/syslog"|"/api/syslog")
            echo "HTTP/1.1 200 OK"
            echo "Content-Type: application/json"
            echo "Access-Control-Allow-Origin: *"
            echo "Connection: close"
            echo ""
            cat << 'EOF'
{
  "logs": [
    {"timestamp": "2024-09-04T16:35:30Z", "host": "firewall-01", "facility": "security", "severity": "warning", "message": "Failed login attempt from 192.168.1.99"},
    {"timestamp": "2024-09-04T16:35:28Z", "host": "switch-core", "facility": "daemon", "severity": "info", "message": "Interface GigabitEthernet1/0/1 link up"},
    {"timestamp": "2024-09-04T16:35:25Z", "host": "router-edge", "facility": "kernel", "severity": "error", "message": "BGP session to 10.1.1.1 down"}
  ],
  "total_logs": 8934,
  "log_levels": {"error": 12, "warning": 45, "info": 234, "debug": 67}
}
EOF
            ;;
        "/snmp"|"/api/snmp")
            echo "HTTP/1.1 200 OK"
            echo "Content-Type: application/json"
            echo "Access-Control-Allow-Origin: *"
            echo "Connection: close"
            echo ""
            cat << 'EOF'
{
  "devices": [
    {"ip": "192.168.1.1", "hostname": "router-edge", "uptime": "45 days, 12:34:56", "interfaces": [{"name": "GigabitEthernet0/0", "status": "up", "in_octets": 2847563421, "out_octets": 1934856734}]},
    {"ip": "192.168.1.10", "hostname": "switch-core", "uptime": "23 days, 08:15:42", "interfaces": [{"name": "FastEthernet1/0/1", "status": "up", "in_octets": 847563421, "out_octets": 534856734}]}
  ],
  "total_devices": 12,
  "device_status": {"online": 11, "offline": 1, "warning": 2}
}
EOF
            ;;
        *)
            echo "HTTP/1.1 404 Not Found"
            echo "Content-Type: application/json"
            echo "Access-Control-Allow-Origin: *"
            echo "Connection: close"
            echo ""
            echo '{"error": "Not found", "path": "'$path'"}'
            ;;
    esac
}

# Main server loop
while true; do
    log "Listening for connections on port $API_PORT..."
    
    # Create temporary files for input/output
    REQUEST_FILE="/tmp/request_$$"
    RESPONSE_FILE="/tmp/response_$$"
    
    # Use nc to accept connection and get request
    nc -l -p $API_PORT > "$REQUEST_FILE" &
    NC_PID=$!
    
    # Wait for nc to finish or timeout
    sleep 1
    kill $NC_PID 2>/dev/null || true
    wait $NC_PID 2>/dev/null || true
    
    # Process the request if we got one
    if [ -s "$REQUEST_FILE" ]; then
        REQUEST_LINE=$(head -n1 "$REQUEST_FILE" | tr -d '\r\n')
        if echo "$REQUEST_LINE" | grep -q "GET .* HTTP"; then
            # Generate response
            handle_request "$REQUEST_LINE" > "$RESPONSE_FILE"
            
            # Send response
            cat "$RESPONSE_FILE" | nc -l -p $API_PORT -q 1 &
            sleep 0.5
        fi
    fi
    
    # Clean up
    rm -f "$REQUEST_FILE" "$RESPONSE_FILE" 2>/dev/null
    
    # Brief pause before next iteration
    sleep 0.1
done
