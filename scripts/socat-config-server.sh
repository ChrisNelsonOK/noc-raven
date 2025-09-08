#!/bin/bash
# Simple HTTP server using socat for configuration API
set -euo pipefail

PORT=${1:-5004}
CONFIG_FILE="/opt/noc-raven/web/api/config.json"
SAVE_HANDLER="/opt/noc-raven/scripts/config-save-handler.sh"
LOG_FILE="/var/log/noc-raven/socat-config-server.log"
TMP_DIR="/tmp/config-api"

mkdir -p "$(dirname "$LOG_FILE")" "$TMP_DIR"

log() { echo "$(date -Iseconds) [SOCAT-CONFIG] $*" | tee -a "$LOG_FILE"; }

# Create request handler script
HANDLER_SCRIPT="$TMP_DIR/handler.sh"
cat > "$HANDLER_SCRIPT" << 'EOF'
#!/bin/bash
set -euo pipefail

CONFIG_FILE="/opt/noc-raven/web/api/config.json"
SAVE_HANDLER="/opt/noc-raven/scripts/config-save-handler.sh"

# Read the HTTP request
read -r REQUEST_LINE || exit 0
METHOD=$(echo "$REQUEST_LINE" | cut -d' ' -f1)
PATH=$(echo "$REQUEST_LINE" | cut -d' ' -f2)

# Normalize PATH (strip query string if any)
PATH="${PATH%%\?*}"

# Read headers and find content length
CONTENT_LENGTH=0
while read -r HEADER; do
# Strip CR if present using bash expansion
HEADER=${HEADER%$'\r'}
  [[ -z "$HEADER" ]] && break
  if [[ "$HEADER" =~ ^Content-Length:[[:space:]]*([0-9]+) ]]; then
    CONTENT_LENGTH="${BASH_REMATCH[1]}"
  fi
done

# CORS/response headers
echo "HTTP/1.1 200 OK"
echo "Content-Type: application/json"
echo "Access-Control-Allow-Origin: *"
echo "Access-Control-Allow-Methods: GET, POST, OPTIONS"
echo "Access-Control-Allow-Headers: Content-Type, Authorization"
echo "Connection: close"
echo

case "$METHOD" in
  OPTIONS)
    ;;
  GET)
    if [[ "$PATH" == "/api/config" ]]; then
      if [[ -f "$CONFIG_FILE" ]]; then
        printf "%s" "$(<"$CONFIG_FILE")"
      else
        echo '{"error":"Configuration file not found"}'
      fi
    elif [[ "$PATH" == "/health" ]]; then
      echo '{"status":"healthy"}'
    else
      echo '{"error":"Not found"}'
    fi
    ;;
  POST)
    if [[ "$PATH" == "/api/config" && $CONTENT_LENGTH -gt 0 ]]; then
      IFS= read -r -N "$CONTENT_LENGTH" POST_DATA || true
      printf "%s" "$POST_DATA" | "$SAVE_HANDLER"
    elif [[ "$PATH" =~ ^/api/services/.+/restart$ ]]; then
      SVC="${PATH#/api/services/}"; SVC="${SVC%/restart}"
      if /opt/noc-raven/scripts/production-service-manager.sh restart "$SVC" >/dev/null 2>&1 || \
         /opt/noc-raven/scripts/service-manager.sh restart "$SVC" >/dev/null 2>&1; then
        echo '{"success":true,"message":"Service restarted","service":"'"$SVC"'"}'
      else
        echo '{"success":false,"message":"Failed to restart service","service":"'"$SVC"'"}'
      fi
    else
      echo '{"error":"Invalid request"}'
    fi
    ;;
  *)
    echo '{"error":"Method not allowed"}'
    ;;
esac
EOF
chmod +x "$HANDLER_SCRIPT"

log "Starting socat HTTP server on port $PORT"
log "Handler: $HANDLER_SCRIPT"

while true; do
  socat TCP-LISTEN:$PORT,reuseaddr,fork EXEC:"$HANDLER_SCRIPT" 2>>"$LOG_FILE" || { log "Server error, restarting..."; sleep 2; }
done
