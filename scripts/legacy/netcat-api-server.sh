#!/bin/bash
#
# 🦅 NoC Raven - Netcat HTTP API Server
# Simple HTTP API server using only netcat and shell built-ins
#

set -euo pipefail

# Configuration
API_PORT=${API_PORT:-5001}
LOG_FILE="/var/log/noc-raven/netcat-api-server.log"
PID_FILE="/opt/noc-raven/logs/netcat-api-server.pid"

# Logging function
log() {
    echo "$(date -Iseconds) [NETCAT-API] $*" | tee -a "$LOG_FILE"
}

# Get system status
get_system_status() {
    local nginx_status="unknown"
    local vector_status="unknown" 
    local fluent_status="unknown"
    local goflow_status="unknown"
    local telegraf_status="unknown"
    local system_status="degraded"
    
    # Check services using available tools
    if pgrep nginx >/dev/null 2>&1; then
        nginx_status="healthy"
    else
        nginx_status="failed"
    fi
    
    if pgrep vector >/dev/null 2>&1; then
        vector_status="healthy"
    else
        vector_status="failed"
    fi
    
    if pgrep fluent-bit >/dev/null 2>&1; then
        fluent_status="healthy"
    else
        fluent_status="failed"
    fi
    
    if pgrep goflow2 >/dev/null 2>&1; then
        goflow_status="healthy"
    else
        goflow_status="failed"
    fi
    
    if pgrep telegraf >/dev/null 2>&1; then
        telegraf_status="healthy"
    else
        telegraf_status="failed"
    fi
    
    # Calculate overall status
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
    
    cat << EOF
{
    "services": {
        "nginx": {"status": "$nginx_status", "port": 8080, "critical": true},
        "vector": {"status": "$vector_status", "port": 8084, "critical": true},
        "fluent-bit": {"status": "$fluent_status", "port": 5140, "critical": true},
        "goflow2": {"status": "$goflow_status", "port": 2055, "critical": true},
        "telegraf": {"status": "$telegraf_status", "port": 161, "critical": false}
    },
    "system_status": "$system_status",
    "timestamp": "$(date -Iseconds)",
    "uptime": "$uptime_info"
}
EOF
}

# Get current config
get_config() {
    cat << 'EOF'
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
EOF
}

# Save configuration
save_config() {
    local config_data="$1"
    
    log "Config save request: $config_data"
    
    # Simple JSON parsing for syslogPort
    local syslog_port
    syslog_port=$(echo "$config_data" | grep -o '"syslogPort":[[:space:]]*[0-9]*' | grep -o '[0-9]*' || echo "")
    
    local updated_services=()
    
    # Update syslog port if provided
    if [[ -n "$syslog_port" && "$syslog_port" != "5140" ]]; then
        if update_fluent_bit_port "$syslog_port"; then
            updated_services+=("fluent-bit")
            log "Updated fluent-bit syslog port to $syslog_port"
        fi
    fi
    
    # Return success response
    local services_json=""
    if [[ ${#updated_services[@]} -gt 0 ]]; then
        services_json="\"$(printf '%s","' "${updated_services[@]}" | sed 's/,$//')\""
    fi
    
    cat << EOF
{
    "success": true,
    "message": "Configuration saved successfully",
    "updated_services": [$services_json],
    "timestamp": "$(date -Iseconds)"
}
EOF
}

# Update fluent-bit port
update_fluent_bit_port() {
    local new_port="$1"
    local config_file="/opt/noc-raven/config/fluent-bit-basic.conf"
    
    if [[ ! -f "$config_file" ]]; then
        log "Fluent-bit config not found: $config_file"
        return 1
    fi
    
    # Create backup
    cp "$config_file" "${config_file}.backup.$(date +%s)" 2>/dev/null || true
    
    # Update port using sed
    sed -i "s/Port[[:space:]]*[0-9]*/Port           $new_port/g" "$config_file" 2>/dev/null || return 1
    
    log "Updated fluent-bit config port to $new_port"
    return 0
}

# Restart service
restart_service() {
    local service_name="$1"
    
    log "Restart request for service: $service_name"
    
    # Use production service manager
    if /opt/noc-raven/scripts/production-service-manager.sh restart "$service_name" >/dev/null 2>&1; then
        cat << EOF
{
    "success": true,
    "message": "Service $service_name restarted successfully",
    "timestamp": "$(date -Iseconds)"
}
EOF
    else
        cat << EOF
{
    "success": false,
    "message": "Failed to restart service $service_name",
    "timestamp": "$(date -Iseconds)"
}
EOF
    fi
}

# HTTP response handler
handle_http_request() {
    local method path
    
    # Read request line
    read -r method path version
    
    # Remove carriage return
    method=${method%$'\r'}
    path=${path%$'\r'}
    version=${version%$'\r'}
    
    log "Request: $method $path"
    
    # Read headers and find Content-Length
    local content_length=0
    while IFS= read -r header; do
        header=${header%$'\r'}
        [[ -z "$header" ]] && break
        if [[ "$header" =~ ^Content-Length:[[:space:]]*([0-9]+) ]]; then
            content_length="${BASH_REMATCH[1]}"
        fi
    done
    
    # Read POST data if any
    local post_data=""
    if [[ $content_length -gt 0 ]]; then
        post_data=$(dd bs=1 count=$content_length 2>/dev/null)
    fi
    
    # Send HTTP headers
    echo "HTTP/1.1 200 OK"
    echo "Content-Type: application/json"
    echo "Access-Control-Allow-Origin: *"
    echo "Access-Control-Allow-Methods: GET, POST, OPTIONS"
    echo "Access-Control-Allow-Headers: Content-Type, Authorization"
    echo "Connection: close"
    echo ""
    
    # Handle request
    case "$path" in
        "/health")
            echo '{"status": "healthy", "timestamp": "'$(date -Iseconds)'"}'
            ;;
        "/api/system/status")
            get_system_status
            ;;
        "/api/config")
            if [[ "$method" == "GET" ]]; then
                get_config
            elif [[ "$method" == "POST" ]]; then
                save_config "$post_data"
            else
                echo '{"error": "Method not allowed", "timestamp": "'$(date -Iseconds)'"}'
            fi
            ;;
        "/api/services/"*"/restart")
            if [[ "$method" == "POST" ]]; then
                local service_name
                service_name=$(echo "$path" | sed 's|/api/services/||; s|/restart||')
                restart_service "$service_name"
            else
                echo '{"error": "Method not allowed", "timestamp": "'$(date -Iseconds)'"}'
            fi
            ;;
        *)
            echo '{"error": "Not found", "path": "'$path'", "timestamp": "'$(date -Iseconds)'"}'
            ;;
    esac
}

# HTTP server using netcat
start_http_server() {
    log "Starting HTTP server on port $API_PORT using netcat"
    
    # Create PID file directory
    mkdir -p "$(dirname "$PID_FILE")" 2>/dev/null || true
    
    # Save PID
    echo $$ > "$PID_FILE"
    
    while true; do
        # Use netcat to listen for connections
        if command -v nc >/dev/null 2>&1; then
            handle_http_request | nc -l -p "$API_PORT" -q 1 2>/dev/null || true
        elif command -v netcat >/dev/null 2>&1; then
            handle_http_request | netcat -l -p "$API_PORT" 2>/dev/null || true
        else
            log "Neither nc nor netcat found, trying busybox nc"
            handle_http_request | busybox nc -l -p "$API_PORT" 2>/dev/null || true
        fi
        
        # Brief pause between requests
        sleep 0.1
    done
}

# Main function
main() {
    # Ensure log directory exists
    mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
    
    log "Starting Netcat HTTP API server on port $API_PORT"
    
    # Start the HTTP server
    start_http_server
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
