#!/usr/bin/env python3
# Simple HTTP server for config updates
# This runs on port 8081 and handles POST requests

import http.server
import socketserver
import json
import subprocess
import sys
import os
from datetime import datetime
import urllib.parse

PORT = 8082
CONFIG_SCRIPT = "/opt/noc-raven/scripts/config-update-service.sh"
CONFIG_FILE = "/opt/noc-raven/web/api/config.json"
LOG_FILE = "/opt/noc-raven/logs/config-server.log"

def log_message(message):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_entry = f"[{timestamp}] {message}"
    print(log_entry)
    try:
        with open(LOG_FILE, 'a') as f:
            f.write(log_entry + "\n")
    except:
        pass

class ConfigHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests for config file"""
        # Set CORS headers
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        
        try:
            # Read config file
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE, 'r') as f:
                    config_data = f.read()
                log_message(f"GET {self.path} - Serving config file")
                self.wfile.write(config_data.encode())
            else:
                log_message(f"GET {self.path} - Config file not found")
                error_response = {"error": "Configuration file not found"}
                self.wfile.write(json.dumps(error_response).encode())
        except Exception as e:
            log_message(f"GET {self.path} - Error reading config: {e}")
            error_response = {"error": "Failed to read configuration"}
            self.wfile.write(json.dumps(error_response).encode())
    
    def handle_service_restart(self, service_name):
        """Handle service restart requests"""
        log_message(f"Service restart request for: {service_name}")
        
        # Check if config script exists and is executable
        if not os.path.isfile(CONFIG_SCRIPT) or not os.access(CONFIG_SCRIPT, os.X_OK):
            log_message("Config script not found or not executable")
            return {"success": False, "message": "Service management not available"}
        
        try:
            result = subprocess.run(
                [CONFIG_SCRIPT, "restart-service", service_name],
                capture_output=True,
                text=True,
                timeout=15
            )
            
            if result.returncode == 0:
                log_message(f"Service {service_name} restart successful")
                return {"success": True, "message": f"Service {service_name} restarted successfully"}
            else:
                log_message(f"Service {service_name} restart failed: {result.stderr}")
                return {"success": False, "message": f"Failed to restart service {service_name}"}
            
        except subprocess.TimeoutExpired:
            log_message(f"Service {service_name} restart timed out")
            return {"success": False, "message": "Service restart timed out"}
        except Exception as e:
            log_message(f"Service {service_name} restart error: {e}")
            return {"success": False, "message": "Service restart failed"}
        
    def do_POST(self):
        # Set CORS headers
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        
        # Check if this is a service restart request
        if self.path.startswith('/restart/'):
            service_name = self.path.split('/')[-1]
            response = self.handle_service_restart(service_name)
            self.wfile.write(json.dumps(response).encode())
            return
        
        try:
            # Get content length
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                response = {"success": False, "message": "No data provided"}
                self.wfile.write(json.dumps(response).encode())
                return
            
            # Read POST data
            post_data = self.rfile.read(content_length).decode('utf-8')
            log_message(f"POST /api/config - Content: {post_data}")
            
            # Validate JSON
            try:
                config_data = json.loads(post_data)
            except json.JSONDecodeError as e:
                log_message(f"Invalid JSON: {e}")
                response = {"success": False, "message": "Invalid JSON data"}
                self.wfile.write(json.dumps(response).encode())
                return
            
            # Check if config script exists and is executable
            if not os.path.isfile(CONFIG_SCRIPT) or not os.access(CONFIG_SCRIPT, os.X_OK):
                log_message("Config script not found or not executable")
                response = {"success": False, "message": "Configuration service not available"}
                self.wfile.write(json.dumps(response).encode())
                return
            
            # Call config update script
            try:
                result = subprocess.run(
                    [CONFIG_SCRIPT, "update-full", post_data],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if result.returncode == 0:
                    log_message("Config update successful")
                    response = {"success": True, "message": "Configuration saved and services restarted successfully"}
                else:
                    log_message(f"Config update failed: {result.stderr}")
                    response = {"success": False, "message": "Failed to save configuration"}
                
            except subprocess.TimeoutExpired:
                log_message("Config update timed out")
                response = {"success": False, "message": "Configuration update timed out"}
            except Exception as e:
                log_message(f"Config update error: {e}")
                response = {"success": False, "message": "Configuration update failed"}
            
        except Exception as e:
            log_message(f"Request handling error: {e}")
            response = {"success": False, "message": "Internal server error"}
        
        self.wfile.write(json.dumps(response).encode())
    
    def log_message(self, format, *args):
        # Override to use our custom logging
        log_message(format % args)

if __name__ == "__main__":
    log_message(f"Starting config HTTP server on port {PORT}")
    
    try:
        with socketserver.TCPServer(("", PORT), ConfigHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        log_message("Server stopped by user")
    except Exception as e:
        log_message(f"Server error: {e}")
        sys.exit(1)
