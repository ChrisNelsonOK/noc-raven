# 🦅 NoC Raven - Telemetry Collection & Forwarding Appliance

![NoC Raven Banner](docs/images/noc-raven-banner.png)

**A turn-key lightweight and performant collector/forwarder Docker appliance for ingesting telemetry data from large-scale venue environments (stadiums, arenas, convention centers) and forwarding via VPN tunnel to centralized observability infrastructure.**

## 🎯 Overview

NoC Raven is designed for deployment in high-volume network environments with thousands of devices generating telemetry data including:
- **Syslog** (firewalls, switches, routers, WiFi controllers, APs)
- **NetFlow/sFlow/IPFIX** (network flow data)
- **SNMP Traps** (infrastructure alerts)
- **Metrics** (performance data from storage, datacenters, UPS systems)
- **Windows Events** (server and workstation logs)

### Key Features

- 🚀 **High Performance**: Handles thousands of devices in venue environments
- 🔄 **Resilient Buffering**: 2-week local storage during VPN outages
- 🌐 **VPN Integration**: OpenVPN Connect client with auto-reconnect
- 📱 **Dual Interface**: Terminal menu (DHCP-less) + Web control panel (DHCP)
- 🎨 **Modern UI**: Flashy, colorful web interface with real-time monitoring
- 🔧 **Network Tools**: Built-in ping, traceroute, connectivity testing
- 📊 **Real-time Monitoring**: Live service status and performance metrics

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           NoC Raven Appliance                        │
├─────────────────────────────────────────────────────────────────────┤
│  Terminal Menu Interface    │    Web Control Panel                   │
│  (No DHCP Mode)            │    (DHCP Mode)                         │
├─────────────────────────────────────────────────────────────────────┤
│                      Telemetry Collection Layer                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │
│  │ Fluent Bit  │ │   GoFlow2   │ │  Telegraf   │ │   Vector    │    │
│  │   Syslog    │ │ NetFlow/sFlow│ │ SNMP Traps  │ │  Win Events │    │
│  │  UDP:514    │ │ UDP:2055,6343│ │  UDP:162    │ │ HTTP:8084   │    │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    │
├─────────────────────────────────────────────────────────────────────┤
│                      Local Buffer & Storage                          │
│           ┌─────────────────────────────────────────┐               │
│           │        2-Week Ring Buffer               │               │
│           │    ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐     │               │
│           │    │Syslog│ │Flow │ │SNMP │ │Metrics│    │               │
│           │    └─────┘ └─────┘ └─────┘ └─────┘     │               │
│           └─────────────────────────────────────────┘               │
├─────────────────────────────────────────────────────────────────────┤
│                         VPN Tunnel Layer                             │
│                 ┌─────────────────────────────────┐                 │
│                 │      OpenVPN Connect Client     │                 │
│                 │    Auto-Reconnect & Health      │                 │
│                 └─────────────────────────────────┘                 │
├─────────────────────────────────────────────────────────────────────┤
│                      Forwarding Layer                                │
│                          obs.rectitude.net                          │
│     Syslog:1514  │  NetFlow:2055  │  SNMP:162  │  Metrics:9090      │
└─────────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Docker Engine 20.10+
- Docker Compose 2.0+
- Minimum 4GB RAM, 100GB storage for 2-week buffering
- Network access for VPN connectivity

### Deployment

1. **Pull and Run the Appliance**
```bash
docker run -d \
  --name noc-raven \
  --privileged \
  --network host \
  -v noc-raven-data:/data \
  -v noc-raven-config:/config \
  -v /path/to/your/vpn.ovpn:/config/vpn/client.ovpn \
  rectitude369/noc-raven:latest
```

2. **Access Interface**
   - **No DHCP**: Terminal menu appears automatically for network configuration
   - **With DHCP**: Web panel available at `http://[container-ip]:8080`

3. **Configure VPN**
   - Place your `.ovpn` profile file in `/config/vpn/client.ovpn`
   - Appliance will automatically establish VPN connection

4. **Configure Devices**
   - Point your network devices to send telemetry to the appliance IP
   - Syslog: UDP/514, NetFlow: UDP/2055, sFlow: UDP/6343, SNMP: UDP/162

## 📋 Supported Telemetry Types

### Syslog Collection
- **Protocols**: RFC3164, RFC5424 syslog formats
- **Port**: UDP/514 (configurable)
- **Sources**: Firewalls, switches, routers, WiFi controllers, APs
- **Buffering**: 2-week local retention

### NetFlow/sFlow/IPFIX
- **NetFlow**: v5, v9, IPFIX (UDP/2055, UDP/4739)
- **sFlow**: v5 (UDP/6343)
- **Sources**: Routers, switches, load balancers
- **Processing**: GoFlow2 high-performance collector

### SNMP Traps
- **Port**: UDP/162
- **Sources**: Infrastructure devices, UPS systems, storage arrays
- **Processing**: Telegraf SNMP receiver

### Metrics Collection
- **Format**: Prometheus metrics
- **Sources**: Custom device exporters, infrastructure monitoring
- **Collection**: Telegraf with manual device configuration

### Windows Events
- **Input**: Syslog forwarding (preferred) or JSON HTTP
- **Port**: HTTP/8084 (JSON endpoint)
- **Processing**: Vector pipeline

## 🖥️ User Interfaces

### Terminal Menu Interface
![Terminal Menu](docs/images/terminal-menu.png)

Activated when **no DHCP lease** is detected:
- Fancy ASCII "NoC Raven" banner with colors
- Network configuration (IP, subnet mask, gateway)
- Hostname configuration
- Timezone selection
- Technology-themed graphics and animations

### Web Control Panel
![Web Control Panel](docs/images/web-panel.png)

Available when **DHCP is active**:
- Modern, responsive web interface
- Real-time service status dashboard
- Network configuration management
- Service restart controls
- Testing tools (ping, traceroute, port checks)
- Live log viewer with filtering
- System metrics and performance monitoring

## 🔧 Configuration

### Network Settings
```yaml
# /config/network.yml
network:
  interface: eth0
  dhcp: true
  static_ip: 192.168.1.100
  netmask: 255.255.255.0
  gateway: 192.168.1.1
  dns: [8.8.8.8, 8.8.4.4]
  hostname: noc-raven-001
```

### VPN Configuration
```bash
# Place your OpenVPN profile
/config/vpn/client.ovpn

# VPN settings
/config/vpn/settings.yml:
  auto_connect: true
  reconnect_interval: 30
  health_check_interval: 60
  max_retry_attempts: 5
```

### Telemetry Endpoints
```yaml
# /config/endpoints.yml
remote_stack:
  hostname: obs.rectitude.net
  ip: 67.220.112.51
  endpoints:
    syslog: 
      port: 1514
      protocol: udp
    netflow: 
      port: 2055
      protocol: udp
    ipfix: 
      port: 4739
      protocol: udp
    sflow: 
      port: 6343
      protocol: udp
    snmp_traps: 
      port: 162
      protocol: udp
    json_logs: 
      port: 8084
      protocol: http
```

## 📊 Monitoring & Testing

### Built-in Testing Tools
- **Connectivity Test**: Verify reachability to obs.rectitude.net
- **Port Checks**: Test all required ports (1514, 2055, 4739, 6343, 162, 8084)
- **Network Tools**: Ping, traceroute, DNS resolution
- **VPN Status**: Connection state, throughput, latency
- **Service Health**: Individual collector status and performance

### Performance Metrics
- Packets processed per second
- Buffer utilization levels
- VPN connection quality
- Storage usage and retention
- Error rates and recovery statistics

## 🏢 Deployment Scenarios

### Stadium/Arena Deployment
```bash
# High-volume configuration for 5,000+ devices
docker run -d \
  --name noc-raven-stadium \
  --privileged \
  --network host \
  -e PERFORMANCE_PROFILE=high_volume \
  -e BUFFER_SIZE=200GB \
  -v noc-raven-stadium:/data \
  rectitude369/noc-raven:latest
```

### Convention Center Deployment
```bash
# Multi-segment network configuration
docker run -d \
  --name noc-raven-convention \
  --privileged \
  --network host \
  -e PERFORMANCE_PROFILE=multi_segment \
  -e NETWORK_SEGMENTS=10 \
  -v noc-raven-convention:/data \
  rectitude369/noc-raven:latest
```

## 🔒 Security Considerations

- VPN-only communication to remote stack
- No authentication required for telemetry collection (design choice for high throughput)
- Local web panel access control (optional)
- Secure storage of VPN credentials
- Network isolation recommendations

## 📈 Performance Specifications

### Capacity Limits
- **Maximum Devices**: 10,000+ simultaneous senders
- **Syslog Rate**: 100,000+ messages/second
- **Flow Processing**: 50,000+ flows/second
- **SNMP Traps**: 10,000+ traps/second
- **Buffer Capacity**: 2 weeks @ maximum rate

### System Requirements
- **CPU**: 4+ cores recommended
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 500GB minimum for full buffering
- **Network**: Gigabit Ethernet recommended

## 🛠️ Troubleshooting

### Common Issues
1. **VPN Connection Failed**
   - Check `.ovpn` file format and credentials
   - Verify network connectivity to VPN endpoint
   - Review VPN logs in web panel

2. **High Memory Usage**
   - Monitor buffer utilization in web panel
   - Adjust retention policies if needed
   - Check for VPN connectivity issues causing buffer buildup

3. **Missing Telemetry**
   - Verify device configuration points to correct appliance IP
   - Check firewall rules on device network
   - Use built-in port testing tools

### Log Locations
```bash
# Access logs within container
docker exec -it noc-raven tail -f /var/log/noc-raven/
  ├── fluent-bit.log
  ├── goflow2.log
  ├── telegraf.log
  ├── openvpn.log
  └── web-panel.log
```

## 📄 License

Copyright (c) 2025 Rectitude 369, LLC. All rights reserved.

---

**Ready to deploy NoC Raven in your venue environment?** 🦅

Contact: support@rectitude369.com
