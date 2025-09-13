#!/bin/bash
# systemctl replacement for container environment
# This script provides basic systemctl compatibility for services managed by supervisor

set -e

SERVICE_NAME="$2"
ACTION="$1"

# Map service names to supervisor names
case "$SERVICE_NAME" in
    "fluent-bit"|"fluentbit")
        SUPERVISOR_SERVICE="fluent-bit"
        ;;
    "goflow2"|"netflow")
        SUPERVISOR_SERVICE="goflow2"
        ;;
    "telegraf"|"snmp")
        SUPERVISOR_SERVICE="telegraf"
        ;;
    "vector"|"windows")
        SUPERVISOR_SERVICE="vector"
        ;;
    "nginx"|"web")
        SUPERVISOR_SERVICE="nginx"
        ;;
    "config-service"|"api")
        SUPERVISOR_SERVICE="config-service"
        ;;
    "buffer-service"|"buffer")
        SUPERVISOR_SERVICE="buffer-service"
        ;;
    *)
        SUPERVISOR_SERVICE="$SERVICE_NAME"
        ;;
esac

# Execute action via supervisorctl
case "$ACTION" in
    "start")
        supervisorctl start "$SUPERVISOR_SERVICE"
        ;;
    "stop")
        supervisorctl stop "$SUPERVISOR_SERVICE"
        ;;
    "restart")
        supervisorctl restart "$SUPERVISOR_SERVICE"
        ;;
    "status")
        supervisorctl status "$SUPERVISOR_SERVICE"
        ;;
    "enable"|"disable")
        # No-op for container environment
        echo "Service $SERVICE_NAME is managed by supervisor"
        ;;
    *)
        echo "Usage: systemctl {start|stop|restart|status|enable|disable} SERVICE"
        exit 1
        ;;
esac
