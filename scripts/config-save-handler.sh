#!/bin/bash
# Configuration save handler - processes POST data and saves config
set -euo pipefail

CONFIG_FILE="/opt/noc-raven/web/api/config.json"
BACKUP_DIR="/opt/noc-raven/backups"
TMP_DIR="/tmp/noc-raven"
LOG_FILE="/var/log/noc-raven/config-save.log"

mkdir -p "$(dirname "$LOG_FILE")" "$BACKUP_DIR" "$TMP_DIR"

log() { echo "$(date -Iseconds) [CONFIG-SAVE] $*" | tee -a "$LOG_FILE"; }

save_config_from_json() {
  local json_data="$1"
  local temp_file="$TMP_DIR/new-config.json"
  if ! echo "$json_data" | jq . > "$temp_file" 2>/dev/null; then
    log "ERROR: Invalid JSON format"
    return 1
  fi
  if [[ -f "$CONFIG_FILE" ]]; then
    local backup_file="$BACKUP_DIR/config.$(date +%s).json"
    cp "$CONFIG_FILE" "$backup_file" 2>/dev/null || true
    log "Created backup: $backup_file"
  fi
  if mv "$temp_file" "$CONFIG_FILE"; then
    log "Configuration saved successfully"
    return 0
  else
    log "ERROR: Failed to save configuration"
    return 1
  fi
}

if [[ $# -gt 0 ]]; then
  json_input="$1"
else
  json_input=$(cat || true)
fi

if [[ -n "${json_input:-}" ]]; then
  if save_config_from_json "$json_input"; then
    echo '{"success": true, "message": "Configuration saved and persisted successfully!", "timestamp": "'"$(date -Iseconds)"'"}'
    exit 0
  else
    echo '{"success": false, "error": "Failed to save configuration", "timestamp": "'"$(date -Iseconds)"'"}'
    exit 1
  fi
else
  log "ERROR: No JSON data provided"
  echo '{"success": false, "error": "No configuration data received", "timestamp": "'"$(date -Iseconds)"'"}'
  exit 1
fi
