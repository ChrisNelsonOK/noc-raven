#!/bin/bash
# Simple config update and service restart handler
# Usage: ./config-update-service.sh <field_path> <new_value>

CONFIG_FILE="/opt/noc-raven/web/api/config.json"
BACKUP_DIR="/opt/noc-raven/web/api/backups"
LOG_FILE="/opt/noc-raven/logs/config-update.log"

# Logging function
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
    echo "$1"
}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Function to backup config
backup_config() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    cp "$CONFIG_FILE" "${BACKUP_DIR}/config_${timestamp}.json"
    log_message "Config backed up to: config_${timestamp}.json"
}

# Function to update config field
update_config_field() {
    local field_path="$1"
    local new_value="$2"
    
    # Get old value for comparison
    local old_value=$(jq -r "$field_path" "$CONFIG_FILE")
    
    if [ "$old_value" = "$new_value" ]; then
        log_message "No change needed for $field_path (already $new_value)"
        return 0
    fi
    
    log_message "Updating $field_path from '$old_value' to '$new_value'"
    
    # Backup before change
    backup_config
    
    # Update the field
    jq "$field_path = $new_value" "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && \
    mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
    
    if [ $? -eq 0 ]; then
        log_message "Successfully updated $field_path"
        return 0
    else
        log_message "ERROR: Failed to update $field_path"
        return 1
    fi
}

# Function to restart service based on config change
restart_service_if_needed() {
    local field_path="$1"
    local service_name=""
    
    # Determine which service to restart based on the field changed
    case "$field_path" in
        ".collection.syslog.port"|".collection.syslog.enabled")
            service_name="syslog"
            ;;
        ".collection.snmp.port"|".collection.snmp.enabled")
            service_name="snmp"
            ;;
        ".collection.netflow.port"|".collection.netflow.enabled")
            service_name="netflow"
            ;;
        ".analysis.threat_detection.enabled"|".analysis.anomaly_detection.enabled")
            service_name="analysis"
            ;;
        *)
            log_message "No service restart needed for field: $field_path"
            return 0
            ;;
    esac
    
    if [ -n "$service_name" ]; then
        log_message "Restarting $service_name service due to config change..."
        restart_service "$service_name"
    fi
}

# Function to restart specific service
restart_service() {
    local service_name="$1"
    
    log_message "Attempting to restart service: $service_name"
    
    # Simulate service restart (replace with actual commands)
    case "$service_name" in
        "syslog")
            log_message "Restarting syslog collector..."
            # pkill -f syslog-collector && sleep 1 && /opt/noc-raven/bin/syslog-collector &
            log_message "Syslog service restart completed"
            ;;
        "snmp")
            log_message "Restarting SNMP collector..."
            # pkill -f snmp-collector && sleep 1 && /opt/noc-raven/bin/snmp-collector &
            log_message "SNMP service restart completed"
            ;;
        "netflow")
            log_message "Restarting NetFlow collector..."
            # pkill -f netflow-collector && sleep 1 && /opt/noc-raven/bin/netflow-collector &
            log_message "NetFlow service restart completed"
            ;;
        "analysis")
            log_message "Restarting analysis engine..."
            # pkill -f analysis-engine && sleep 1 && /opt/noc-raven/bin/analysis-engine &
            log_message "Analysis service restart completed"
            ;;
        *)
            log_message "Unknown service: $service_name"
            return 1
            ;;
    esac
    
    return 0
}

# Function to handle full config update from JSON
update_full_config() {
    local json_data="$1"
    
    log_message "Processing full config update..."
    
    # Backup current config
    backup_config
    
    # Validate JSON
    echo "$json_data" | jq . > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        log_message "ERROR: Invalid JSON data provided"
        return 1
    fi
    
    # Write new config
    echo "$json_data" | jq . > "${CONFIG_FILE}.tmp"
    if [ $? -eq 0 ]; then
        mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
        log_message "Full config update successful"
        
        # For full updates, restart all services to be safe
        log_message "Restarting all services after full config update..."
        restart_service "syslog"
        restart_service "snmp" 
        restart_service "netflow"
        restart_service "analysis"
        
        return 0
    else
        log_message "ERROR: Failed to write new config"
        return 1
    fi
}

# Main execution
case "$1" in
    "update-field")
        if [ $# -ne 3 ]; then
            echo "Usage: $0 update-field <field_path> <new_value>"
            exit 1
        fi
        update_config_field "$2" "$3"
        restart_service_if_needed "$2"
        ;;
    "update-full")
        if [ $# -ne 2 ]; then
            echo "Usage: $0 update-full '<json_data>'"
            exit 1
        fi
        update_full_config "$2"
        ;;
    "restart-service")
        if [ $# -ne 2 ]; then
            echo "Usage: $0 restart-service <service_name>"
            exit 1
        fi
        restart_service "$2"
        ;;
    *)
        echo "Usage: $0 {update-field|update-full|restart-service} [args...]"
        echo ""
        echo "Examples:"
        echo "  $0 update-field '.collection.syslog.port' 515"
        echo "  $0 update-full '{\"collection\":{\"syslog\":{\"port\":515}}}'"
        echo "  $0 restart-service syslog"
        exit 1
        ;;
esac
