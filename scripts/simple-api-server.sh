#!/bin/bash
# Simple API Server for NoC Raven Web Interface
# Uses netcat (nc) to serve HTTP responses in Alpine Linux

set -euo pipefail

# Configuration
API_PORT=3001
DATA_DIR="/data"
LOG_DIR="/var/log/noc-raven"

# Colors for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RESET='\033[0m'

log() {
    echo -e "${BLUE}[$(date -Iseconds)] API${RESET} $*"
}

log_success() {
    echo -e "${GREEN}[$(date -Iseconds)] API${RESET} $*"
}

# Get system metrics
get_system_metrics() {
    local cpu_usage=$(top -bn1 | grep 'CPU:' | awk '{print $2}' | sed 's/%us,//' | sed 's/us//' || echo "0")
    local memory_info=$(free | grep Mem)
    local memory_total=$(echo $memory_info | awk '{print $2}')
    local memory_used=$(echo $memory_info | awk '{print $3}')
    local memory_percent=0
    
    if [ "$memory_total" -gt 0 ]; then
        memory_percent=$(awk "BEGIN {printf \"%.1f\", ($memory_used/$memory_total)*100}")
    fi
    
    local disk_usage=$(df /data 2>/dev/null | tail -1 | awk '{print $5}' | sed 's/%//' || echo "0")
    local uptime_seconds=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo "0")
    
    cat << EOF
{
  "cpuUsage": ${cpu_usage:-0},
  "memoryUsage": ${memory_percent:-0},
  "diskUsage": ${disk_usage:-0},
  "uptime": ${uptime_seconds:-0},
  "networkIO": {"rx": 0, "tx": 0}
}
EOF
}

# Get service status
get_service_status() {
    local nginx_status=$(pgrep nginx >/dev/null && echo "true" || echo "false")
    local fluent_bit_status=$(pgrep fluent-bit >/dev/null && echo "true" || echo "false") 
    local goflow2_status=$(pgrep goflow2 >/dev/null && echo "true" || echo "false")
    local vector_status=$(pgrep vector >/dev/null && echo "true" || echo "false")
    local telegraf_status=$(pgrep telegraf >/dev/null && echo "true" || echo "false")
    
    cat << EOF
{
  "nginx": $nginx_status,
  "fluent-bit": $fluent_bit_status,
  "goflow2": $goflow2_status,
  "vector": $vector_status,
  "telegraf": $telegraf_status
}
EOF
}

# Get telemetry statistics  
get_telemetry_stats() {
    local flows_count=0
    local syslog_count=0
    local buffer_size="0B"
    
    # Count flow files
    if [ -d "$DATA_DIR/flows" ]; then
        flows_count=$(find "$DATA_DIR/flows" -name "*.log" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}' || echo "0")
    fi
    
    # Count syslog messages
    if [ -d "$DATA_DIR/syslog" ]; then
        syslog_count=$(find "$DATA_DIR/syslog" -name "*" -type f -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}' || echo "0")
    fi
    
    # Get buffer size
    buffer_size=$(du -sh "$DATA_DIR" 2>/dev/null | awk '{print $1}' || echo "0B")
    
    cat << EOF
{
  "flowsPerSecond": $(( flows_count / 60 )),
  "syslogMessages": $syslog_count,
  "snmpPolls": 0,
  "activeDevices": 0,
  "dataBuffer": "$buffer_size",
  "recentFlows": [],
  "recentSyslog": [],
  "recentSNMP": []
}
EOF
}

# Get system status
get_system_status() {
    local uptime_seconds=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo "0")
    local services=$(get_service_status)
    local metrics=$(get_system_metrics)
    local telemetry=$(get_telemetry_stats)
    
    cat << EOF
{
  "status": "connected",
  "uptime": $uptime_seconds,
  "timestamp": $(date +%s)000,
  "services": $services,
  "metrics": $metrics,
  "telemetryStats": $telemetry
}
EOF
}

# Get flow data
get_flows() {
    local flows_dir="$DATA_DIR/flows"
    local flows="[]"
    
    if [ -d "$flows_dir" ]; then
        local latest_file=$(find "$flows_dir" -name "*.log" -type f | sort | tail -1)
        if [ -n "$latest_file" ] && [ -f "$latest_file" ]; then
            # Get last 10 lines and convert to JSON array
            flows=$(tail -10 "$latest_file" 2>/dev/null | jq -R -s 'split("\n") | map(select(length > 0)) | map(try fromjson // {"data": .})' 2>/dev/null || echo "[]")
        fi
    fi
    
    cat << EOF
{
  "flows": $flows,
  "totalCount": $(echo $flows | jq 'length' 2>/dev/null || echo "0"),
  "timestamp": $(date +%s)000
}
EOF
}

# Get syslog data
get_syslog() {
    local syslog_dir="$DATA_DIR/syslog"  
    local logs="[]"
    
    if [ -d "$syslog_dir" ]; then
        local latest_file=$(find "$syslog_dir" -name "*" -type f | sort | tail -1)
        if [ -n "$latest_file" ] && [ -f "$latest_file" ]; then
            # Convert last 10 syslog lines to JSON
            logs='['
            local first=true
            tail -10 "$latest_file" 2>/dev/null | while IFS= read -r line; do
                if [ -n "$line" ]; then
                    if [ "$first" = false ]; then
                        echo -n ","
                    fi
                    echo -n "{\"timestamp\":$(date +%s)000,\"message\":\"$(echo "$line" | sed 's/"/\\"/g')\",\"facility\":\"local0\",\"severity\":\"info\",\"host\":\"unknown\"}"
                    first=false
                fi
            done
            logs+=']'
        fi
    fi
    
    cat << EOF
{
  "logs": $logs,
  "totalCount": $(echo $logs | jq 'length' 2>/dev/null || echo "0"),
  "timestamp": $(date +%s)000
}
EOF
}

# HTTP response handler
handle_request() {
    local method="$1"
    local path="$2"
    local response_body=""
    local content_type="application/json"
    local status_code="200 OK"
    
    case "$path" in
        "/api/health")
            response_body='{"status":"healthy","timestamp":'$(date +%s)'000,"uptime":'$(awk '{print int($1)}' /proc/uptime || echo "0")'}'
            ;;
        "/api/status")
            response_body=$(get_system_status)
            ;;
        "/api/metrics")
            response_body=$(get_system_metrics)
            ;;
        "/api/services")
            response_body=$(get_service_status)
            ;;
        "/api/flows"*)
            response_body=$(get_flows)
            ;;
        "/api/syslog"*)
            response_body=$(get_syslog)
            ;;
        "/api/snmp"*)
            response_body='{"polls":[],"totalCount":0,"timestamp":'$(date +%s)'000}'
            ;;
        "/api/config")
            response_body='{"hostname":"'$(hostname)'","timezone":"UTC","performance_profile":"balanced","buffer_size":"100GB"}'
            ;;
        *)
            status_code="404 Not Found"
            response_body='{"error":"Endpoint not found"}'
            ;;
    esac
    
    # Send HTTP response
    local content_length=${#response_body}
    
    cat << EOF
HTTP/1.1 $status_code
Content-Type: $content_type
Content-Length: $content_length
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Connection: close

$response_body
EOF
}

# Start the API server
start_server() {
    log_success "Starting simple API server on port $API_PORT"
    
    while true; do
        (
            read request
            method=$(echo "$request" | awk '{print $1}')
            path=$(echo "$request" | awk '{print $2}')
            
            # Read headers (until empty line)
            while read header && [ -n "$header" ] && [ "$header" != $'\r' ]; do
                :
            done
            
            log "Request: $method $path"
            handle_request "$method" "$path"
        ) | nc -l -p $API_PORT -q 1
    done
}

# Signal handlers
cleanup() {
    log "Shutting down API server..."
    exit 0
}

trap cleanup SIGTERM SIGINT

# Main execution
log_success "NoC Raven Simple API Server starting..."
start_server
