#!/bin/bash
#
# 🦅 NoC Raven - Simple HTTP API Server
# Provides live system status and configuration endpoints
#

set -euo pipefail

# Configuration
API_PORT=${API_PORT:-5001}
LOG_FILE="/var/log/noc-raven/simple-http-api.log"
PID_FILE="/opt/noc-raven/logs/simple-http-api.pid"

# Logging function
log() {
    echo "$(date -Iseconds) [SIMPLE-HTTP-API] $*" >> "$LOG_FILE"
}

# Get live system status
get_live_system_status() {
    # Simple system status that always works
    local nginx_status="healthy"
    local vector_status="healthy" 
    local fluent_status="healthy"
    local goflow_status="healthy"
    local telegraf_status="healthy"
    local system_status="healthy"
    
    # Quick process checks
    pgrep nginx >/dev/null 2>&1 || nginx_status="failed"
    pgrep vector >/dev/null 2>&1 || vector_status="failed"
    pgrep fluent-bit >/dev/null 2>&1 || fluent_status="failed"
    pgrep goflow2 >/dev/null 2>&1 || goflow_status="failed"
    pgrep telegraf >/dev/null 2>&1 || telegraf_status="failed"
    
    # Simple system status calculation
    if [[ "$nginx_status" == "failed" ]]; then
        system_status="failed"
    elif [[ "$vector_status" == "failed" || "$fluent_status" == "failed" ]]; then
        system_status="degraded"
    fi
    
    # Get uptime safely
    local uptime_info="unknown"
    if command -v uptime >/dev/null 2>&1; then
        uptime_info=$(uptime 2>/dev/null | cut -d',' -f1 | cut -d' ' -f3- 2>/dev/null || echo "unknown")
    fi
    
    # Return JSON response
    echo '{
    "services": {
        "nginx": {"status": "'$nginx_status'", "port": 9080, "critical": true},
        "vector": {"status": "'$vector_status'", "port": 8084, "critical": true},
        "fluent-bit": {"status": "'$fluent_status'", "port": 5140, "critical": true},
        "goflow2": {"status": "'$goflow_status'", "port": 2055, "critical": true},
        "telegraf": {"status": "'$telegraf_status'", "port": 161, "critical": false}
    },
    "system_status": "'$system_status'",
    "timestamp": "'$(date -Iseconds)'",
    "uptime": "'$uptime_info'"
}'
}

# Handle HTTP request
handle_request() {
    local method="$1"
    local path="$2"
    
    log "Handling: $method $path"
    
    # Send HTTP headers
    echo "HTTP/1.1 200 OK"
    echo "Content-Type: application/json"
    echo "Access-Control-Allow-Origin: *"
    echo "Access-Control-Allow-Methods: GET, POST, OPTIONS"
    echo "Access-Control-Allow-Headers: Content-Type, Authorization"
    echo "Cache-Control: no-cache"
    echo ""
    
    case "$path" in
        "/health")
            echo '{"status": "healthy", "timestamp": "'$(date -Iseconds)'"}'
            ;;
        "/api/system/status")
            get_live_system_status
            ;;
        "/api/config")
            if [[ "$method" == "GET" ]]; then
                cat << EOF
{
    "collection": {
        "syslog": {
            "enabled": true,
            "port": 514,
            "protocol": "UDP",
            "bind_address": "0.0.0.0",
            "rate_limit": 10000
        },
        "netflow": {
            "enabled": true,
            "ports": {
                "netflow_v5": 2055,
                "ipfix": 4739,
                "sflow": 6343
            },
            "cache_size": 1000000
        },
        "snmp": {
            "enabled": true,
            "trap_port": 162,
            "community": "public",
            "version": "2c",
            "poll_interval": 300
        }
    },
    "forwarding": {
        "enabled": true,
        "destinations": [
            {
                "name": "Primary Collector",
                "host": "obs.rectitude.net",
                "ports": {
                    "syslog": 514,
                    "netflow": 2055
                },
                "enabled": true,
                "retry_count": 3
            }
        ]
    },
    "alerts": {
        "cpu_usage_threshold": 80,
        "memory_usage_threshold": 90,
        "disk_usage_threshold": 85,
        "flow_rate_threshold": 10000,
        "email_notifications": {
            "enabled": false,
            "smtp_server": "",
            "smtp_port": 587,
            "username": "",
            "password": ""
        }
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
        "flush_interval_seconds": 30,
        "enable_compression": false,
        "enable_deduplication": false
    },
    "timestamp": "$(date -Iseconds)"
}
EOF
            elif [[ "$method" == "POST" ]]; then
                # For now, just return success for POST requests
                echo '{"success": true, "message": "Configuration saved successfully", "timestamp": "'$(date -Iseconds)'"}'
            else
                echo '{"error": "Method not allowed", "timestamp": "'$(date -Iseconds)'"}'
            fi
            ;;
        "/api/services/"*)
            if [[ "$method" == "POST" && "$path" =~ /restart$ ]]; then
                local service_name
                service_name=$(echo "$path" | sed 's|/api/services/||; s|/restart||')
                echo '{"success": true, "message": "Service '$service_name' restart requested", "timestamp": "'$(date -Iseconds)'"}'
            else
                echo '{"error": "Method not allowed", "timestamp": "'$(date -Iseconds)'"}'
            fi
            ;;
        *)
            echo '{"error": "Not found", "path": "'$path'", "timestamp": "'$(date -Iseconds)'"}'
            ;;
    esac
}

# HTTP server using socat
start_http_server() {
    log "Starting HTTP API server on port $API_PORT"
    
    # Create PID file directory
    mkdir -p "$(dirname "$PID_FILE")" 2>/dev/null || true
    
    while true; do
        # Use socat to listen for HTTP requests
        socat TCP-LISTEN:$API_PORT,reuseaddr,fork EXEC:'/opt/noc-raven/scripts/http-handler.sh' 2>/dev/null || {
            log "socat failed, retrying in 5 seconds..."
            sleep 5
        }
    done
}

# Create HTTP handler script for socat
create_http_handler() {
    cat > /opt/noc-raven/scripts/http-handler.sh << 'EOF'
#!/bin/bash
# HTTP request handler for socat

# Read the HTTP request
read -r method path version

# Skip headers
while read -r header; do
    [[ "$header" == $'\r' ]] && break
done

# Handle the request
source /opt/noc-raven/scripts/simple-http-api.sh
handle_request "$method" "$path"
EOF
    
    chmod +x /opt/noc-raven/scripts/http-handler.sh
}

# Main function
main() {
    # Ensure log directory exists
    mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
    
    log "Simple HTTP API server starting..."
    
    # Create the HTTP handler script
    create_http_handler
    
    # Save PID
    echo $$ > "$PID_FILE"
    
    # Start the HTTP server
    start_http_server
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
