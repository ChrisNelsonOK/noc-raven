#!/bin/bash
set -euo pipefail
PORT=${API_PORT:-5001}

handler='
handle() {
  read -r request_line || exit 0
  method="${request_line%% *}"
  path=$(printf "%s" "$request_line" | awk '{print $2}')
  # read headers
  content_length=0
  while IFS= read -r header; do
    header=${header%$'\r'}
    [ -z "$header" ] && break
    case "$header" in
      Content-Length:*) content_length=$(printf "%s" "$header" | awk '{print $2}') ;;
    esac
  done
  body=""
  if [ "$method" = "POST" ] && printf "%s" "$path" | grep -E -q '^/api/services/[^/]+/restart$'; then
    svc=$(printf "%s" "$path" | sed 's|/api/services/||; s|/restart||')
    if /opt/noc-raven/scripts/production-service-manager.sh restart "$svc" >/dev/null 2>&1; then
      body="{\"success\": true, \"message\": \"Service $svc restarted successfully\"}"
    else
      body="{\"success\": false, \"message\": \"Failed to restart service $svc\"}"
    fi
  else
    body="{\"error\": \"Not found\"}"
  fi
  printf "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\nConnection: close\r\n\r\n%s" "$body"
}
handle
'

while true; do
  if command -v nc >/dev/null 2>&1; then
    nc -l -p "$PORT" -e /bin/bash -lc "$handler" 2>/dev/null || true
  elif command -v netcat >/dev/null 2>&1; then
    netcat -l -p "$PORT" -e /bin/bash -lc "$handler" 2>/dev/null || true
  else
    busybox nc -l -p "$PORT" -e /bin/bash -lc "$handler" 2>/dev/null || true
  fi
  sleep 0.1
done

