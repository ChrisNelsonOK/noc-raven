#!/bin/bash

###################################################################################
# 🦅 NoC Raven - SystemCtl Replacement Script
# Container-friendly systemctl replacement for managing services via supervisor
###################################################################################

set -euo pipefail

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Service mapping
declare -A SERVICE_MAP=(
    ["fluent-bit"]="fluent-bit"
    ["vector"]="vector"
    ["telegraf"]="telegraf"
    ["nginx"]="nginx"
    ["goflow2"]="goflow2"
    ["supervisord"]="supervisord"
)

# Log function
log() {
    local level=$1
    shift
    echo -e "[${level}] $*" >&2
}

# Check if supervisorctl is available
check_supervisor() {
    if ! command -v supervisorctl > /dev/null; then
        log "ERROR" "supervisorctl not found - supervisor may not be installed"
        return 1
    fi
    
    # Check if supervisor is running
    if ! pgrep supervisord > /dev/null; then
        log "WARN" "supervisord is not running"
        return 1
    fi
    
    return 0
}

# Map service name to supervisor program name
map_service_name() {
    local service_name=$1
    
    # Remove .service suffix if present
    service_name=${service_name%.service}
    
    # Return mapped name or original if no mapping exists
    echo "${SERVICE_MAP[$service_name]:-$service_name}"
}

# Start service
start_service() {
    local service_name=$(map_service_name "$1")
    
    if ! check_supervisor; then
        return 1
    fi
    
    echo -e "${BLUE}Starting service: ${service_name}${NC}"
    
    if supervisorctl start "$service_name" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Service ${service_name} started successfully"
        return 0
    else
        echo -e "${RED}✗${NC} Failed to start service ${service_name}"
        return 1
    fi
}

# Stop service
stop_service() {
    local service_name=$(map_service_name "$1")
    
    if ! check_supervisor; then
        return 1
    fi
    
    echo -e "${BLUE}Stopping service: ${service_name}${NC}"
    
    if supervisorctl stop "$service_name" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Service ${service_name} stopped successfully"
        return 0
    else
        echo -e "${RED}✗${NC} Failed to stop service ${service_name}"
        return 1
    fi
}

# Restart service
restart_service() {
    local service_name=$(map_service_name "$1")
    
    if ! check_supervisor; then
        return 1
    fi
    
    echo -e "${BLUE}Restarting service: ${service_name}${NC}"
    
    if supervisorctl restart "$service_name" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Service ${service_name} restarted successfully"
        return 0
    else
        echo -e "${RED}✗${NC} Failed to restart service ${service_name}"
        return 1
    fi
}

# Reload service configuration
reload_service() {
    local service_name=$(map_service_name "$1")
    
    if ! check_supervisor; then
        return 1
    fi
    
    echo -e "${BLUE}Reloading service configuration: ${service_name}${NC}"
    
    # For supervisor, we need to reread and update
    if supervisorctl reread && supervisorctl update "$service_name" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Service ${service_name} configuration reloaded"
        return 0
    else
        echo -e "${RED}✗${NC} Failed to reload service ${service_name} configuration"
        return 1
    fi
}

# Enable service (supervisor equivalent)
enable_service() {
    local service_name=$(map_service_name "$1")
    
    if ! check_supervisor; then
        return 1
    fi
    
    echo -e "${BLUE}Enabling service: ${service_name}${NC}"
    
    # In supervisor context, we add to autostart
    if supervisorctl reread && supervisorctl add "$service_name" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Service ${service_name} enabled"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} Service ${service_name} may already be enabled or configuration needs update"
        return 0
    fi
}

# Disable service (supervisor equivalent)
disable_service() {
    local service_name=$(map_service_name "$1")
    
    if ! check_supervisor; then
        return 1
    fi
    
    echo -e "${BLUE}Disabling service: ${service_name}${NC}"
    
    # Stop the service first, then remove from supervisor
    supervisorctl stop "$service_name" 2>/dev/null || true
    
    if supervisorctl remove "$service_name" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Service ${service_name} disabled"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} Service ${service_name} may already be disabled"
        return 0
    fi
}

# Check if service is active (simplified status check)
is_active_service() {
    local service_name=$(map_service_name "$1")
    
    if ! check_supervisor; then
        echo "inactive"
        return 3
    fi
    
    local status_info
    status_info=$(supervisorctl status "$service_name" 2>/dev/null || echo "$service_name UNKNOWN")
    
    local status_state=$(echo "$status_info" | awk '{print $2}')
    
    case "$status_state" in
        "RUNNING")
            echo "active"
            return 0
            ;;
        "STARTING")
            echo "activating"
            return 0
            ;;
        *)
            echo "inactive"
            return 3
            ;;
    esac
}

# Check service status
status_service() {
    local service_name=$(map_service_name "$1")
    
    if ! check_supervisor; then
        echo -e "${RED}● ${service_name}.service - Unknown (supervisor not available)${NC}"
        echo "   Active: inactive (dead)"
        return 3
    fi
    
    local status_info
    status_info=$(supervisorctl status "$service_name" 2>/dev/null || echo "$service_name UNKNOWN")
    
    local status_state=$(echo "$status_info" | awk '{print $2}')
    
    case "$status_state" in
        "RUNNING")
            echo -e "${GREEN}● ${service_name}.service - ${service_name} (supervisor)${NC}"
            echo "   Active: active (running)"
            echo "   $status_info"
            return 0
            ;;
        "STOPPED"|"EXITED")
            echo -e "${RED}● ${service_name}.service - ${service_name} (supervisor)${NC}"
            echo "   Active: inactive (dead)"
            echo "   $status_info"
            return 3
            ;;
        "STARTING")
            echo -e "${YELLOW}● ${service_name}.service - ${service_name} (supervisor)${NC}"
            echo "   Active: activating (start)"
            echo "   $status_info"
            return 0
            ;;
        "FATAL"|"BACKOFF")
            echo -e "${RED}● ${service_name}.service - ${service_name} (supervisor)${NC}"
            echo "   Active: failed (Result: exit-code)"
            echo "   $status_info"
            return 3
            ;;
        *)
            echo -e "${YELLOW}● ${service_name}.service - ${service_name} (supervisor)${NC}"
            echo "   Active: unknown"
            echo "   $status_info"
            return 3
            ;;
    esac
}

# List all services
list_services() {
    if ! check_supervisor; then
        echo -e "${RED}Cannot list services - supervisor not available${NC}"
        return 1
    fi
    
    echo -e "${BLUE}NoC Raven Services (via supervisor):${NC}"
    echo
    
    supervisorctl status | while read -r line; do
        local service_name=$(echo "$line" | awk '{print $1}')
        local status_state=$(echo "$line" | awk '{print $2}')
        
        case "$status_state" in
            "RUNNING")
                echo -e "  ${GREEN}●${NC} ${service_name}.service"
                ;;
            "STOPPED"|"EXITED")
                echo -e "  ${RED}○${NC} ${service_name}.service"
                ;;
            "FATAL"|"BACKOFF")
                echo -e "  ${RED}×${NC} ${service_name}.service"
                ;;
            *)
                echo -e "  ${YELLOW}?${NC} ${service_name}.service"
                ;;
        esac
    done
}

# Show help
show_help() {
    cat << 'EOF'
SystemCtl Replacement for NoC Raven Container Environment

This script provides systemctl-like functionality using supervisor for service management
in containerized environments where systemd is not available.

USAGE:
    systemctl [COMMAND] [SERVICE]

COMMANDS:
    start SERVICE      Start a service
    stop SERVICE       Stop a service
    restart SERVICE    Restart a service
    reload SERVICE     Reload service configuration
    enable SERVICE     Enable service for autostart
    disable SERVICE    Disable service
    status SERVICE     Show service status
    is-active SERVICE  Check if service is active
    list-units         List all services
    help              Show this help message

EXAMPLES:
    systemctl start nginx
    systemctl status goflow2
    systemctl restart vector
    systemctl list-units

SUPPORTED SERVICES:
    fluent-bit        Fluent Bit log processor
    vector            Vector data pipeline
    telegraf          Telegraf metrics collector
    nginx             Nginx web server
    goflow2           GoFlow2 NetFlow collector

EOF
}

# Main function
main() {
    local command="${1:-help}"
    local service_name="${2:-}"
    
    case "$command" in
        "start")
            if [[ -z "$service_name" ]]; then
                echo -e "${RED}Error: Service name required${NC}"
                exit 1
            fi
            start_service "$service_name"
            ;;
        "stop")
            if [[ -z "$service_name" ]]; then
                echo -e "${RED}Error: Service name required${NC}"
                exit 1
            fi
            stop_service "$service_name"
            ;;
        "restart")
            if [[ -z "$service_name" ]]; then
                echo -e "${RED}Error: Service name required${NC}"
                exit 1
            fi
            restart_service "$service_name"
            ;;
        "reload")
            if [[ -z "$service_name" ]]; then
                echo -e "${RED}Error: Service name required${NC}"
                exit 1
            fi
            reload_service "$service_name"
            ;;
        "enable")
            if [[ -z "$service_name" ]]; then
                echo -e "${RED}Error: Service name required${NC}"
                exit 1
            fi
            enable_service "$service_name"
            ;;
        "disable")
            if [[ -z "$service_name" ]]; then
                echo -e "${RED}Error: Service name required${NC}"
                exit 1
            fi
            disable_service "$service_name"
            ;;
        "status")
            if [[ -z "$service_name" ]]; then
                echo -e "${RED}Error: Service name required${NC}"
                exit 1
            fi
            status_service "$service_name"
            ;;
        "is-active")
            if [[ -z "$service_name" ]]; then
                echo -e "${RED}Error: Service name required${NC}"
                exit 1
            fi
            is_active_service "$service_name"
            ;;
        "list-units")
            list_services
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            echo -e "${RED}Unknown command: $command${NC}"
            echo "Use 'systemctl help' for usage information"
            exit 1
            ;;
    esac
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
