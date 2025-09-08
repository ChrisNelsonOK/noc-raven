#!/bin/bash
# 🦅 NoC Raven - Ultra Simple Netcat HTTP Server
# Works with BusyBox netcat

API_PORT=3001
LOG_FILE="/opt/noc-raven/logs/simple-api.log"

mkdir -p /opt/noc-raven/logs

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] API $*" | tee -a "$LOG_FILE"
}

log "NoC Raven Netcat HTTP API Server starting on port $API_PORT"

# Main server loop
while true; do
    log "Waiting for request..."
    
    # Use nc to listen and handle one request at a time
    {
        while IFS= read -r line; do
            line=$(echo "$line" | tr -d '\r\n')
            if [[ "$line" =~ ^GET\ (.*)\ HTTP ]]; then
                path="${BASH_REMATCH[1]}"
                log "Request: GET $path"
                
                # Send appropriate response
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
                        echo '{"status": "ok", "timestamp": "'$(date -Iseconds)'", "uptime": "1 day, 2:34:56", "cpu_usage": 25.4, "memory_usage": 67.8, "disk_usage": 45.2}'
                        ;;
                    "/metrics"|"/api/metrics")
                        echo "HTTP/1.1 200 OK"
                        echo "Content-Type: application/json"
                        echo "Access-Control-Allow-Origin: *"
                        echo "Connection: close"
                        echo ""
                        echo '{"metrics": {"flows_per_second": 142, "syslog_messages_per_minute": 87}, "performance": {"avg_response_time_ms": 45}}'
                        ;;
                    "/services"|"/api/services")
                        echo "HTTP/1.1 200 OK"
                        echo "Content-Type: application/json"
                        echo "Access-Control-Allow-Origin: *"
                        echo "Connection: close"
                        echo ""
                        echo '{"services": [{"name": "nginx", "status": "running"}, {"name": "goflow2", "status": "running"}]}'
                        ;;
                    "/flows"|"/api/flows")
                        echo "HTTP/1.1 200 OK"
                        echo "Content-Type: application/json"
                        echo "Access-Control-Allow-Origin: *"
                        echo "Connection: close"
                        echo ""
                        echo '{"flows": [{"src_ip": "192.168.1.100", "dst_ip": "10.0.0.50", "protocol": "TCP", "bytes": 45632}], "total_flows": 1247}'
                        ;;
                    "/syslog"|"/api/syslog")
                        echo "HTTP/1.1 200 OK"
                        echo "Content-Type: application/json"
                        echo "Access-Control-Allow-Origin: *"
                        echo "Connection: close"
                        echo ""
                        echo '{"logs": [{"timestamp": "2024-09-04T16:35:30Z", "host": "firewall-01", "message": "Failed login attempt"}], "total_logs": 8934}'
                        ;;
                    "/snmp"|"/api/snmp")
                        echo "HTTP/1.1 200 OK"
                        echo "Content-Type: application/json"
                        echo "Access-Control-Allow-Origin: *"
                        echo "Connection: close"
                        echo ""
                        echo '{"devices": [{"ip": "192.168.1.1", "hostname": "router-edge", "status": "up"}], "total_devices": 12}'
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
                break
            elif [[ "$line" == "" ]]; then
                break
            fi
        done
    } | nc -l -p $API_PORT -q 1
    
    # Small delay before next request
    sleep 0.1
done
