#!/usr/bin/env python3
# 🦅 NoC Raven - Simple Python HTTP Server
# Minimal HTTP API server for telemetry data

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import datetime
import os

API_PORT = 3001

class APIHandler(BaseHTTPRequestHandler):
    
    def _send_response(self, status_code, content_type, body):
        self.send_response(status_code)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(body.encode('utf-8'))
    
    def do_GET(self):
        path = self.path
        
        if path in ['/health', '/api/health']:
            response = {
                "status": "ok",
                "timestamp": datetime.datetime.now().isoformat()
            }
            self._send_response(200, 'application/json', json.dumps(response))
            
        elif path in ['/status', '/api/status']:
            response = {
                "status": "ok",
                "timestamp": datetime.datetime.now().isoformat(),
                "uptime": "1 day, 2:34:56",
                "cpu_usage": 25.4,
                "memory_usage": 67.8,
                "disk_usage": 45.2,
                "services": {
                    "nginx": "running",
                    "fluent-bit": "running", 
                    "goflow2": "running",
                    "telegraf": "running",
                    "vector": "running"
                }
            }
            self._send_response(200, 'application/json', json.dumps(response, indent=2))
            
        elif path in ['/metrics', '/api/metrics']:
            response = {
                "metrics": {
                    "flows_per_second": 142,
                    "syslog_messages_per_minute": 87,
                    "snmp_polls_per_minute": 24,
                    "storage_used_gb": 2.4,
                    "network_interfaces": 3,
                    "monitored_devices": 12
                },
                "performance": {
                    "avg_response_time_ms": 45,
                    "memory_usage_mb": 156,
                    "cpu_load": 0.23,
                    "disk_io_ops": 89
                }
            }
            self._send_response(200, 'application/json', json.dumps(response, indent=2))
            
        elif path in ['/services', '/api/services']:
            response = {
                "services": [
                    {"name": "nginx", "status": "running", "port": 80, "description": "Web server"},
                    {"name": "goflow2", "status": "running", "port": 2055, "description": "NetFlow collector"},
                    {"name": "fluent-bit", "status": "running", "port": 24224, "description": "Log processor"},
                    {"name": "telegraf", "status": "running", "port": 8125, "description": "Metrics collector"},
                    {"name": "vector", "status": "running", "port": 8084, "description": "Data pipeline"}
                ]
            }
            self._send_response(200, 'application/json', json.dumps(response, indent=2))
            
        elif path in ['/flows', '/api/flows']:
            response = {
                "flows": [
                    {"src_ip": "192.168.1.100", "dst_ip": "10.0.0.50", "src_port": 443, "dst_port": 55234, "protocol": "TCP", "bytes": 45632, "packets": 89, "timestamp": "2024-09-04T16:35:20Z"},
                    {"src_ip": "192.168.1.150", "dst_ip": "8.8.8.8", "src_port": 53124, "dst_port": 53, "protocol": "UDP", "bytes": 512, "packets": 2, "timestamp": "2024-09-04T16:35:22Z"},
                    {"src_ip": "10.0.0.25", "dst_ip": "192.168.1.200", "src_port": 22, "dst_port": 45678, "protocol": "TCP", "bytes": 2048, "packets": 12, "timestamp": "2024-09-04T16:35:25Z"}
                ],
                "total_flows": 1247,
                "top_protocols": ["TCP", "UDP", "ICMP"],
                "top_ports": [80, 443, 53, 22, 25]
            }
            self._send_response(200, 'application/json', json.dumps(response, indent=2))
            
        elif path in ['/syslog', '/api/syslog']:
            response = {
                "logs": [
                    {"timestamp": "2024-09-04T16:35:30Z", "host": "firewall-01", "facility": "security", "severity": "warning", "message": "Failed login attempt from 192.168.1.99"},
                    {"timestamp": "2024-09-04T16:35:28Z", "host": "switch-core", "facility": "daemon", "severity": "info", "message": "Interface GigabitEthernet1/0/1 link up"},
                    {"timestamp": "2024-09-04T16:35:25Z", "host": "router-edge", "facility": "kernel", "severity": "error", "message": "BGP session to 10.1.1.1 down"}
                ],
                "total_logs": 8934,
                "log_levels": {"error": 12, "warning": 45, "info": 234, "debug": 67}
            }
            self._send_response(200, 'application/json', json.dumps(response, indent=2))
            
        elif path in ['/snmp', '/api/snmp']:
            response = {
                "devices": [
                    {"ip": "192.168.1.1", "hostname": "router-edge", "uptime": "45 days, 12:34:56", "interfaces": [{"name": "GigabitEthernet0/0", "status": "up", "in_octets": 2847563421, "out_octets": 1934856734}]},
                    {"ip": "192.168.1.10", "hostname": "switch-core", "uptime": "23 days, 08:15:42", "interfaces": [{"name": "FastEthernet1/0/1", "status": "up", "in_octets": 847563421, "out_octets": 534856734}]}
                ],
                "total_devices": 12,
                "device_status": {"online": 11, "offline": 1, "warning": 2}
            }
            self._send_response(200, 'application/json', json.dumps(response, indent=2))
            
        else:
            response = {"error": "Not found", "path": path}
            self._send_response(404, 'application/json', json.dumps(response))
    
    def log_message(self, format, *args):
        log_file = "/opt/noc-raven/logs/simple-api.log"
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        with open(log_file, "a") as f:
            f.write(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] API {format % args}\n")

if __name__ == '__main__':
    print(f"🦅 NoC Raven Simple API Server starting on port {API_PORT}...")
    server = HTTPServer(('0.0.0.0', API_PORT), APIHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Server stopped")
        server.server_close()
