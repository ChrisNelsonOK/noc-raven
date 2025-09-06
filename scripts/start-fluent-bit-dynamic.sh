#!/bin/bash
# Start Fluent Bit with dynamic syslog port from config.json
set -euo pipefail

CFG_JSON="/opt/noc-raven/web/api/config.json"
GEN_DIR="/opt/noc-raven/config/generated"
GEN_CONF="$GEN_DIR/fluent-bit-dynamic.conf"
LOG_DIR="/var/log/noc-raven"

mkdir -p "$GEN_DIR" "$LOG_DIR"

# Defaults
SYS_PORT=514
BIND_ADDR="0.0.0.0"
PROTO="udp"
ENABLED=true

# Parse JSON if available
if [ -f "$CFG_JSON" ]; then
  SYS_PORT=$(jq -r '.collection.syslog.port // 514' "$CFG_JSON" 2>/dev/null || echo 514)
  BIND_ADDR=$(jq -r '.collection.syslog.bind_address // "0.0.0.0"' "$CFG_JSON" 2>/dev/null || echo "0.0.0.0")
  PROTO=$(jq -r '.collection.syslog.protocol // "UDP"' "$CFG_JSON" 2>/dev/null | tr 'A-Z' 'a-z' || echo udp)
  ENABLED=$(jq -r '.collection.syslog.enabled // true' "$CFG_JSON" 2>/dev/null || echo true)
fi

# If disabled, run a minimal dummy config to keep process healthy
if [ "$ENABLED" != "true" ]; then
  cat > "$GEN_CONF" <<EOF
[SERVICE]
    Flush         5
    Daemon        Off
    Log_Level     info

[INPUT]
    Name          dummy
    Tag           syslog.disabled
    Dummy         {"message": "syslog disabled"}
    Rate          60

[OUTPUT]
    Name          stdout
    Match         *
EOF
  exec fluent-bit -c "$GEN_CONF"
fi

# Generate syslog input config
cat > "$GEN_CONF" <<EOF
[SERVICE]
    Flush         5
    Daemon        Off
    Log_Level     info
    Parsers_File  /opt/noc-raven/config/parsers.conf

[INPUT]
    Name          syslog
    Mode          $PROTO
    Listen        $BIND_ADDR
    Port          $SYS_PORT
    Parser        syslog-rfc3164-custom

[OUTPUT]
    Name          stdout
    Match         *
EOF

exec fluent-bit -c "$GEN_CONF"
