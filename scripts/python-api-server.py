#!/usr/bin/env python3
"""
🦅 NoC Raven - Python HTTP API Server
Simple HTTP server for configuration management using only built-in Python libraries
"""

import json
import logging
import os
import subprocess
import sys
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import socket
import time

# Configuration
API_PORT = int(os.getenv('API_PORT', '5001'))
LOG_FILE = "/var/log/noc-raven/python-api-server.log"

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [PYTHON-API] %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, mode='a'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class NoCARAvenAPIHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Override to use our logger
        logger.info(format % args)
    
    def _send_cors_headers(self):
        """Send CORS headers"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-cache')
    
    def _send_json_response(self, data, status_code=200):
        """Send JSON response with proper headers"""
        json_data = json.dumps(data, indent=2)
        
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self._send_cors_headers()
        self.send_header('Content-Length', str(len(json_data)))
        self.end_headers()
        self.wfile.write(json_data.encode('utf-8'))
    
    def do_OPTIONS(self):
        """Handle preflight CORS requests"""
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        logger.info(f"GET {path}")
        
        try:
            if path == '/health':
                self._send_json_response({
                    'status': 'healthy',
                    'timestamp': datetime.now().isoformat()
                })
            
            elif path == '/api/system/status':
                status = self._get_system_status()
                self._send_json_response(status)
            
            elif path == '/api/config':
                config = self._get_current_config()
                self._send_json_response(config)
            
            else:
                self._send_json_response({
                    'error': 'Not found',
                    'path': path,
                    'timestamp': datetime.now().isoformat()
                }, 404)
                
        except Exception as e:
            logger.error(f"Error handling GET {path}: {e}")
            self._send_json_response({
                'error': 'Internal server error',
                'message': str(e),
                'timestamp': datetime.now().isoformat()
            }, 500)
    
    def do_POST(self):
        """Handle POST requests"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        logger.info(f"POST {path}")
        
        try:
            # Read POST data
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            
            if path == '/api/config':
                result = self._save_config(post_data)
                self._send_json_response(result)
            
            elif path.startswith('/api/services/') and path.endswith('/restart'):
                service_name = path.split('/')[-2]  # Extract service name
                result = self._restart_service(service_name)
                self._send_json_response(result)
            
            else:
                self._send_json_response({
                    'error': 'Not found',
                    'path': path,
                    'timestamp': datetime.now().isoformat()
                }, 404)
                
        except Exception as e:
            logger.error(f"Error handling POST {path}: {e}")
            self._send_json_response({
                'error': 'Internal server error',
                'message': str(e),
                'timestamp': datetime.now().isoformat()
            }, 500)
    
    def _get_system_status(self):
        """Get real-time system status"""
        services = {}
        
        # Check each service
        service_configs = {
            'nginx': {'port': 8080, 'process': 'nginx'},
            'vector': {'port': 8084, 'process': 'vector'},
            'fluent-bit': {'port': 5140, 'process': 'fluent-bit'},
            'goflow2': {'port': 2055, 'process': 'goflow2'},
            'telegraf': {'port': 161, 'process': 'telegraf'}
        }
        
        healthy_count = 0
        
        for service_name, config in service_configs.items():
            try:
                # Check if process is running
                process_running = False
                try:
                    result = subprocess.run(['pgrep', config['process']], 
                                          capture_output=True, text=True, timeout=5)
                    process_running = result.returncode == 0
                except:
                    process_running = False
                
                # Check port if relevant
                port_open = False
                if config['port'] and config['port'] < 1024 or service_name == 'nginx':
                    try:
                        # For privileged ports or nginx, just check process
                        port_open = process_running
                    except:
                        port_open = False
                elif config['port']:
                    try:
                        # Try to connect to port
                        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        sock.settimeout(1)
                        result = sock.connect_ex(('localhost', config['port']))
                        sock.close()
                        port_open = result == 0
                    except:
                        port_open = False
                
                # Determine status
                if process_running:
                    if config['port'] and not port_open and service_name != 'telegraf':
                        status = 'degraded'
                    else:
                        status = 'healthy'
                        healthy_count += 1
                else:
                    status = 'failed'
                
                services[service_name] = {
                    'status': status,
                    'port': config['port'],
                    'process_running': process_running,
                    'port_open': port_open,
                    'critical': service_name != 'telegraf'
                }
                
            except Exception as e:
                logger.error(f"Error checking {service_name}: {e}")
                services[service_name] = {
                    'status': 'error',
                    'port': config['port'],
                    'process_running': False,
                    'port_open': False,
                    'critical': service_name != 'telegraf',
                    'error': str(e)
                }
        
        # Calculate overall system status
        if healthy_count >= 3:
            system_status = 'healthy'
        elif healthy_count >= 2:
            system_status = 'degraded'
        else:
            system_status = 'failed'
        
        # Get uptime
        try:
            with open('/proc/uptime', 'r') as f:
                uptime_seconds = float(f.readline().split()[0])
                hours = int(uptime_seconds // 3600)
                minutes = int((uptime_seconds % 3600) // 60)
                uptime = f"{hours}h {minutes}m"
        except:
            uptime = "unknown"
        
        return {
            'services': services,
            'system_status': system_status,
            'timestamp': datetime.now().isoformat(),
            'uptime': uptime
        }
    
    def _get_current_config(self):
        """Get current configuration"""
        # Read actual config values where possible
        syslog_port = 5140
        netflow_port = 2055
        
        # Try to read fluent-bit config
        try:
            with open('/opt/noc-raven/config/fluent-bit-basic.conf', 'r') as f:
                content = f.read()
                # Simple parsing for port
                for line in content.split('\n'):
                    if 'Port' in line and line.strip().startswith('Port'):
                        try:
                            syslog_port = int(line.split()[-1])
                        except:
                            pass
        except:
            pass
        
        return {
            'collection': {
                'syslogPort': syslog_port,
                'netflowPort': netflow_port,
                'snmpPort': 161,
                'wmiPort': 6343
            },
            'forwarding': {
                'destinations': [
                    {
                        'name': 'Primary Collector',
                        'host': 'obs.rectitude.net',
                        'port': 1514,
                        'protocol': 'UDP'
                    }
                ]
            },
            'alerts': {
                'enabled': False
            },
            'timestamp': datetime.now().isoformat()
        }
    
    def _save_config(self, post_data):
        """Save configuration changes"""
        try:
            config_data = json.loads(post_data)
            logger.info(f"Saving configuration: {json.dumps(config_data, indent=2)}")
            
            updated_services = []
            
            # Handle collection settings
            if 'collection' in config_data:
                collection = config_data['collection']
                
                # Update syslog port if changed
                if 'syslogPort' in collection:
                    new_port = int(collection['syslogPort'])
                    if self._update_fluent_bit_port(new_port):
                        updated_services.append('fluent-bit')
                        logger.info(f"Updated fluent-bit syslog port to {new_port}")
                
                # Update netflow port if changed
                if 'netflowPort' in collection:
                    new_port = int(collection['netflowPort'])
                    if self._update_goflow2_port(new_port):
                        updated_services.append('goflow2')
                        logger.info(f"Updated goflow2 netflow port to {new_port}")
            
            # Save timestamp
            try:
                os.makedirs('/etc/noc-raven', exist_ok=True)
                with open('/etc/noc-raven/last_config_update', 'w') as f:
                    f.write(datetime.now().isoformat())
            except:
                pass
            
            return {
                'success': True,
                'message': 'Configuration saved successfully',
                'updated_services': updated_services,
                'timestamp': datetime.now().isoformat()
            }
            
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in config save: {e}")
            return {
                'success': False,
                'message': f'Invalid JSON: {str(e)}',
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error saving config: {e}")
            return {
                'success': False,
                'message': f'Failed to save configuration: {str(e)}',
                'timestamp': datetime.now().isoformat()
            }
    
    def _update_fluent_bit_port(self, new_port):
        """Update fluent-bit syslog port"""
        config_file = '/opt/noc-raven/config/fluent-bit-basic.conf'
        
        try:
            if not os.path.exists(config_file):
                logger.error(f"Fluent-bit config not found: {config_file}")
                return False
            
            # Read current config
            with open(config_file, 'r') as f:
                lines = f.readlines()
            
            # Update port line
            updated = False
            for i, line in enumerate(lines):
                if line.strip().startswith('Port') and 'INPUT' in ''.join(lines[max(0, i-10):i]):
                    lines[i] = f"    Port           {new_port}\n"
                    updated = True
                    break
            
            if updated:
                # Create backup
                backup_file = f"{config_file}.backup.{int(time.time())}"
                with open(backup_file, 'w') as f:
                    f.writelines(lines)
                
                # Write updated config
                with open(config_file, 'w') as f:
                    f.writelines(lines)
                
                logger.info(f"Updated fluent-bit config, backup saved to {backup_file}")
                return True
            
        except Exception as e:
            logger.error(f"Error updating fluent-bit port: {e}")
        
        return False
    
    def _update_goflow2_port(self, new_port):
        """Update goflow2 netflow port"""
        startup_script = '/opt/noc-raven/scripts/start-goflow2-production.sh'
        
        try:
            if not os.path.exists(startup_script):
                logger.error(f"GoFlow2 startup script not found: {startup_script}")
                return False
            
            # Read current script
            with open(startup_script, 'r') as f:
                content = f.read()
            
            # Replace port
            updated_content = content.replace(':2055', f':{new_port}')
            
            if updated_content != content:
                # Create backup
                backup_file = f"{startup_script}.backup.{int(time.time())}"
                with open(backup_file, 'w') as f:
                    f.write(content)
                
                # Write updated script
                with open(startup_script, 'w') as f:
                    f.write(updated_content)
                
                logger.info(f"Updated goflow2 startup script, backup saved to {backup_file}")
                return True
            
        except Exception as e:
            logger.error(f"Error updating goflow2 port: {e}")
        
        return False
    
    def _restart_service(self, service_name):
        """Restart a service"""
        logger.info(f"Restart requested for service: {service_name}")
        
        try:
            # Use the production service manager to restart
            cmd = ['/opt/noc-raven/scripts/production-service-manager.sh', 'restart', service_name]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                return {
                    'success': True,
                    'message': f'Service {service_name} restarted successfully',
                    'timestamp': datetime.now().isoformat()
                }
            else:
                error_msg = result.stderr.strip() or result.stdout.strip() or 'Unknown error'
                logger.error(f"Service restart failed: {error_msg}")
                return {
                    'success': False,
                    'message': f'Failed to restart {service_name}: {error_msg}',
                    'timestamp': datetime.now().isoformat()
                }
                
        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'message': f'Timeout restarting {service_name}',
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error restarting {service_name}: {e}")
            return {
                'success': False,
                'message': f'Error restarting {service_name}: {str(e)}',
                'timestamp': datetime.now().isoformat()
            }

def main():
    """Start the HTTP API server"""
    try:
        # Ensure log directory exists
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        
        logger.info(f"Starting Python HTTP API server on port {API_PORT}")
        
        server = HTTPServer(('0.0.0.0', API_PORT), NoCARAvenAPIHandler)
        logger.info(f"HTTP API server listening on port {API_PORT}")
        
        server.serve_forever()
        
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
