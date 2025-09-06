#!/bin/bash
# 🦅 NoC Raven - Robust Service Manager
# Monitors services, handles crashes, and ensures 100% uptime

set -euo pipefail

# Service configuration
readonly LOG_DIR="/var/log/noc-raven"
readonly NOC_RAVEN_HOME="/opt/noc-raven"
readonly DATA_DIR="/data"

# Service definitions
declare -A SERVICES=(
    ["nginx"]="nginx -g 'daemon off;'"
    ["vector"]="vector --config-toml $NOC_RAVEN_HOME/config/vector-minimal.toml"
    ["fluent-bit"]="fluent-bit -c $NOC_RAVEN_HOME/config/fluent-bit-production.conf"
    ["goflow2"]="$NOC_RAVEN_HOME/scripts/start-goflow2-production.sh"
    ["telegraf"]="telegraf --config $NOC_RAVEN_HOME/config/telegraf.conf"
)

declare -A SERVICE_PIDS=()
declare -A SERVICE_RESTARTS=()
declare -A LAST_RESTART_TIME=()

# Initialize restart counters
for service in "${!SERVICES[@]}"; do
    SERVICE_RESTARTS[$service]=0
    LAST_RESTART_TIME[$service]=0
done

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly CYAN='\033[0;36m'
readonly RESET='\033[0m'

# Logging with color
log_info() { echo -e "[$(date -Iseconds)] ${CYAN}INFO${RESET}: $*" | tee -a "$LOG_DIR/service-manager.log"; }
log_success() { echo -e "[$(date -Iseconds)] ${GREEN}SUCCESS${RESET}: $*" | tee -a "$LOG_DIR/service-manager.log"; }
log_warn() { echo -e "[$(date -Iseconds)] ${YELLOW}WARN${RESET}: $*" | tee -a "$LOG_DIR/service-manager.log"; }
log_error() { echo -e "[$(date -Iseconds)] ${RED}ERROR${RESET}: $*" | tee -a "$LOG_DIR/service-manager.log"; }

# Start a service
start_service() {
    local service=$1
    local cmd="${SERVICES[$service]}"
    
    log_info "Starting $service..."
    
    # Ensure required directories exist
    mkdir -p "$DATA_DIR/flows/templates" 2>/dev/null || true
    mkdir -p "$DATA_DIR/vector" 2>/dev/null || true
    mkdir -p "$DATA_DIR/logs" 2>/dev/null || true
    
    # Start the service
    nohup bash -c "$cmd" > "$LOG_DIR/${service}.log" 2>&1 &
    local pid=$!
    
    # Give service time to start
    sleep 3
    
    # Check if service is still running
    if kill -0 $pid 2>/dev/null; then
        SERVICE_PIDS[$service]=$pid
        log_success "$service started successfully (PID: $pid)"
        return 0
    else
        log_error "$service failed to start"
        return 1
    fi
}

# Stop a service
stop_service() {
    local service=$1
    
    if [[ -n "${SERVICE_PIDS[$service]:-}" ]]; then
        local pid=${SERVICE_PIDS[$service]}
        log_info "Stopping $service (PID: $pid)"
        
        if kill -0 $pid 2>/dev/null; then
            kill -TERM $pid 2>/dev/null || true
            sleep 2
            
            # Force kill if still running
            if kill -0 $pid 2>/dev/null; then
                kill -KILL $pid 2>/dev/null || true
                sleep 1
            fi
        fi
        
        unset SERVICE_PIDS[$service]
        log_info "$service stopped"
    fi
}

# Check if service is running
is_service_running() {
    local service=$1
    
    if [[ -n "${SERVICE_PIDS[$service]:-}" ]]; then
        local pid=${SERVICE_PIDS[$service]}
        if kill -0 $pid 2>/dev/null; then
            return 0
        else
            unset SERVICE_PIDS[$service]
            return 1
        fi
    fi
    
    return 1
}

# Restart service with exponential backoff
restart_service() {
    local service=$1
    local current_time=$(date +%s)
    local last_restart=${LAST_RESTART_TIME[$service]}
    local restart_count=${SERVICE_RESTARTS[$service]}
    
    # Implement exponential backoff (max 60 seconds)
    local backoff_time=$((restart_count * restart_count))
    if [[ $backoff_time -gt 60 ]]; then
        backoff_time=60
    fi
    
    # Check if we need to wait
    if [[ $((current_time - last_restart)) -lt $backoff_time ]]; then
        log_warn "$service restart blocked (backoff: ${backoff_time}s)"
        return 1
    fi
    
    log_warn "$service crashed, restarting (attempt $((restart_count + 1)))"
    
    # Stop the service if it's partially running
    stop_service "$service"
    
    # Start the service
    if start_service "$service"; then
        SERVICE_RESTARTS[$service]=$((restart_count + 1))
        LAST_RESTART_TIME[$service]=$current_time
        
        # Reset restart counter after successful run for 5 minutes
        if [[ $restart_count -gt 0 ]] && [[ $((current_time - last_restart)) -gt 300 ]]; then
            SERVICE_RESTARTS[$service]=0
            log_info "$service restart counter reset after stable operation"
        fi
        
        return 0
    else
        SERVICE_RESTARTS[$service]=$((restart_count + 1))
        LAST_RESTART_TIME[$service]=$current_time
        return 1
    fi
}

# Check port binding status
check_ports() {
    local ports_ok=true
    
    # UDP ports that should be listening
    local udp_ports=(514 2055 4739 6343)
    for port in "${udp_ports[@]}"; do
        if ss -ulpn | grep -q ":$port "; then
            log_success "UDP port $port is listening"
        else
            log_warn "UDP port $port is not listening"
            ports_ok=false
        fi
    done
    
    # TCP ports that should be listening
    local tcp_ports=(8080 8084)
    for port in "${tcp_ports[@]}"; do
        if ss -tlpn | grep -q ":$port "; then
            log_success "TCP port $port is listening"
        else
            log_error "TCP port $port is not listening"
            ports_ok=false
        fi
    done
    
    if [[ "$ports_ok" == "true" ]]; then
        return 0
    else
        return 1
    fi
}

# Start all services
start_all_services() {
    log_info "Starting all NoC Raven services..."
    
    for service in fluent-bit goflow2 telegraf vector nginx; do
        start_service "$service" || log_warn "Failed to start $service on first attempt"
        sleep 2
    done
    
    log_info "Initial service startup complete"
}

# Monitor services continuously
monitor_services() {
    log_info "Starting service monitoring loop..."
    
    while true; do
        local all_healthy=true
        
        # Check each service
        for service in "${!SERVICES[@]}"; do
            if ! is_service_running "$service"; then
                log_error "$service is not running"
                all_healthy=false
                
                # Restart failed service
                if restart_service "$service"; then
                    log_success "$service restarted successfully"
                else
                    log_error "Failed to restart $service"
                fi
            fi
        done
        
        # Check port bindings every few cycles
        if [[ $((SECONDS % 60)) -eq 0 ]]; then
            check_ports || log_warn "Port binding issues detected"
        fi
        
        # Report overall health status
        if [[ "$all_healthy" == "true" ]]; then
            log_success "All services are healthy"
        else
            log_warn "Some services require attention"
        fi
        
        # Wait before next check
        sleep 10
    done
}

# Graceful shutdown
cleanup() {
    log_info "Shutting down all services..."
    
    for service in "${!SERVICES[@]}"; do
        stop_service "$service"
    done
    
    log_success "Service manager shutdown complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Main execution
main() {
    log_info "NoC Raven Service Manager starting..."
    
    # Create log directory if it doesn't exist
    mkdir -p "$LOG_DIR"
    
    # Start all services
    start_all_services
    
    # Start monitoring loop
    monitor_services
}

# Execute main function
main "$@"
