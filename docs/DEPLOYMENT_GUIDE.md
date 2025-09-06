# 🦅 NoC Raven - Production Deployment Guide

**Version:** 1.0.0-alpha  
**Release Date:** January 2025  
**Maintainer:** Rectitude 369, LLC  
**Contact:** support@rectitude369.com

## 📋 Executive Summary

NoC Raven is a turn-key Docker appliance designed for high-performance telemetry collection and forwarding in large-scale venue environments. This deployment guide covers everything needed to deploy, configure, and operate NoC Raven in production environments including stadiums, arenas, and convention centers.

### Key Capabilities
- **High-Volume Processing**: 100,000+ syslog messages/second, 50,000+ flows/second
- **Multi-Protocol Support**: Syslog (RFC3164/RFC5424), NetFlow/IPFIX, sFlow, SNMP Traps, Windows Events
- **Resilient Operation**: 2-week local buffering during connectivity outages
- **Dual Interface**: Terminal menu (no DHCP) or web control panel (with DHCP)
- **VPN Integration**: Secure tunneling to centralized observability infrastructure

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            NoC Raven Appliance                             │
├─────────────────────────────────────────────────────────────────────────────┤
│           Boot Manager (DHCP Detection & Interface Selection)               │
│  ┌─────────────────────────┐         ┌─────────────────────────┐            │
│  │    Terminal Menu        │   OR    │   Web Control Panel    │            │
│  │   (No DHCP/Static)      │         │      (DHCP Active)      │            │
│  │  - Network Config       │         │  - Real-time Dashboard │            │
│  │  - System Settings      │         │  - Service Management  │            │
│  │  - ASCII Interface      │         │  - Diagnostic Tools    │            │
│  └─────────────────────────┘         └─────────────────────────┘            │
├─────────────────────────────────────────────────────────────────────────────┤
│                        Telemetry Collection Layer                          │
│ ┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐           │
│ │  Fluent Bit  ││   GoFlow2    ││   Telegraf   ││    Vector    │           │
│ │   Syslog     ││ NetFlow/sFlow││  SNMP Traps  ││ Win Events   │           │
│ │  UDP:514     ││ UDP:2055,6343││   UDP:162    ││ HTTP:8084    │           │
│ │  TCP:1514    ││ UDP:4739     ││              ││              │           │
│ └──────────────┘└──────────────┘└──────────────┘└──────────────┘           │
├─────────────────────────────────────────────────────────────────────────────┤
│                          Local Buffer System                               │
│              ┌─────────────────────────────────────────┐                   │
│              │         2-Week Ring Buffer Storage      │                   │
│              │    ┌─────────┬─────────┬─────────────┐   │                   │
│              │    │ Syslog  │ Flows   │ SNMP/Metrics│   │                   │
│              │    │ 10GB    │ 50GB    │    5GB     │   │                   │
│              │    └─────────┴─────────┴─────────────┘   │                   │
│              └─────────────────────────────────────────┘                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                           VPN Tunnel Layer                                 │
│                    ┌─────────────────────────────────┐                     │
│                    │     OpenVPN Connect Client      │                     │
│                    │   - Auto-connect & reconnect    │                     │
│                    │   - Connection health monitoring │                     │
│                    │   - State persistence           │                     │
│                    └─────────────────────────────────┘                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                          Forwarding Layer                                  │
│                         obs.rectitude.net                                  │
│       ┌─────────────┬─────────────┬─────────────┬─────────────┐            │
│       │ Syslog:1514 │NetFlow:2055 │ sFlow:6343  │ SNMP:162   │            │
│       │             │ IPFIX:4739  │             │ HTTP:8084  │            │
│       └─────────────┴─────────────┴─────────────┴─────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Deployment

### Prerequisites
- Docker Engine 20.10+ with Docker Compose 2.0+
- Minimum system requirements: 4 CPU cores, 8GB RAM, 500GB storage
- Network connectivity for Docker image pulls
- Your venue's `.ovpn` VPN profile file

### 1. Download and Deploy

```bash
# Create deployment directory
mkdir -p /opt/noc-raven
cd /opt/noc-raven

# Download the latest image
docker pull rectitude369/noc-raven:latest

# Create persistent volumes
docker volume create noc-raven-data
docker volume create noc-raven-config

# Copy your VPN profile
mkdir -p ./vpn-config
cp your-venue.ovpn ./vpn-config/client.ovpn
```

### 2. Standard Deployment (Recommended)

```bash
# For venues with DHCP (Web Control Panel)
docker run -d \
  --name noc-raven \
  --restart unless-stopped \
  --network host \
  --privileged \
  -v noc-raven-data:/data \
  -v noc-raven-config:/config \
  -v ./vpn-config/client.ovpn:/config/vpn/client.ovpn \
  -e SITE_ID=your-venue-001 \
  -e HOSTNAME=noc-raven-venue \
  -e PERFORMANCE_PROFILE=stadium \
  rectitude369/noc-raven:latest
```

### 3. Manual Network Configuration

```bash
# For venues without DHCP (Terminal Menu)
docker run -it \
  --name noc-raven \
  --restart unless-stopped \
  --network host \
  --privileged \
  -v noc-raven-data:/data \
  -v noc-raven-config:/config \
  -v ./vpn-config/client.ovpn:/config/vpn/client.ovpn \
  -e SITE_ID=your-venue-001 \
  -e HOSTNAME=noc-raven-venue \
  rectitude369/noc-raven:latest
```

## 🏢 Venue-Specific Configurations

### Stadium Deployment (5,000+ devices)
```bash
docker run -d \
  --name noc-raven-stadium \
  --restart unless-stopped \
  --network host \
  --privileged \
  -v noc-raven-stadium-data:/data \
  -v noc-raven-stadium-config:/config \
  -v ./stadium.ovpn:/config/vpn/client.ovpn \
  -e SITE_ID=stadium-001 \
  -e HOSTNAME=noc-raven-stadium \
  -e PERFORMANCE_PROFILE=stadium \
  -e BUFFER_SIZE=200GB \
  -e FLUENT_BIT_WORKERS=8 \
  -e GOFLOW2_WORKERS=16 \
  rectitude369/noc-raven:latest
```

### Arena Deployment (1,000-3,000 devices)
```bash
docker run -d \
  --name noc-raven-arena \
  --restart unless-stopped \
  --network host \
  --privileged \
  -v noc-raven-arena-data:/data \
  -v noc-raven-arena-config:/config \
  -v ./arena.ovpn:/config/vpn/client.ovpn \
  -e SITE_ID=arena-001 \
  -e HOSTNAME=noc-raven-arena \
  -e PERFORMANCE_PROFILE=arena \
  -e BUFFER_SIZE=150GB \
  rectitude369/noc-raven:latest
```

### Convention Center Deployment (Multi-segment)
```bash
docker run -d \
  --name noc-raven-convention \
  --restart unless-stopped \
  --network host \
  --privileged \
  -v noc-raven-convention-data:/data \
  -v noc-raven-convention-config:/config \
  -v ./convention.ovpn:/config/vpn/client.ovpn \
  -e SITE_ID=convention-001 \
  -e HOSTNAME=noc-raven-convention \
  -e PERFORMANCE_PROFILE=convention_center \
  -e BUFFER_SIZE=175GB \
  rectitude369/noc-raven:latest
```

## ⚙️ Configuration Management

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SITE_ID` | `venue-001` | Unique identifier for the venue |
| `HOSTNAME` | `noc-raven-001` | System hostname |
| `PERFORMANCE_PROFILE` | `balanced` | Performance tuning profile |
| `BUFFER_SIZE` | `100GB` | Local storage buffer size |
| `WEB_PORT` | `8080` | Web control panel port |
| `NETWORK_INTERFACE` | `eth0` | Primary network interface |
| `INFLUXDB_PASSWORD` | `$w33t@55T3a!` | InfluxDB authentication |

### Performance Profiles

#### Stadium Profile
- **Target:** 5,000+ devices
- **Workers:** 16 GoFlow2, 8 Fluent Bit, 4 Telegraf
- **Buffer:** 200GB recommended
- **Memory:** 16GB+ recommended

#### Convention Center Profile
- **Target:** 2,000-4,000 devices
- **Workers:** 12 GoFlow2, 6 Fluent Bit, 3 Telegraf
- **Buffer:** 150-175GB recommended
- **Memory:** 12GB+ recommended

#### Arena Profile
- **Target:** 1,000-3,000 devices
- **Workers:** 10 GoFlow2, 4 Fluent Bit, 2 Telegraf
- **Buffer:** 100-150GB recommended
- **Memory:** 8-12GB recommended

#### Balanced Profile
- **Target:** Up to 1,000 devices
- **Workers:** 8 GoFlow2, 4 Fluent Bit, 2 Telegraf
- **Buffer:** 100GB recommended
- **Memory:** 8GB+ recommended

## 🌐 Network Configuration

### Port Requirements

#### Inbound (Collection)
| Port | Protocol | Service | Purpose |
|------|----------|---------|---------|
| 514 | UDP | Syslog | RFC3164/RFC5424 messages |
| 1514 | TCP | Syslog | TCP syslog (optional) |
| 2055 | UDP | NetFlow | NetFlow v5/v9 |
| 4739 | UDP | IPFIX | IPFIX flows |
| 6343 | UDP | sFlow | sFlow v5 |
| 162 | UDP | SNMP | SNMP traps |
| 8084 | TCP | HTTP | Windows Events JSON |
| 8080 | TCP | HTTP | Web control panel |

#### Outbound (Forwarding via VPN)
| Destination | Port | Protocol | Service |
|-------------|------|----------|---------|
| obs.rectitude.net | 1514 | UDP | Syslog forwarding |
| obs.rectitude.net | 2055 | UDP | NetFlow forwarding |
| obs.rectitude.net | 4739 | UDP | IPFIX forwarding |
| obs.rectitude.net | 6343 | UDP | sFlow forwarding |
| obs.rectitude.net | 162 | UDP | SNMP trap forwarding |
| obs.rectitude.net | 8084 | TCP | Windows Events |
| obs.rectitude.net | 8086 | TCP | InfluxDB metrics |

### Device Configuration Examples

#### Cisco ASA Firewall
```
logging host 192.168.1.100
logging trap informational
flow-export destination 192.168.1.100 2055
snmp-server host 192.168.1.100 community public
```

#### Cisco Switch
```
logging host 192.168.1.100
ip flow-export destination 192.168.1.100 2055
ip flow-export version 9
snmp-server host 192.168.1.100 community public
```

#### Palo Alto Firewall
```
set deviceconfig system syslog-server 192.168.1.100 server 192.168.1.100
set deviceconfig system syslog-server 192.168.1.100 port 514
set network netflow-monitor netflow-profile server-ip 192.168.1.100
set network netflow-monitor netflow-profile server-port 2055
```

#### Windows Server
```powershell
# Configure Event Log forwarding to HTTP endpoint
New-WinEvent -ProviderName "Microsoft-Windows-EventLog" -Id 1 -Payload @("Test event")
# Configure Syslog using PowerShell modules or third-party tools
```

## 🔧 Management and Monitoring

### Web Control Panel Access

When DHCP is active, access the web control panel at:
```
http://[appliance-ip]:8080
```

**Features:**
- Real-time service status dashboard
- Network configuration management
- VPN connection monitoring
- Diagnostic tools (ping, traceroute, port testing)
- Live log viewing with filtering
- Service restart controls
- System metrics and performance graphs

### Terminal Menu Interface

When no DHCP is detected, the appliance presents an interactive terminal menu:
- Network interface configuration (IP, subnet, gateway)
- Hostname and timezone settings
- Connectivity testing and validation
- Service status monitoring
- Configuration persistence

### Health Monitoring

#### Built-in Health Checks
```bash
# Check container health
docker inspect noc-raven --format='{{.State.Health.Status}}'

# Monitor service status
docker exec noc-raven supervisorctl status

# View real-time logs
docker logs -f noc-raven

# Check telemetry processing
docker exec noc-raven tail -f /var/log/noc-raven/fluent-bit.log
docker exec noc-raven tail -f /var/log/noc-raven/goflow2.log
```

#### Performance Metrics
```bash
# Monitor resource usage
docker stats noc-raven

# Check disk usage
docker exec noc-raven df -h /data

# Network statistics
docker exec noc-raven ss -tuln | grep -E ':(514|2055|6343|162|8084|8080)'
```

#### VPN Status
```bash
# Check VPN connection
docker exec noc-raven ip addr show tun0
docker exec noc-raven ping -c 3 obs.rectitude.net

# VPN logs
docker exec noc-raven tail -f /var/log/noc-raven/openvpn.log
```

## 🛠️ Troubleshooting

### Common Issues and Solutions

#### 1. Container Won't Start
```bash
# Check Docker logs
docker logs noc-raven

# Common causes:
# - Missing VPN configuration file
# - Incorrect permissions on volumes
# - Port conflicts with other services
```

#### 2. No Telemetry Data Received
```bash
# Verify ports are listening
docker exec noc-raven ss -tuln | grep -E ':(514|2055|6343|162)'

# Check device configuration
# Verify firewall rules
# Test network connectivity from devices
```

#### 3. VPN Connection Issues
```bash
# Verify VPN configuration
docker exec noc-raven cat /config/vpn/client.ovpn

# Check OpenVPN logs
docker exec noc-raven tail -f /var/log/noc-raven/openvpn.log

# Test manual VPN connection
docker exec noc-raven openvpn --config /config/vpn/client.ovpn --verb 3
```

#### 4. High Memory Usage
```bash
# Monitor memory usage
docker stats noc-raven

# Check buffer sizes
docker exec noc-raven du -sh /data/*

# Adjust performance profile or buffer settings
```

#### 5. Web Panel Not Accessible
```bash
# Verify web service is running
docker exec noc-raven pgrep nginx

# Check port binding
docker port noc-raven

# Test local connectivity
docker exec noc-raven curl -s http://localhost:8080
```

### Log Locations

All logs are available within the container:
```bash
# Application logs
/var/log/noc-raven/entrypoint.log      # Main application log
/var/log/noc-raven/fluent-bit.log      # Syslog collection
/var/log/noc-raven/goflow2.log         # Flow collection
/var/log/noc-raven/telegraf.log        # SNMP/metrics
/var/log/noc-raven/vector.log          # Windows Events
/var/log/noc-raven/openvpn.log         # VPN connection
/var/log/noc-raven/nginx.log           # Web panel

# Data directories
/data/syslog/                          # Local syslog storage
/data/flows/                           # Local flow storage
/data/buffer/                          # Buffer management
```

## 🔐 Security Considerations

### Network Security
- All telemetry forwarding occurs through encrypted VPN tunnel
- Local collection ports do not require authentication (by design for performance)
- Web control panel should be restricted to management networks
- Consider firewall rules to limit access to collection ports

### Container Security
- Container runs as non-root user (nocraven:nocraven) where possible
- Privileged mode required for network operations only
- Sensitive data (VPN credentials) should be mounted as secrets
- Regular security updates via image rebuilds

### Data Protection
- Local buffer data is encrypted at rest (Docker volume encryption)
- VPN tunnel provides encryption in transit
- No sensitive telemetry data is logged in plain text
- Automatic cleanup of aged buffer data

## 📈 Performance Tuning

### System-Level Optimizations

#### Linux Kernel Parameters
```bash
# Increase network buffers
echo 'net.core.rmem_max = 134217728' >> /etc/sysctl.conf
echo 'net.core.wmem_max = 134217728' >> /etc/sysctl.conf
echo 'net.core.rmem_default = 8388608' >> /etc/sysctl.conf
echo 'net.core.wmem_default = 8388608' >> /etc/sysctl.conf
echo 'net.core.netdev_max_backlog = 10000' >> /etc/sysctl.conf

# Apply settings
sysctl -p
```

#### Docker Host Configuration
```bash
# Increase Docker resource limits
echo '{"storage-driver": "overlay2", "log-driver": "json-file", "log-opts": {"max-size": "100m", "max-file": "3"}}' > /etc/docker/daemon.json
systemctl restart docker
```

### Application-Level Tuning

#### High-Volume Venues (10,000+ devices)
```bash
# Custom environment variables for extreme performance
docker run -d \
  --name noc-raven-mega \
  -e PERFORMANCE_PROFILE=stadium \
  -e FLUENT_BIT_WORKERS=12 \
  -e GOFLOW2_WORKERS=24 \
  -e TELEGRAF_WORKERS=6 \
  -e BUFFER_SIZE=500GB \
  --memory=32g \
  --cpus=16 \
  rectitude369/noc-raven:latest
```

### Monitoring Performance

#### Key Performance Indicators
- **Telemetry Ingestion Rate**: Messages/flows per second
- **Buffer Utilization**: Percentage of local storage used
- **VPN Throughput**: Data transmitted over VPN tunnel
- **Memory Usage**: RAM consumption by collectors
- **CPU Utilization**: Processing load distribution

#### Performance Monitoring Tools
```bash
# Real-time stats
docker exec noc-raven htop
docker exec noc-raven iotop

# Network statistics  
docker exec noc-raven ngrep -d any port 514
docker exec noc-raven tcpdump -i any port 2055 -c 100

# Application metrics
docker exec noc-raven curl -s http://localhost:2020/api/v1/metrics
```

## 📞 Support and Maintenance

### Support Channels
- **Technical Support:** support@rectitude369.com
- **Emergency Hotline:** Available 24/7 for production issues
- **Documentation:** [https://docs.rectitude369.com/noc-raven](https://docs.rectitude369.com/noc-raven)
- **Community Forum:** [https://community.rectitude369.com](https://community.rectitude369.com)

### Maintenance Schedule

#### Weekly
- Review system resource utilization
- Check VPN connection stability
- Monitor telemetry ingestion rates
- Validate configuration backups

#### Monthly
- Update Docker image to latest version
- Review and rotate logs
- Performance optimization review
- Security patch assessment

#### Quarterly
- Comprehensive system health audit
- Disaster recovery testing
- Capacity planning review
- Documentation updates

### Backup and Recovery

#### Configuration Backup
```bash
# Backup configuration volume
docker run --rm -v noc-raven-config:/source -v $(pwd):/backup alpine tar czf /backup/noc-raven-config-$(date +%Y%m%d).tar.gz -C /source .

# Backup data volume (if needed)
docker run --rm -v noc-raven-data:/source -v $(pwd):/backup alpine tar czf /backup/noc-raven-data-$(date +%Y%m%d).tar.gz -C /source .
```

#### Disaster Recovery
```bash
# Restore configuration
docker volume create noc-raven-config
docker run --rm -v noc-raven-config:/target -v $(pwd):/backup alpine tar xzf /backup/noc-raven-config-YYYYMMDD.tar.gz -C /target

# Redeploy container
docker run -d --name noc-raven-restored -v noc-raven-config:/config rectitude369/noc-raven:latest
```

## 📄 Licensing and Compliance

**Copyright © 2025 Rectitude 369, LLC. All rights reserved.**

NoC Raven is proprietary software licensed for use with Rectitude 369 observability infrastructure. Redistribution or modification without explicit written permission is prohibited.

### Third-Party Components
- **Fluent Bit**: Apache License 2.0
- **GoFlow2**: MIT License  
- **Telegraf**: MIT License
- **Vector**: Mozilla Public License 2.0
- **OpenVPN**: GPL License
- **Alpine Linux**: Various open source licenses

### Compliance
- GDPR-ready data handling
- SOC 2 Type II compatible logging
- HIPAA-compliant data transmission (via VPN)
- ISO 27001 security practices

---

**🦅 Ready to deploy NoC Raven in your venue environment?**

For deployment assistance, technical support, or custom configurations, contact our technical team at support@rectitude369.com.

**NoC Raven - Soaring above the network complexity** 🦅
