#!/bin/bash
# 🦅 NoC Raven - Production GoFlow2 Startup Script
# Optimized for 100% production reliability

set -euo pipefail

# Production configuration
readonly LOG_DIR="/var/log/noc-raven"
readonly DATA_DIR="/data"
readonly NOC_RAVEN_HOME="/opt/noc-raven"

# Enhanced logging
log_info() {
    echo "[$(date -Iseconds)] INFO: $*" | tee -a "$LOG_DIR/goflow2-startup.log"
}

log_error() {
    echo "[$(date -Iseconds)] ERROR: $*" | tee -a "$LOG_DIR/goflow2-startup.log" >&2
}

# Pre-startup validation
validate_environment() {
    log_info "Validating GoFlow2 environment..."
    
    # Check GoFlow2 binary
    if [[ ! -x "$NOC_RAVEN_HOME/bin/goflow2" ]]; then
        log_error "GoFlow2 binary not found or not executable"
        return 1
    fi
    
    # Create required directories
    local dirs=(
        "$DATA_DIR/flows"
        "$DATA_DIR/flows/templates" 
        "$DATA_DIR/flows/storage"
        "$LOG_DIR"
    )
    
    for dir in "${dirs[@]}"; do
        if ! mkdir -p "$dir" 2>/dev/null; then
            log_error "Failed to create directory: $dir"
            return 1
        fi
    done
    
    log_info "Environment validation completed"
    return 0
}

# Check if ports are available
check_port_availability() {
    local ports=(2055 4739 6343)
    
    log_info "Checking port availability..."
    
    for port in "${ports[@]}"; do
        if ss -ulpn | grep -q ":$port "; then
            log_error "Port $port is already in use"
            return 1
        fi
    done
    
    log_info "All required ports are available"
    return 0
}

# Main startup function
start_goflow2_production() {
    log_info "Starting GoFlow2 in production mode..."
    
    # Validate environment first
    if ! validate_environment; then
        log_error "Environment validation failed"
        return 1
    fi
    
    # Check port availability
    if ! check_port_availability; then
        log_error "Port availability check failed"
        return 1
    fi
    
# Build listen string from config
    local cfg=/opt/noc-raven/web/api/config.json
    local nf_enabled=$(jq -r '.collection.netflow.enabled // true' "$cfg" 2>/dev/null || echo true)
    local p_v5=$(jq -r '.collection.netflow.ports.netflow_v5 // 2055' "$cfg" 2>/dev/null || echo 2055)
    local p_ipfix=$(jq -r '.collection.netflow.ports.ipfix // 4739' "$cfg" 2>/dev/null || echo 4739)
    local p_sflow=$(jq -r '.collection.netflow.ports.sflow // 6343' "$cfg" 2>/dev/null || echo 6343)

    local listen=""
    if [[ "$nf_enabled" == "true" ]]; then
        listen="sflow://:${p_sflow},netflow://:${p_v5},netflow://:${p_ipfix}"
    fi

    log_info "Executing GoFlow2 with listen=[$listen]"
    exec "$NOC_RAVEN_HOME/bin/goflow2" \
        -listen "$listen" \
        -transport file \
        -transport.file "$DATA_DIR/flows/production-flows-%Y-%m-%d.log" \
        -transport.file.sep "\\n" \
        -format json \
        -produce sample \
        -loglevel info \
        -logfmt normal \
        -addr ":8081" \
        -templates.path "$DATA_DIR/flows/templates" \
        -err.cnt 50 \
        -err.int 30s
}

# Execute main function
start_goflow2_production
