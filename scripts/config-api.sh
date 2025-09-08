#!/bin/bash
# NoC Raven - Minimal Config API (netcat-based)
# Provides GET/POST for /api/config and POST for /api/services/<name>/restart
# Also exposes /health for supervision
set -euo pipefail

API_PORT=${1:-5004}
CONFIG_FILE="/opt/noc-raven/web/api/config.json"
BACKUP_DIR="/opt/noc-raven/backups"
LOG_FILE="/var/log/noc-raven/config-api.log"

mkdir -p "$(dirname "$LOG_FILE")" "$BACKUP_DIR"

log() { echo "$(date -Iseconds) [CONFIG-API] $*" | tee -a "$LOG_FILE" >/dev/null; }

restart_service() {
  local svc="$1"
  if /opt/noc-raven/scripts/production-service-manager.sh restart "$svc" >/dev/null 2>&1; then
    echo '{"success": true, "message": "Service '"$svc"' restarted successfully", "timestamp": "'"$(date -Iseconds)"'"}'
    return 0
  elif /opt/noc-raven/scripts/service-manager.sh restart "$svc" >/dev/null 2>&1; then
    echo '{"success": true, "message": "Service '"$svc"' restarted successfully", "timestamp": "'"$(date -Iseconds)"'"}'
    return 0
  else
    echo '{"success": false, "message": "Failed to restart service '"$svc"'", "timestamp": "'"$(date -Iseconds)"'"}'
    return 1
  fi
}

serve_health() {
  echo '{"status":"healthy","timestamp":"'"$(date -Iseconds)"'"}'
}

serve_get_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    cat "$CONFIG_FILE"
  else
    echo '{"error":"Configuration file not found"}'
  fi
}

serve_post_config() {
  local post_data="$1"
  log "Received config update: ${#post_data} bytes"

  # Validate JSON
  if ! echo "$post_data" | jq . >/dev/null 2>&1; then
    log "Invalid JSON"
    echo '{"success": false, "error": "Invalid JSON format", "timestamp": "'"$(date -Iseconds)"'"}'
    return 0
  fi

  # Read old/new ports for conditional restart
  local old_port new_port
  old_port=$(jq -r '.collection.syslog.port // empty' "$CONFIG_FILE" 2>/dev/null || echo "")
  new_port=$(echo "$post_data" | jq -r '.collection.syslog.port // empty' 2>/dev/null || echo "")

  # Backup current config if exists
  if [[ -f "$CONFIG_FILE" ]]; then
    cp "$CONFIG_FILE" "$BACKUP_DIR/config.$(date +%s).json" 2>/dev/null || true
  fi

  # Save new config (pretty-printed)
  echo "$post_data" | jq . > "$CONFIG_FILE"
  log "Configuration saved to $CONFIG_FILE"

  # Restart syslog if port changed
  if [[ -n "$old_port" && -n "$new_port" && "$old_port" != "$new_port" ]]; then
    log "Syslog port changed: $old_port -> $new_port; restarting syslog"
    /opt/noc-raven/scripts/production-service-manager.sh restart syslog >/dev/null 2>&1 || \
    /opt/noc-raven/scripts/service-manager.sh restart syslog >/dev/null 2>&1 || true
  fi

  echo '{"success": true, "message": "Configuration saved successfully", "timestamp": "'"$(date -Iseconds)"'"}'
}

handle_http_request() {
  local method path version header content_length=0 post_data=""

  # Request line
  read -r method path version || return 0

  # Headers
  while IFS= read -r header; do
    header=${header%$'\r'}
    [[ -z "$header" ]] && break
    if [[ "$header" =~ ^Content-Length:[[:space:]]*([0-9]+) ]]; then
      content_length="${BASH_REMATCH[1]}"
    fi
  done

  # Body
  if [[ $content_length -gt 0 ]]; then
    post_data=$(dd bs=1 count=$content_length 2>/dev/null)
  fi

  # Common headers
  echo "HTTP/1.1 200 OK"
  echo "Content-Type: application/json"
  echo "Access-Control-Allow-Origin: *"
  echo "Access-Control-Allow-Methods: GET, POST, OPTIONS"
  echo "Access-Control-Allow-Headers: Content-Type, Authorization"
  echo "Connection: close"
  echo ""

  case "$path" in
    "/health")
      serve_health ;;
    "/api/config"|"/config")
      case "$method" in
        GET)    serve_get_config ;;
        POST)   serve_post_config "$post_data" ;;
        OPTIONS) : ;;
        *)      echo '{"error":"Method not allowed"}' ;;
      esac ;;
    "/api/services/"*"/restart")
      if [[ "$method" == "POST" ]]; then
        local svc_name
        svc_name=$(echo "$path" | sed 's|/api/services/||; s|/restart||')
        restart_service "$svc_name"
      else
        echo '{"error":"Method not allowed"}'
      fi ;;
    *)
      echo '{"error":"Not found","path":"'"$path"'"}' ;;
  esac
}

log "Starting Config API server on port $API_PORT"
while true; do
  handle_http_request | nc -l -p "$API_PORT" -q 1 2>/dev/null || {
    log "Connection error, retrying..."; sleep 1; }
done
