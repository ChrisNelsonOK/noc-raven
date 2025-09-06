#!/bin/bash
# Simple HTTP server for config updates using netcat
# This runs on port 8081 and handles POST requests

PORT=8081
CONFIG_SCRIPT="/opt/noc-raven/scripts/config-update-service.sh"
LOG_FILE="/opt/noc-raven/logs/config-server.log"

log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

handle_request() {
    local request_line
    local content_length=0
    local method=""
    local path=""
    
    # Read request line
    read request_line
    method=$(echo "$request_line" | cut -d' ' -f1)
    path=$(echo "$request_line" | cut -d' ' -f2)
    
    log_message "Request: $method $path"
    
    # Read headers to find Content-Length
    while read header; do
        header=$(echo "$header" | tr -d '\r')
        if [ -z "$header" ]; then
            break
        fi
        if echo "$header" | grep -qi "content-length:"; then
            content_length=$(echo "$header" | cut -d' ' -f2)
        fi
    done
    
    # Common headers
    echo "HTTP/1.1 200 OK"
    echo "Content-Type: application/json"
    echo "Access-Control-Allow-Origin: *"
    echo "Access-Control-Allow-Methods: GET, POST, OPTIONS"
    echo "Access-Control-Allow-Headers: Content-Type, Authorization"
    echo "Connection: close"
    echo ""
    
    case "$method" in
        "POST")
            if [ "$content_length" -gt 0 ]; then
                # Read POST data
                post_data=$(head -c "$content_length")
                log_message "POST data: $post_data"
                
                # Call config update script
                if [ -x "$CONFIG_SCRIPT" ]; then
                    if echo "$post_data" | $CONFIG_SCRIPT update-full "$post_data" >> "$LOG_FILE" 2>&1; then
                        echo '{"success": true, "message": "Configuration saved and services restarted successfully"}'
                        log_message "Config update successful"
                    else
                        echo '{"success": false, "message": "Failed to save configuration"}'
                        log_message "Config update failed"
                    fi
                else
                    echo '{"success": false, "message": "Configuration service not available"}'
                    log_message "Config script not found or not executable"
                fi
            else
                echo '{"success": false, "message": "No data provided"}'
            fi
            ;;
        "OPTIONS")
            echo '{"success": true}'
            ;;
        *)
            echo '{"success": false, "message": "Method not allowed"}'
            ;;
    esac
}

# Start the server
log_message "Starting config HTTP server on port $PORT"

while true; do
    # Use netcat to listen and handle one request at a time
    nc -l -p $PORT -e /bin/bash -c "$(declare -f handle_request log_message; echo 'handle_request')" 2>/dev/null || {
        log_message "Failed to start server on port $PORT, trying again in 5 seconds..."
        sleep 5
    }
done
