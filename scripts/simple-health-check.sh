#!/bin/bash
# 🦅 NoC Raven - Simple Health Check Script
# Basic health monitoring for Docker health checks

# Configuration
readonly HEALTH_OK=0
readonly HEALTH_WARN=1
readonly HEALTH_CRITICAL=2

# Check if essential processes are running
processes_ok=true
services=("nginx" "vector" "fluent-bit" "goflow2" "telegraf")

echo "=== NoC Raven Health Check ==="

for service in "${services[@]}"; do
    if pgrep -f "$service" > /dev/null; then
        echo "✓ $service is running"
    else
        echo "✗ $service is NOT running"
        processes_ok=false
    fi
done

# Check critical ports
echo
echo "=== Port Status ==="
ports_ok=true

# TCP ports
if netstat -tlpn | grep -q ":80 "; then
    echo "✓ HTTP port 80 is listening"
else
    echo "✗ HTTP port 80 is NOT listening"
    ports_ok=false
fi

if netstat -tlpn | grep -q ":8084 "; then
    echo "✓ Vector API port 8084 is listening"
else
    echo "✗ Vector API port 8084 is NOT listening"
    ports_ok=false
fi

# UDP ports
if netstat -ulpn | grep -q ":2055 "; then
    echo "✓ NetFlow port 2055 is listening"
else
    echo "✗ NetFlow port 2055 is NOT listening"
    ports_ok=false
fi

if netstat -ulpn | grep -q ":4739 "; then
    echo "✓ IPFIX port 4739 is listening"
else
    echo "✗ IPFIX port 4739 is NOT listening"  
    ports_ok=false
fi

if netstat -ulpn | grep -q ":6343 "; then
    echo "✓ sFlow port 6343 is listening"
else
    echo "✗ sFlow port 6343 is NOT listening"
    ports_ok=false
fi

echo
if [[ "$processes_ok" == true && "$ports_ok" == true ]]; then
    echo "🦅 NoC Raven is HEALTHY"
    exit $HEALTH_OK
elif [[ "$processes_ok" == true ]]; then
    echo "🦅 NoC Raven has PORT ISSUES"
    exit $HEALTH_WARN  
else
    echo "🦅 NoC Raven has CRITICAL ISSUES"
    exit $HEALTH_CRITICAL
fi
