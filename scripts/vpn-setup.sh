#!/bin/bash
# NoC Raven - OpenVPN Setup Script  
# Handles automatic OpenVPN connection with authentication

set -euo pipefail

# Configuration
VPN_CONFIG_DIR="/config/vpn"
VPN_CONFIG_FILE="$VPN_CONFIG_DIR/client.ovpn"
VPN_AUTH_FILE="$VPN_CONFIG_DIR/auth.txt" 
VPN_LOG_FILE="/var/log/noc-raven/openvpn.log"
VPN_PID_FILE="/tmp/openvpn.pid"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RESET='\033[0m'

log() {
    echo -e "[$(date -Iseconds)] [VPN] $*" | tee -a "$VPN_LOG_FILE"
}

log_info() { log "${BLUE}INFO:${RESET} $*"; }
log_warn() { log "${YELLOW}WARN:${RESET} $*"; }
log_error() { log "${RED}ERROR:${RESET} $*"; }
log_success() { log "${GREEN}SUCCESS:${RESET} $*"; }

# Check if VPN is already connected
is_vpn_connected() {
    # Check for VPN interfaces
    if ip link show | grep -E "(tun|tap)" >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Stop existing VPN connection
stop_vpn() {
    log_info "Stopping existing VPN connections..."
    
    # Kill OpenVPN processes
    pkill -f openvpn || true
    
    # Remove PID file
    rm -f "$VPN_PID_FILE"
    
    # Wait a moment for cleanup
    sleep 2
    
    log_success "VPN connections stopped"
}

# Setup VPN configuration
setup_vpn_config() {
    log_info "Setting up VPN configuration..."
    
    # Ensure VPN directory exists
    mkdir -p "$VPN_CONFIG_DIR"
    
    # Copy DRT.ovpn to expected location if it doesn't exist
    if [[ ! -f "$VPN_CONFIG_FILE" ]]; then
        if [[ -f "/opt/noc-raven/DRT.ovpn" ]]; then
            cp "/opt/noc-raven/DRT.ovpn" "$VPN_CONFIG_FILE"
            log_success "Copied DRT.ovpn to $VPN_CONFIG_FILE"
        elif [[ -f "/config/DRT.ovpn" ]]; then
            cp "/config/DRT.ovpn" "$VPN_CONFIG_FILE"
            log_success "Copied DRT.ovpn from config directory"
        else
            log_error "DRT.ovpn not found in expected locations"
            return 1
        fi
    fi
    
    # Create authentication file if not exists
    if [[ ! -f "$VPN_AUTH_FILE" ]]; then
        log_warn "VPN authentication file not found"
        log_info "Creating placeholder auth file at $VPN_AUTH_FILE"
        cat > "$VPN_AUTH_FILE" << EOF
# Replace with actual VPN credentials
# Line 1: Username
# Line 2: Password
vpn_username
vpn_password
EOF
        chmod 600 "$VPN_AUTH_FILE"
        log_warn "Please update $VPN_AUTH_FILE with actual VPN credentials"
    fi
    
    # Ensure config file points to auth file
    if ! grep -q "auth-user-pass" "$VPN_CONFIG_FILE"; then
        echo "auth-user-pass $VPN_AUTH_FILE" >> "$VPN_CONFIG_FILE"
        log_info "Added auth-user-pass directive to VPN config"
    elif ! grep -q "auth-user-pass $VPN_AUTH_FILE" "$VPN_CONFIG_FILE"; then
        sed -i "s|auth-user-pass.*|auth-user-pass $VPN_AUTH_FILE|" "$VPN_CONFIG_FILE"
        log_info "Updated auth-user-pass path in VPN config"
    fi
    
    log_success "VPN configuration setup complete"
}

# Start VPN connection
start_vpn() {
    log_info "Starting VPN connection..."
    
    # Validate configuration file
    if [[ ! -f "$VPN_CONFIG_FILE" ]]; then
        log_error "VPN configuration file not found: $VPN_CONFIG_FILE"
        return 1
    fi
    
    if ! grep -q "remote" "$VPN_CONFIG_FILE"; then
        log_error "Invalid VPN configuration - missing remote directive"
        return 1
    fi
    
    # Start OpenVPN in background
    openvpn \
        --config "$VPN_CONFIG_FILE" \
        --daemon \
        --log "$VPN_LOG_FILE" \
        --writepid "$VPN_PID_FILE" \
        --script-security 2 \
        --up-delay \
        --up-restart \
        --connect-retry-max 3 \
        --connect-retry 10
    
    if [[ $? -eq 0 ]]; then
        log_success "OpenVPN process started"
        return 0
    else
        log_error "Failed to start OpenVPN"
        return 1
    fi
}

# Wait for VPN connection with timeout
wait_for_vpn() {
    local max_wait=60
    local count=0
    
    log_info "Waiting for VPN connection (timeout: ${max_wait}s)..."
    
    while [[ $count -lt $max_wait ]]; do
        if is_vpn_connected; then
            log_success "VPN interface detected"
            
            # Test connectivity to remote endpoint
            if ping -c 1 -W 5 obs.rectitude.net >/dev/null 2>&1; then
                log_success "VPN connectivity confirmed - can reach obs.rectitude.net"
                return 0
            else
                log_warn "VPN interface up but remote connectivity test failed"
            fi
        fi
        
        # Check if OpenVPN process is still running
        if [[ -f "$VPN_PID_FILE" ]]; then
            local vpn_pid=$(cat "$VPN_PID_FILE")
            if ! kill -0 "$vpn_pid" 2>/dev/null; then
                log_error "OpenVPN process died unexpectedly"
                return 1
            fi
        fi
        
        ((count++))
        sleep 1
    done
    
    log_error "VPN connection timeout after ${max_wait}s"
    return 1
}

# Main execution
main() {
    local action="${1:-start}"
    
    case "$action" in
        "start")
            if is_vpn_connected; then
                log_info "VPN already connected"
                return 0
            fi
            
            setup_vpn_config || return 1
            start_vpn || return 1
            wait_for_vpn || return 1
            ;;
        "stop")
            stop_vpn
            ;;
        "restart")
            stop_vpn
            sleep 2
            setup_vpn_config || return 1
            start_vpn || return 1
            wait_for_vpn || return 1
            ;;
        "status")
            if is_vpn_connected; then
                log_success "VPN is connected"
                ip addr show | grep -E "(tun|tap)"
                return 0
            else
                log_warn "VPN is not connected"
                return 1
            fi
            ;;
        *)
            echo "Usage: $0 {start|stop|restart|status}"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"