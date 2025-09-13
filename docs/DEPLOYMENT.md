# 🚀 NoC Raven - Production Deployment Guide

## Overview

NoC Raven is a containerized telemetry collection appliance designed for production deployment in venue environments. This guide covers deployment, configuration, and operational procedures.

---

## 📋 Prerequisites

### System Requirements
- **OS**: Linux (Ubuntu 20.04+ recommended)
- **CPU**: 4+ cores (8+ recommended for high throughput)
- **Memory**: 8GB+ RAM (16GB+ recommended)
- **Storage**: 100GB+ available space
- **Network**: Multiple network interfaces for telemetry collection

### Software Dependencies
- **Docker**: 20.10+ with BuildKit support
- **Docker Compose**: 2.0+ (optional but recommended)
- **Git**: For source code management

---

## 🏗️ Deployment Methods

### Method 1: Production Container (Recommended)

```bash
# Pull the production image
docker pull rectitude369/noc-raven:1.0.0

# Create data directories with correct ownership
sudo mkdir -p /opt/noc-raven/{data,config,logs}
sudo chown -R 1000:1000 /opt/noc-raven

# IMPORTANT: The container runs as user 'nocraven' (UID 1000)
# Ensure the host directories are owned by UID 1000 to avoid permission errors

# Run in production mode
docker run -d \
  --name noc-raven \
  --restart unless-stopped \
  -p 9080:8080 \
  -p 8084:8084/tcp \
  -p 514:514/udp \
  -p 2055:2055/udp \
  -p 4739:4739/udp \
  -p 6343:6343/udp \
  -p 162:162/udp \
  -v /opt/noc-raven/data:/data \
  -v /opt/noc-raven/config:/config \
  -v /opt/noc-raven/logs:/var/log/noc-raven \
  --cap-add NET_ADMIN \
  rectitude369/noc-raven:1.0.0
```

### Method 2: Build from Source

```bash
# Clone repository
git clone https://github.com/ChrisNelsonOK/noc-raven.git
cd noc-raven

# Build production image
DOCKER_BUILDKIT=1 docker build -t noc-raven:local .

# Create data directories with correct ownership
sudo mkdir -p /opt/noc-raven/{data,config,logs}
sudo chown -R 1000:1000 /opt/noc-raven

# Run with local image
docker run -d \
  --name noc-raven \
  --restart unless-stopped \
  -p 9080:8080 \
  -p 8084:8084/tcp \
  -p 514:514/udp \
  -p 2055:2055/udp \
  -p 4739:4739/udp \
  -p 6343:6343/udp \
  -p 162:162/udp \
  -v /opt/noc-raven/data:/data \
  -v /opt/noc-raven/config:/config \
  -v /opt/noc-raven/logs:/var/log/noc-raven \
  --cap-add NET_ADMIN \
  noc-raven:local
```

---

## 🔧 Initial Configuration

### 1. First-Time Setup (Terminal Mode)

```bash
# Run terminal configuration mode
docker run -it --rm \
  --name noc-raven-setup \
  -v /opt/noc-raven/config:/config \
  --cap-add NET_ADMIN \
  rectitude369/noc-raven:1.0.0 terminal

# Follow the interactive menu to configure:
# - Network interfaces
# - Collection ports
# - Forwarding destinations
# - System settings
```

### 2. Web Interface Configuration

1. **Access Web UI**: http://your-server:9080
2. **Navigate to Settings**: Configure collection services
3. **Set Collection Ports**:
   - Syslog: 514 (default) or custom
   - NetFlow v5: 2055 (default)
   - IPFIX: 4739 (default)
   - sFlow: 6343 (default)
   - SNMP Traps: 162 (default)
   - Windows Events: 8084 (HTTP endpoint)

### 3. Network Configuration

```bash
# Configure firewall rules (Ubuntu/Debian)
sudo ufw allow 9080/tcp    # Web interface
sudo ufw allow 8084/tcp    # Windows Events HTTP
sudo ufw allow 514/udp     # Syslog
sudo ufw allow 2055/udp    # NetFlow v5
sudo ufw allow 4739/udp    # IPFIX
sudo ufw allow 6343/udp    # sFlow
sudo ufw allow 162/udp     # SNMP traps

# For high-throughput environments, tune network buffers
echo 'net.core.rmem_max = 134217728' >> /etc/sysctl.conf
echo 'net.core.rmem_default = 67108864' >> /etc/sysctl.conf
echo 'net.core.netdev_max_backlog = 5000' >> /etc/sysctl.conf
sysctl -p
```

---

## 📊 Monitoring and Health Checks

### Health Check Endpoints

```bash
# System health
curl http://localhost:9080/health

# API status
curl http://localhost:9080/api/system/status

# Service status
curl http://localhost:9080/api/config
```

### Log Monitoring

```bash
# View container logs
docker logs -f noc-raven

# View service-specific logs
docker exec noc-raven tail -f /var/log/noc-raven/config-service.log
docker exec noc-raven tail -f /var/log/noc-raven/fluent-bit.log
docker exec noc-raven tail -f /var/log/noc-raven/goflow2.log
```

### Performance Monitoring

```bash
# Container resource usage
docker stats noc-raven

# Detailed system metrics
curl http://localhost:9080/api/metrics
```

---

## 🔄 Backup and Recovery

### Configuration Backup

```bash
# Backup configuration
docker exec noc-raven tar -czf /tmp/config-backup.tar.gz /config
docker cp noc-raven:/tmp/config-backup.tar.gz ./config-backup-$(date +%Y%m%d).tar.gz

# Automated backup script
#!/bin/bash
BACKUP_DIR="/opt/backups/noc-raven"
DATE=$(date +%Y%m%d-%H%M%S)
mkdir -p $BACKUP_DIR

docker exec noc-raven tar -czf /tmp/backup-$DATE.tar.gz /config /data
docker cp noc-raven:/tmp/backup-$DATE.tar.gz $BACKUP_DIR/
docker exec noc-raven rm /tmp/backup-$DATE.tar.gz

# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup-*.tar.gz" -mtime +7 -delete
```

### Configuration Restore

```bash
# Stop container
docker stop noc-raven

# Restore configuration
tar -xzf config-backup-20240115.tar.gz -C /opt/noc-raven/

# Start container
docker start noc-raven
```

---

## 🔧 Maintenance Procedures

### Service Restart

```bash
# Restart individual services via API
curl -X POST http://localhost:9080/api/services/fluent-bit/restart
curl -X POST http://localhost:9080/api/services/goflow2/restart
curl -X POST http://localhost:9080/api/services/telegraf/restart
curl -X POST http://localhost:9080/api/services/vector/restart

# Restart entire container
docker restart noc-raven
```

### Log Rotation

```bash
# Configure logrotate for container logs
cat > /etc/logrotate.d/noc-raven << EOF
/var/lib/docker/containers/*/*-json.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
    postrotate
        docker kill --signal=USR1 noc-raven 2>/dev/null || true
    endscript
}
EOF
```

### Updates and Upgrades

```bash
# Pull latest image
docker pull rectitude369/noc-raven:latest

# Stop current container
docker stop noc-raven
docker rm noc-raven

# Run with new image (preserve data volumes)
docker run -d \
  --name noc-raven \
  --restart unless-stopped \
  -p 9080:8080 \
  -p 8084:8084/tcp \
  -p 514:514/udp \
  -p 2055:2055/udp \
  -p 4739:4739/udp \
  -p 6343:6343/udp \
  -p 162:162/udp \
  -v /opt/noc-raven/data:/data \
  -v /opt/noc-raven/config:/config \
  -v /opt/noc-raven/logs:/var/log/noc-raven \
  --cap-add NET_ADMIN \
  rectitude369/noc-raven:latest
```

---

## 🚨 Troubleshooting

### Common Issues

**1. Port Binding Errors**
```bash
# Check if ports are in use
netstat -tulpn | grep -E ':(514|2055|4739|6343|162|8084|9080)'

# Kill conflicting processes
sudo fuser -k 514/udp
```

**2. Permission Issues**
```bash
# Error: "mkdir: can't create directory '/data/syslog': Permission denied"
# This happens when mounted volumes don't have correct ownership

# Fix data directory permissions
sudo chown -R 1000:1000 /opt/noc-raven
sudo chmod -R 755 /opt/noc-raven

# Restart container after fixing permissions
docker restart noc-raven
```

**3. Service Not Starting**
```bash
# Check service logs
docker exec noc-raven supervisorctl status
docker exec noc-raven supervisorctl tail fluent-bit stderr
```

**4. High Memory Usage**
```bash
# Adjust buffer sizes in configuration
# Restart services to apply changes
curl -X POST http://localhost:9080/api/services/fluent-bit/restart
```

### Performance Tuning

**For High-Throughput Environments:**

```bash
# Increase container resources
docker update --memory=16g --cpus=8 noc-raven

# Tune kernel parameters
echo 'net.core.rmem_max = 268435456' >> /etc/sysctl.conf
echo 'net.core.wmem_max = 268435456' >> /etc/sysctl.conf
echo 'net.core.netdev_max_backlog = 10000' >> /etc/sysctl.conf
echo 'fs.file-max = 1000000' >> /etc/sysctl.conf
sysctl -p
```

---

## 📞 Support and Documentation

- **Web Interface**: http://your-server:9080
- **API Documentation**: [API.md](./API.md)
- **Configuration Guide**: Access via web interface Settings page
- **Log Files**: `/var/log/noc-raven/` (inside container)
- **Health Checks**: `/health` and `/api/system/status` endpoints

---

## 🔐 Security Considerations

### Production Security

```bash
# Enable API key authentication
docker run -d \
  --name noc-raven \
  -e API_KEY="your-secure-api-key-here" \
  -e LOG_LEVEL="warn" \
  # ... other options
  rectitude369/noc-raven:1.0.0

# Use reverse proxy for HTTPS
# Configure firewall rules
# Regular security updates
```

### Network Isolation

- Deploy in isolated network segment
- Use VLANs for telemetry collection
- Implement network access controls
- Monitor for unauthorized access

---

**🦅 NoC Raven is now ready for production deployment!**
