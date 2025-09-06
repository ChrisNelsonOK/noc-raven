#!/bin/bash
#
# 🦅 NoC Raven - Shell-based API Handler
# Handles configuration updates and service management via CGI-like interface
#

set -euo pipefail

# Configuration
LOG_FILE="/var/log/noc-raven/api-handler.log"
CONFIG_BASE="/etc/noc-raven"
API_DIR="/opt/noc-raven/web/api"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [API-HANDLER] $*" | tee -a "$LOG_FILE"
}

# Get real-time service status
get_service_status() {
    local status_file="/tmp/service_status.json"
    
    # Check service processes and ports
    local nginx_status="unknown"
    local vector_status="unknown" 
    local fluent_status="unknown"
    local goflow_status="unknown"
    local telegraf_status="unknown"
    local system_status="degraded"
    
    # Check nginx
    if pgrep nginx >/dev/null && netstat -ln 2>/dev/null | grep -q ":8080 "; then
        nginx_status="healthy"
    elif pgrep nginx >/dev/null; then
        nginx_status="degraded" 
    else
        nginx_status="failed"
    fi
    
    # Check vector
    if pgrep vector >/dev/null && netstat -ln 2>/dev/null | grep -q ":8084 "; then
        vector_status="healthy"
    elif pgrep vector >/dev/null; then
        vector_status="degraded"
    else
        vector_status="failed"
    fi
    
    # Check fluent-bit
    if pgrep fluent-bit >/dev/null; then
        fluent_status="healthy"
    else
        fluent_status="failed"
    fi
    
    # Check goflow2
    if pgrep goflow2 >/dev/null && netstat -lun 2>/dev/null | grep -q ":2055 "; then
        goflow_status="healthy"
    elif pgrep goflow2 >/dev/null; then
        goflow_status="degraded"
    else
        goflow_status="failed"
    fi
    
    # Check telegraf
    if pgrep telegraf >/dev/null; then
        telegraf_status="healthy"
    else
        telegraf_status="failed"
    fi
    
    # Calculate system status
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
    uptime_info=$(uptime | awk -F'up ' '{print $2}' | awk -F',' '{print $1}' | xargs || echo "unknown")
    
    # Generate JSON response
    cat > "$status_file" << EOF
{
    "services": {
        "nginx": {
            "status": "$nginx_status",
            "port": 8080,
            "critical": true
        },
        "vector": {
            "status": "$vector_status", 
            "port": 8084,
            "critical": true
        },
        "fluent-bit": {
            "status": "$fluent_status",
            "port": 5140,
            "critical": true
        },
        "goflow2": {
            "status": "$goflow_status",
            "port": 2055,
            "critical": true
        },
        "telegraf": {
            "status": "$telegraf_status",
            "port": 161,
            "critical": false
        }
    },
    "system_status": "$system_status",
    "timestamp": "$(date -Iseconds)",
    "uptime": "$uptime_info"
}
EOF
    
    cat "$status_file"
}

# Get current configuration
get_config() {
    local config_file="/tmp/current_config.json"
    
    # Read current syslog port from fluent-bit config
    local syslog_port=5140
    if [[ -f "/opt/noc-raven/config/fluent-bit-basic.conf" ]]; then
        syslog_port=$(grep -A 10 "\[INPUT\]" /opt/noc-raven/config/fluent-bit-basic.conf 2>/dev/null | grep "Port" | head -1 | awk '{print $2}' || echo 5140)
    fi
    
    # Read current netflow port from goflow2 config
    local netflow_port=2055
    if [[ -f "/opt/noc-raven/scripts/start-goflow2-production.sh" ]]; then
        netflow_port=$(grep -o "netflow://:\[0-9\]*" /opt/noc-raven/scripts/start-goflow2-production.sh 2>/dev/null | grep -o "[0-9]*" | head -1 || echo 2055)
    fi
    
    cat > "$config_file" << EOF
{
    "collection": {
        "syslogPort": $syslog_port,
        "netflowPort": $netflow_port,
        "snmpPort": 161,
        "wmiPort": 6343
    },
    "forwarding": {
        "destinations": [
            {
                "name": "Primary Collector",
                "host": "obs.rectitude.net",
                "port": 1514,
                "protocol": "UDP"
            }
        ]
    },
    "alerts": {
        "enabled": false
    },
    "timestamp": "$(date -Iseconds)"
}
EOF
    
    cat "$config_file"
}

# Save configuration
save_config() {
    local config_data="$1"
    local result_file="/tmp/save_result.json"
    
    log "Received configuration update: $config_data"
    
    # Parse JSON using simple grep/sed (basic parsing)
    local syslog_port
    local netflow_port
    
    syslog_port=$(echo "$config_data" | grep -o '"syslogPort":[[:space:]]*[0-9]*' | grep -o '[0-9]*' || echo "")
    netflow_port=$(echo "$config_data" | grep -o '"netflowPort":[[:space:]]*[0-9]*' | grep -o '[0-9]*' || echo "")
    
    local updated_services=()
    
    # Update syslog port if provided
    if [[ -n "$syslog_port" && "$syslog_port" != "5140" ]]; then
        if update_fluent_bit_port "$syslog_port"; then
            updated_services+=("fluent-bit")
            log "Updated fluent-bit syslog port to $syslog_port"
        else
            log "Failed to update fluent-bit port"
        fi
    fi
    
    # Update netflow port if provided  
    if [[ -n "$netflow_port" && "$netflow_port" != "2055" ]]; then
        if update_goflow2_port "$netflow_port"; then
            updated_services+=("goflow2")
            log "Updated goflow2 netflow port to $netflow_port"
        else
            log "Failed to update goflow2 port"
        fi
    fi
    
    # Save timestamp of last update
    date -Iseconds > "/etc/noc-raven/last_config_update" 2>/dev/null || true
    
    cat > "$result_file" << EOF
{
    "success": true,
    "message": "Configuration saved successfully",
    "updated_services": [$(printf '"%s",' "${updated_services[@]}" | sed 's/,$//')],
    "timestamp": "$(date -Iseconds)"
}
EOF
    
    cat "$result_file"
}

# Update fluent-bit syslog port
update_fluent_bit_port() {
    local new_port="$1"
    local config_file="/opt/noc-raven/config/fluent-bit-basic.conf"
    
    if [[ ! -f "$config_file" ]]; then
        log "Fluent-bit config file not found: $config_file"
        return 1
    fi
    
    # Create backup
    cp "$config_file" "${config_file}.backup.$(date +%s)" 2>/dev/null || true
    
    # Update port in config file (simple sed replacement)
    sed -i.tmp "s/Port[[:space:]]*[0-9]*/Port           $new_port/g" "$config_file" 2>/dev/null || return 1
    rm -f "${config_file}.tmp" 2>/dev/null || true
    
    return 0
}

# Update goflow2 netflow port
update_goflow2_port() {
    local new_port="$1"
    local startup_script="/opt/noc-raven/scripts/start-goflow2-production.sh"
    
    if [[ ! -f "$startup_script" ]]; then
        log "GoFlow2 startup script not found: $startup_script"
        return 1
    fi
    
    # Create backup
    cp "$startup_script" "${startup_script}.backup.$(date +%s)" 2>/dev/null || true
    
    # Update port in startup script
    sed -i.tmp "s/:2055/:$new_port/g" "$startup_script" 2>/dev/null || return 1
    rm -f "${startup_script}.tmp" 2>/dev/null || true
    
    return 0
}

# Restart service
restart_service() {
    local service_name="$1"
    local result_file="/tmp/restart_result.json"
    
    log "Received restart request for service: $service_name"
    
    # Map service names to process names
    local process_name="$service_name"
    case "$service_name" in
        "fluent-bit")
            process_name="fluent-bit"
            ;;
        "goflow2")
            process_name="goflow2"
            ;;
        "nginx")
            process_name="nginx"
            ;;
        "vector")
            process_name="vector"
            ;;
        "telegraf")
            process_name="telegraf"
            ;;
    esac
    
    # Kill existing process
    if pgrep "$process_name" >/dev/null; then
        log "Stopping $service_name..."
        pkill "$process_name" 2>/dev/null || true
        sleep 2
    fi
    
    # Restart using production service manager if available
    local restart_success=false
    if [[ -f "/opt/noc-raven/scripts/production-service-manager.sh" ]]; then
        if "/opt/noc-raven/scripts/production-service-manager.sh" restart "$service_name" >/dev/null 2>&1; then
            restart_success=true
        fi
    fi
    
    if [[ "$restart_success" == "true" ]]; then
        cat > "$result_file" << EOF
{
    "success": true,
    "message": "Service $service_name restarted successfully",
    "timestamp": "$(date -Iseconds)"
}
EOF
    else
        cat > "$result_file" << EOF
{
    "success": false, 
    "message": "Failed to restart service $service_name",
    "timestamp": "$(date -Iseconds)"
}
EOF
    fi
    
    cat "$result_file"
}

# Main API handler
main() {
    local request_method="${REQUEST_METHOD:-GET}"
    local path_info="${PATH_INFO:-/}"
    local query_string="${QUERY_STRING:-}"
    
    # Ensure log directory exists
    mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
    
    log "API request: $request_method $path_info"
    
    # Set content type
    echo "Content-Type: application/json"
    echo "Access-Control-Allow-Origin: *"
    echo "Access-Control-Allow-Methods: GET, POST, OPTIONS"
    echo "Access-Control-Allow-Headers: Content-Type, Authorization"
    echo ""
    
    case "$path_info" in
        "/health")
            echo '{"status": "healthy", "timestamp": "'$(date -Iseconds)'"}'
            ;;
        "/api/system/status")
            get_service_status
            ;;
        "/api/config")
            if [[ "$request_method" == "GET" ]]; then
                get_config
            elif [[ "$request_method" == "POST" ]]; then
                local post_data
                post_data=$(cat)
                save_config "$post_data"
            else
                echo '{"error": "Method not allowed", "timestamp": "'$(date -Iseconds)'"}'
            fi
            ;;
        "/api/services/"*)
            if [[ "$request_method" == "POST" && "$path_info" =~ /restart$ ]]; then
                local service_name
                service_name=$(echo "$path_info" | sed 's|/api/services/||; s|/restart||')
                restart_service "$service_name"
            else
                echo '{"error": "Method not allowed", "timestamp": "'$(date -Iseconds)'"}'
            fi
            ;;
        *)
            echo '{"error": "Not found", "timestamp": "'$(date -Iseconds)'"}'
            ;;
    esac
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
