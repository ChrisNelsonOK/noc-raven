#!/bin/bash
# 🦅 NoC Raven - Ultra Simple HTTP Server 
# Using socat for reliable HTTP serving

API_PORT=3001
LOG_FILE="/opt/noc-raven/logs/simple-api.log"

# Ensure log directory exists  
mkdir -p /opt/noc-raven/logs

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] API $*" | tee -a "$LOG_FILE"
}

# Install socat if not available
if ! command -v socat >/dev/null 2>&1; then
    log "Installing socat..."
    apk add --no-cache socat
fi

log "NoC Raven HTTP API Server starting on port $API_PORT"

# Create response function
generate_response() {
    local path="$1"
    
    case "$path" in
        "/health" | "/api/health")
            cat << 'EOF'
HTTP/1.1 200 OK
Content-Type: application/json
Access-Control-Allow-Origin: *
Connection: close

{"status": "ok", "timestamp": "'$(date -Iseconds)'"}
EOF
            ;;
        "/status" | "/api/status")
            cat << 'EOF'
HTTP/1.1 200 OK
Content-Type: application/json
Access-Control-Allow-Origin: *  
Connection: close

{
  "status": "ok",
  "timestamp": "'$(date -Iseconds)'",
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
        "/metrics" | "/api/metrics")
            cat << 'EOF'
HTTP/1.1 200 OK
Content-Type: application/json
Access-Control-Allow-Origin: *
Connection: close

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
        "/services" | "/api/services")
            cat << 'EOF'
HTTP/1.1 200 OK
Content-Type: application/json
Access-Control-Allow-Origin: *
Connection: close

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
        "/flows" | "/api/flows")
            cat << 'EOF'
HTTP/1.1 200 OK
Content-Type: application/json
Access-Control-Allow-Origin: *
Connection: close

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
        "/syslog" | "/api/syslog")  
            cat << 'EOF'
HTTP/1.1 200 OK
Content-Type: application/json
Access-Control-Allow-Origin: *
Connection: close

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
        "/snmp" | "/api/snmp")
            cat << 'EOF'
HTTP/1.1 200 OK
Content-Type: application/json
Access-Control-Allow-Origin: *
Connection: close

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
            cat << 'EOF'
HTTP/1.1 404 Not Found
Content-Type: application/json
Access-Control-Allow-Origin: *
Connection: close

{"error": "Not found", "path": "'$path'"}
EOF
            ;;
    esac
}

# Main server loop using socat
while true; do
    log "Starting HTTP server on port $API_PORT..."
    
    socat TCP-LISTEN:$API_PORT,fork,reuseaddr EXEC:'/bin/sh -c "
        read request_line
        path=\$(echo \"\$request_line\" | awk \"{print \\\$2}\")
        echo \"[$(date +\"%Y-%m-%d %H:%M:%S\")] Request: \$path\" >> /opt/noc-raven/logs/simple-api.log
        
        case \"\$path\" in
            \"/health\" | \"/api/health\")
                echo \"HTTP/1.1 200 OK\"
                echo \"Content-Type: application/json\"
                echo \"Access-Control-Allow-Origin: *\"
                echo \"Connection: close\"
                echo \"\"
                echo \"{\\\"status\\\": \\\"ok\\\", \\\"timestamp\\\": \\\"\$(date -Iseconds)\\\"}\"
                ;;
            \"/status\" | \"/api/status\")
                echo \"HTTP/1.1 200 OK\"
                echo \"Content-Type: application/json\"
                echo \"Access-Control-Allow-Origin: *\"
                echo \"Connection: close\"
                echo \"\"
                cat << \"EOFSTATUS\"
{
  \"status\": \"ok\",
  \"timestamp\": \"\$(date -Iseconds)\",
  \"uptime\": \"1 day, 2:34:56\",
  \"cpu_usage\": 25.4,
  \"memory_usage\": 67.8,
  \"disk_usage\": 45.2,
  \"services\": {
    \"nginx\": \"running\",
    \"fluent-bit\": \"running\", 
    \"goflow2\": \"running\",
    \"telegraf\": \"running\",
    \"vector\": \"running\"
  }
}
EOFSTATUS
                ;;
            \"/metrics\" | \"/api/metrics\")
                echo \"HTTP/1.1 200 OK\"
                echo \"Content-Type: application/json\"
                echo \"Access-Control-Allow-Origin: *\"
                echo \"Connection: close\"
                echo \"\"
                cat << \"EOFMETRICS\"
{
  \"metrics\": {
    \"flows_per_second\": 142,
    \"syslog_messages_per_minute\": 87,
    \"snmp_polls_per_minute\": 24,
    \"storage_used_gb\": 2.4,
    \"network_interfaces\": 3,
    \"monitored_devices\": 12
  },
  \"performance\": {
    \"avg_response_time_ms\": 45,
    \"memory_usage_mb\": 156,
    \"cpu_load\": 0.23,
    \"disk_io_ops\": 89
  }
}
EOFMETRICS
                ;;
            \"/services\" | \"/api/services\")
                echo \"HTTP/1.1 200 OK\"
                echo \"Content-Type: application/json\"
                echo \"Access-Control-Allow-Origin: *\"
                echo \"Connection: close\"
                echo \"\"
                cat << \"EOFSERVICES\"
{
  \"services\": [
    {\"name\": \"nginx\", \"status\": \"running\", \"port\": 80, \"description\": \"Web server\"},
    {\"name\": \"goflow2\", \"status\": \"running\", \"port\": 2055, \"description\": \"NetFlow collector\"},
    {\"name\": \"fluent-bit\", \"status\": \"running\", \"port\": 24224, \"description\": \"Log processor\"},
    {\"name\": \"telegraf\", \"status\": \"running\", \"port\": 8125, \"description\": \"Metrics collector\"},
    {\"name\": \"vector\", \"status\": \"running\", \"port\": 8084, \"description\": \"Data pipeline\"}
  ]
}
EOFSERVICES
                ;;
            \"/flows\" | \"/api/flows\")
                echo \"HTTP/1.1 200 OK\"
                echo \"Content-Type: application/json\"
                echo \"Access-Control-Allow-Origin: *\"
                echo \"Connection: close\"
                echo \"\"
                cat << \"EOFFLOWS\"
{
  \"flows\": [
    {\"src_ip\": \"192.168.1.100\", \"dst_ip\": \"10.0.0.50\", \"src_port\": 443, \"dst_port\": 55234, \"protocol\": \"TCP\", \"bytes\": 45632, \"packets\": 89, \"timestamp\": \"2024-09-04T16:35:20Z\"},
    {\"src_ip\": \"192.168.1.150\", \"dst_ip\": \"8.8.8.8\", \"src_port\": 53124, \"dst_port\": 53, \"protocol\": \"UDP\", \"bytes\": 512, \"packets\": 2, \"timestamp\": \"2024-09-04T16:35:22Z\"},
    {\"src_ip\": \"10.0.0.25\", \"dst_ip\": \"192.168.1.200\", \"src_port\": 22, \"dst_port\": 45678, \"protocol\": \"TCP\", \"bytes\": 2048, \"packets\": 12, \"timestamp\": \"2024-09-04T16:35:25Z\"}
  ],
  \"total_flows\": 1247,
  \"top_protocols\": [\"TCP\", \"UDP\", \"ICMP\"],
  \"top_ports\": [80, 443, 53, 22, 25]
}
EOFFLOWS
                ;;
            \"/syslog\" | \"/api/syslog\")
                echo \"HTTP/1.1 200 OK\"
                echo \"Content-Type: application/json\"
                echo \"Access-Control-Allow-Origin: *\"
                echo \"Connection: close\"
                echo \"\"
                cat << \"EOFSYSLOG\"
{
  \"logs\": [
    {\"timestamp\": \"2024-09-04T16:35:30Z\", \"host\": \"firewall-01\", \"facility\": \"security\", \"severity\": \"warning\", \"message\": \"Failed login attempt from 192.168.1.99\"},
    {\"timestamp\": \"2024-09-04T16:35:28Z\", \"host\": \"switch-core\", \"facility\": \"daemon\", \"severity\": \"info\", \"message\": \"Interface GigabitEthernet1/0/1 link up\"},
    {\"timestamp\": \"2024-09-04T16:35:25Z\", \"host\": \"router-edge\", \"facility\": \"kernel\", \"severity\": \"error\", \"message\": \"BGP session to 10.1.1.1 down\"}
  ],
  \"total_logs\": 8934,
  \"log_levels\": {\"error\": 12, \"warning\": 45, \"info\": 234, \"debug\": 67}
}
EOFSYSLOG
                ;;
            \"/snmp\" | \"/api/snmp\")
                echo \"HTTP/1.1 200 OK\"
                echo \"Content-Type: application/json\"
                echo \"Access-Control-Allow-Origin: *\"
                echo \"Connection: close\"
                echo \"\"
                cat << \"EOFSNMP\"
{
  \"devices\": [
    {\"ip\": \"192.168.1.1\", \"hostname\": \"router-edge\", \"uptime\": \"45 days, 12:34:56\", \"interfaces\": [{\"name\": \"GigabitEthernet0/0\", \"status\": \"up\", \"in_octets\": 2847563421, \"out_octets\": 1934856734}]},
    {\"ip\": \"192.168.1.10\", \"hostname\": \"switch-core\", \"uptime\": \"23 days, 08:15:42\", \"interfaces\": [{\"name\": \"FastEthernet1/0/1\", \"status\": \"up\", \"in_octets\": 847563421, \"out_octets\": 534856734}]}
  ],
  \"total_devices\": 12,
  \"device_status\": {\"online\": 11, \"offline\": 1, \"warning\": 2}
}
EOFSNMP
                ;;
            *)
                echo \"HTTP/1.1 404 Not Found\"
                echo \"Content-Type: application/json\"
                echo \"Access-Control-Allow-Origin: *\"
                echo \"Connection: close\"
                echo \"\"
                echo \"{\\\"error\\\": \\\"Not found\\\", \\\"path\\\": \\\"\$path\\\"}\"
                ;;
        esac
    "'

    # If socat exits, wait a moment and restart
    log "HTTP server stopped, restarting in 5 seconds..."
    sleep 5
done
