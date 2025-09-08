#!/bin/bash
# CGI wrapper for config updates
# This script handles POST requests from nginx and calls our config update service

# Set proper headers
echo "Content-Type: application/json"
echo "Access-Control-Allow-Origin: *"
echo "Access-Control-Allow-Methods: GET, POST, OPTIONS"
echo "Access-Control-Allow-Headers: Content-Type, Authorization"
echo ""

# Only handle POST requests
if [ "$REQUEST_METHOD" != "POST" ]; then
    echo '{"success": false, "message": "Only POST method allowed"}'
    exit 0
fi

# Read POST data
if [ "$CONTENT_LENGTH" -gt 0 ]; then
    POST_DATA=$(head -c $CONTENT_LENGTH)
else
    echo '{"success": false, "message": "No data provided"}'
    exit 0
fi

# Log the request
LOG_FILE="/opt/noc-raven/logs/config-api.log"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] POST /api/config - Content: $POST_DATA" >> "$LOG_FILE"

# Call our config update service
CONFIG_SCRIPT="/opt/noc-raven/scripts/config-update-service.sh"

if [ -x "$CONFIG_SCRIPT" ]; then
    # Pass the JSON data to our update script
    if $CONFIG_SCRIPT update-full "$POST_DATA" >> "$LOG_FILE" 2>&1; then
        echo '{"success": true, "message": "Configuration saved and services restarted successfully"}'
    else
        echo '{"success": false, "message": "Failed to save configuration"}'
    fi
else
    echo '{"success": false, "message": "Configuration service not available"}'
fi
