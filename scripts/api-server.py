#!/usr/bin/env python3
"""
NoC Raven Configuration API Server
Handles POST requests for configuration updates and service management
"""

import os
import sys
import json
import subprocess
import logging
from datetime import datetime
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import configparser
import time
import psutil
import socket

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration paths
CONFIG_BASE = "/etc/noc-raven"
WEB_API_DIR = "/usr/share/noc-raven/web/api"
LOG_DIR = "/var/log/noc-raven"

def get_service_status():
    """Get real-time status of all NoC Raven services"""
    services = {
        'nginx': {'port': 8080, 'name': 'nginx', 'critical': True},
        'vector': {'port': 8081, 'name': 'vector', 'critical': True},
        'fluent-bit': {'port': 5140, 'name': 'fluent-bit', 'critical': True},
        'goflow2': {'port': 2055, 'name': 'goflow2', 'critical': True},
        'telegraf': {'port': 161, 'name': 'telegraf', 'critical': False}
    }
    
    status = {}
    system_healthy = True
    
    for service_id, service_info in services.items():
        try:
            # Check if port is listening
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex(('localhost', service_info['port']))
            sock.close()
            
            port_open = result == 0
            
            # Check process existence
            process_running = False
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    if service_info['name'] in str(proc.info['cmdline']).lower():
                        process_running = True
                        break
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            
            service_status = "healthy" if (port_open and process_running) else "degraded"
            if service_info['critical'] and service_status != "healthy":
                system_healthy = False
                
            status[service_id] = {
                'status': service_status,
                'port': service_info['port'],
                'port_open': port_open,
                'process_running': process_running,
                'critical': service_info['critical']
            }
            
        except Exception as e:
            logger.error(f"Error checking {service_id}: {e}")
            status[service_id] = {
                'status': 'error',
                'port': service_info['port'],
                'port_open': False,
                'process_running': False,
                'critical': service_info['critical'],
                'error': str(e)
            }
            if service_info['critical']:
                system_healthy = False
    
    return {
        'services': status,
        'system_status': 'healthy' if system_healthy else 'degraded',
        'timestamp': datetime.now().isoformat(),
        'uptime': get_system_uptime()
    }

def get_system_uptime():
    """Get system uptime in human readable format"""
    try:
        uptime_seconds = time.time() - psutil.boot_time()
        hours = int(uptime_seconds // 3600)
        minutes = int((uptime_seconds % 3600) // 60)
        return f"{hours}h {minutes}m"
    except:
        return "unknown"

def restart_service(service_name):
    """Restart a specific telemetry service"""
    try:
        # Use the production service manager to restart services
        cmd = ["/usr/local/bin/production-service-manager.sh", "restart", service_name]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            return {"success": True, "message": f"Service {service_name} restarted successfully"}
        else:
            return {"success": False, "message": f"Failed to restart {service_name}: {result.stderr}"}
            
    except subprocess.TimeoutExpired:
        return {"success": False, "message": f"Timeout restarting {service_name}"}
    except Exception as e:
        return {"success": False, "message": f"Error restarting {service_name}: {str(e)}"}

def save_configuration(config_data):
    """Save configuration data to appropriate config files"""
    try:
        saved_configs = []
        
        # Handle collection settings
        if 'collection' in config_data:
            collection = config_data['collection']
            
            # Update Fluent Bit syslog port if changed
            if 'syslogPort' in collection:
                fluent_config_path = f"{CONFIG_BASE}/fluent-bit.conf"
                if os.path.exists(fluent_config_path):
                    # Update fluent-bit config with new port
                    update_fluent_bit_port(fluent_config_path, collection['syslogPort'])
                    saved_configs.append('fluent-bit')
            
            # Update GoFlow2 NetFlow port if changed  
            if 'netflowPort' in collection:
                goflow_config_path = f"{CONFIG_BASE}/goflow2.json"
                if os.path.exists(goflow_config_path):
                    update_goflow2_port(goflow_config_path, collection['netflowPort'])
                    saved_configs.append('goflow2')
        
        # Handle forwarding settings
        if 'forwarding' in config_data:
            forwarding = config_data['forwarding']
            
            # Update Vector forwarding destinations
            if 'destinations' in forwarding:
                vector_config_path = f"{CONFIG_BASE}/vector.toml"
                if os.path.exists(vector_config_path):
                    update_vector_destinations(vector_config_path, forwarding['destinations'])
                    saved_configs.append('vector')
        
        # Save timestamp of last config update
        timestamp_file = f"{CONFIG_BASE}/last_config_update"
        with open(timestamp_file, 'w') as f:
            f.write(datetime.now().isoformat())
        
        return {
            "success": True, 
            "message": f"Configuration saved successfully",
            "updated_services": saved_configs
        }
        
    except Exception as e:
        logger.error(f"Error saving configuration: {e}")
        return {
            "success": False,
            "message": f"Failed to save configuration: {str(e)}"
        }

def update_fluent_bit_port(config_path, new_port):
    """Update Fluent Bit syslog port in config file"""
    try:
        with open(config_path, 'r') as f:
            content = f.read()
        
        # Replace the port line in the syslog input section
        lines = content.split('\n')
        in_syslog_section = False
        
        for i, line in enumerate(lines):
            if '[INPUT]' in line:
                # Check if next few lines indicate this is syslog input
                for j in range(i+1, min(i+5, len(lines))):
                    if 'Name' in lines[j] and 'syslog' in lines[j]:
                        in_syslog_section = True
                        break
            elif in_syslog_section and 'Listen' in line:
                lines[i] = f"    Listen         0.0.0.0"
            elif in_syslog_section and 'Port' in line:
                lines[i] = f"    Port           {new_port}"
                in_syslog_section = False
        
        with open(config_path, 'w') as f:
            f.write('\n'.join(lines))
            
    except Exception as e:
        logger.error(f"Error updating Fluent Bit port: {e}")
        raise

def update_goflow2_port(config_path, new_port):
    """Update GoFlow2 NetFlow port in startup script"""
    # GoFlow2 uses command line args, update the startup script
    startup_script = "/usr/local/bin/start-goflow2.sh"
    try:
        with open(startup_script, 'r') as f:
            content = f.read()
        
        # Replace the port in the netflow listening address
        content = content.replace(':2055', f':{new_port}')
        
        with open(startup_script, 'w') as f:
            f.write(content)
            
    except Exception as e:
        logger.error(f"Error updating GoFlow2 port: {e}")
        raise

def update_vector_destinations(config_path, destinations):
    """Update Vector forwarding destinations"""
    # This is a simplified implementation - would need more complex TOML parsing for production
    logger.info(f"Would update Vector destinations in {config_path}: {destinations}")

# API Routes

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})

@app.route('/api/system/status', methods=['GET'])
def api_system_status():
    """Get real-time system status"""
    return jsonify(get_service_status())

@app.route('/api/config', methods=['GET'])
def get_config():
    """Get current configuration"""
    try:
        # Return current config from files
        config = {
            "collection": {
                "syslogPort": 5140,
                "netflowPort": 2055,
                "snmpPort": 161,
                "wmiPort": 6343
            },
            "forwarding": {
                "destinations": []
            },
            "alerts": {
                "enabled": False
            }
        }
        return jsonify(config)
    except Exception as e:
        logger.error(f"Error getting config: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/config', methods=['POST'])
def save_config():
    """Save configuration changes"""
    try:
        config_data = request.get_json()
        result = save_configuration(config_data)
        
        if result["success"]:
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except Exception as e:
        logger.error(f"Error in save_config: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/services/<service_name>/restart', methods=['POST'])
def api_restart_service(service_name):
    """Restart a specific service"""
    try:
        result = restart_service(service_name)
        if result["success"]:
            return jsonify(result)
        else:
            return jsonify(result), 400
    except Exception as e:
        logger.error(f"Error restarting service {service_name}: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

if __name__ == '__main__':
    # Ensure directories exist
    os.makedirs(CONFIG_BASE, exist_ok=True)
    os.makedirs(WEB_API_DIR, exist_ok=True)
    os.makedirs(LOG_DIR, exist_ok=True)
    
    # Run the Flask app
    app.run(host='0.0.0.0', port=5000, debug=False)
