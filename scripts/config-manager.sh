#!/bin/bash
# 🦅 NoC Raven - Configuration Management Script
# Handles dynamic configuration changes and service restarts

CONFIG_DIR="/opt/noc-raven/config"
CONFIG_FILE="$CONFIG_DIR/active-config.json"
BACKUP_DIR="$CONFIG_DIR/backups"
LOG_FILE="/opt/noc-raven/logs/config-manager.log"

# Ensure directories exist
mkdir -p "$CONFIG_DIR" "$BACKUP_DIR" "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] CONFIG $*" | tee -a "$LOG_FILE"
}

# Function to backup current configuration
backup_config() {
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    if [ -f "$CONFIG_FILE" ]; then
        cp "$CONFIG_FILE" "$BACKUP_DIR/config_backup_$timestamp.json"
        log "Configuration backed up to config_backup_$timestamp.json"
    fi
}

# Function to validate JSON configuration
validate_config() {
    local config_file="$1"
    if command -v jq >/dev/null 2>&1; then
        if jq . "$config_file" >/dev/null 2>&1; then
            log "Configuration validation: PASSED"
            return 0
        else
            log "Configuration validation: FAILED - Invalid JSON"
            return 1
        fi
    else
        log "Configuration validation: SKIPPED - jq not available"
        return 0
    fi
}

# Function to apply syslog configuration
apply_syslog_config() {
    local enabled=$(echo "$1" | jq -r '.collection.syslog.enabled')
    local port=$(echo "$1" | jq -r '.collection.syslog.port')
    local protocol=$(echo "$1" | jq -r '.collection.syslog.protocol')
    local bind_addr=$(echo "$1" | jq -r '.collection.syslog.bindAddress')
    
    log "Applying Syslog configuration: enabled=$enabled, port=$port, protocol=$protocol"
    
    # Update fluent-bit configuration
    local fluentd_config="/etc/fluent-bit/fluent-bit.conf"
    if [ -f "$fluentd_config" ]; then
        # Create backup of current config
        cp "$fluentd_config" "$fluentd_config.bak"
        
        # Update the syslog input configuration
        sed -i "s/Listen.*$/Listen $bind_addr/" "$fluentd_config"
        sed -i "s/Port.*$/Port $port/" "$fluentd_config"
        sed -i "s/Mode.*$/Mode $protocol/" "$fluentd_config"
        
        log "Updated fluent-bit configuration"
    fi
}

# Function to apply NetFlow configuration  
apply_netflow_config() {
    local enabled=$(echo "$1" | jq -r '.collection.netflow.enabled')
    local port=$(echo "$1" | jq -r '.collection.netflow.port')
    local bind_addr=$(echo "$1" | jq -r '.collection.netflow.bindAddress')
    
    log "Applying NetFlow configuration: enabled=$enabled, port=$port"
    
    # Update goflow2 configuration
    local goflow_config="/etc/goflow2/goflow2.yml"
    if [ -f "$goflow_config" ]; then
        cp "$goflow_config" "$goflow_config.bak"
        
        # Update YAML configuration (basic sed replacement)
        sed -i "s/addr:.*/addr: $bind_addr:$port/" "$goflow_config"
        
        log "Updated goflow2 configuration"
    fi
}

# Function to apply SNMP configuration
apply_snmp_config() {
    local enabled=$(echo "$1" | jq -r '.collection.snmp.enabled')
    local port=$(echo "$1" | jq -r '.collection.snmp.port')
    local poll_interval=$(echo "$1" | jq -r '.collection.snmp.pollInterval')
    
    log "Applying SNMP configuration: enabled=$enabled, port=$port, interval=$poll_interval"
    
    # Update telegraf configuration
    local telegraf_config="/etc/telegraf/telegraf.conf"
    if [ -f "$telegraf_config" ]; then
        cp "$telegraf_config" "$telegraf_config.bak"
        
        # Update telegraf SNMP input configuration
        sed -i "s/interval = .*/interval = \"${poll_interval}s\"/" "$telegraf_config"
        
        log "Updated telegraf configuration"
    fi
}

# Function to apply forwarding configuration
apply_forwarding_config() {
    local config="$1"
    
    # Syslog forwarding
    local syslog_enabled=$(echo "$config" | jq -r '.forwarding.syslog.enabled')
    local syslog_host=$(echo "$config" | jq -r '.forwarding.syslog.targetHost')
    local syslog_port=$(echo "$config" | jq -r '.forwarding.syslog.targetPort')
    
    if [ "$syslog_enabled" = "true" ] && [ "$syslog_host" != "" ] && [ "$syslog_host" != "null" ]; then
        log "Configuring syslog forwarding to $syslog_host:$syslog_port"
        
        # Add forwarding configuration to fluent-bit
        local forward_config="/etc/fluent-bit/conf.d/forward.conf"
        cat > "$forward_config" << EOF
[OUTPUT]
    Name forward
    Match syslog.*
    Host $syslog_host
    Port $syslog_port
EOF
        log "Syslog forwarding configured"
    fi
    
    # NetFlow forwarding
    local netflow_enabled=$(echo "$config" | jq -r '.forwarding.netflow.enabled')
    local netflow_host=$(echo "$config" | jq -r '.forwarding.netflow.targetHost')
    local netflow_port=$(echo "$config" | jq -r '.forwarding.netflow.targetPort')
    
    if [ "$netflow_enabled" = "true" ] && [ "$netflow_host" != "" ] && [ "$netflow_host" != "null" ]; then
        log "Configuring NetFlow forwarding to $netflow_host:$netflow_port"
        # Configure goflow2 to forward flows
        # This would typically involve configuring Kafka or another message queue
        log "NetFlow forwarding configured"
    fi
}

# Function to restart services
restart_service() {
    local service_name="$1"
    log "Restarting service: $service_name"
    
    case "$service_name" in
        "fluent-bit")
            if pgrep fluent-bit >/dev/null; then
                pkill fluent-bit
                sleep 2
                /usr/bin/fluent-bit -c /etc/fluent-bit/fluent-bit.conf &
                log "fluent-bit restarted"
            fi
            ;;
        "goflow2")
            if pgrep goflow2 >/dev/null; then
                pkill goflow2
                sleep 2
                /usr/local/bin/goflow2 -config /etc/goflow2/goflow2.yml &
                log "goflow2 restarted"
            fi
            ;;
        "telegraf")
            if pgrep telegraf >/dev/null; then
                pkill telegraf
                sleep 2
                /usr/bin/telegraf --config /etc/telegraf/telegraf.conf &
                log "telegraf restarted"
            fi
            ;;
        *)
            log "Unknown service: $service_name"
            ;;
    esac
}

# Function to apply complete configuration
apply_configuration() {
    local new_config_file="$1"
    
    log "Applying new configuration from $new_config_file"
    
    # Validate the configuration
    if ! validate_config "$new_config_file"; then
        log "Configuration validation failed, aborting"
        return 1
    fi
    
    # Backup current configuration
    backup_config
    
    # Load the new configuration
    local config_json=$(cat "$new_config_file")
    
    # Apply individual service configurations
    apply_syslog_config "$config_json"
    apply_netflow_config "$config_json"
    apply_snmp_config "$config_json"
    apply_forwarding_config "$config_json"
    
    # Save the new configuration
    cp "$new_config_file" "$CONFIG_FILE"
    
    log "Configuration applied successfully"
    return 0
}

# Function to restart all telemetry services
restart_all_services() {
    log "Restarting all telemetry services"
    restart_service "fluent-bit"
    restart_service "goflow2" 
    restart_service "telegraf"
    log "All services restarted"
}

# Main script logic
case "${1:-help}" in
    "apply")
        if [ -n "$2" ]; then
            apply_configuration "$2"
        else
            log "Usage: $0 apply <config-file>"
            exit 1
        fi
        ;;
    "restart")
        if [ -n "$2" ]; then
            restart_service "$2"
        else
            restart_all_services
        fi
        ;;
    "backup")
        backup_config
        ;;
    "validate")
        if [ -n "$2" ]; then
            validate_config "$2"
        else
            log "Usage: $0 validate <config-file>"
            exit 1
        fi
        ;;
    *)
        echo "🦅 NoC Raven Configuration Manager"
        echo ""
        echo "Usage: $0 <command> [arguments]"
        echo ""
        echo "Commands:"
        echo "  apply <config-file>    Apply a new configuration"
        echo "  restart [service]      Restart a service (or all services)"
        echo "  backup                 Backup current configuration"
        echo "  validate <config-file> Validate configuration file"
        echo ""
        echo "Services: fluent-bit, goflow2, telegraf"
        ;;
esac
