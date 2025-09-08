#!/bin/bash
#
# 🦅 NoC Raven - API Server Startup Script
# Starts the Flask API server for configuration management
#

set -euo pipefail

LOG_FILE="/var/log/noc-raven/api-server.log"
PID_FILE="/opt/noc-raven/logs/api-server.pid"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$(dirname "$PID_FILE")"

# Set environment variables
export PYTHONPATH="/usr/local/lib/python3/site-packages:$PYTHONPATH"
export FLASK_ENV=production
export FLASK_APP="/usr/local/bin/api-server.py"

echo "$(date '+%Y-%m-%d %H:%M:%S') [API-SERVER] Starting Flask API server..." | tee -a "$LOG_FILE"

# Install required Python packages if not available
if ! python3 -c "import flask, flask_cors, psutil" 2>/dev/null; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [API-SERVER] Installing required Python packages..." | tee -a "$LOG_FILE"
    pip3 install flask flask-cors psutil 2>&1 | tee -a "$LOG_FILE" || true
fi

# Start the API server
python3 /opt/noc-raven/bin/api-server.py >> "$LOG_FILE" 2>&1 &
API_PID=$!

# Save PID
echo "$API_PID" > "$PID_FILE"

echo "$(date '+%Y-%m-%d %H:%M:%S') [API-SERVER] Started with PID $API_PID" | tee -a "$LOG_FILE"

# Wait a moment to ensure it started successfully
sleep 2

if kill -0 "$API_PID" 2>/dev/null; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [API-SERVER] Successfully started and running" | tee -a "$LOG_FILE"
    exit 0
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') [API-SERVER] Failed to start" | tee -a "$LOG_FILE"
    exit 1
fi
