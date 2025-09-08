#!/usr/bin/env python3
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import subprocess
import sys
from datetime import datetime

PORT = 8082
CONFIG_FILE = "/opt/noc-raven/web/api/config.json"
CONFIG_SCRIPT = "/opt/noc-raven/scripts/config-update-service.sh"

def log_message(msg):
    print(f"[{datetime.now().isoformat()}] {msg}")
    sys.stdout.flush()

class ConfigHandler(BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    
    def send_json_response(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()
    
    def do_GET(self):
        if self.path == '/config':
            try:
                with open(CONFIG_FILE, 'r') as f:
                    config = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(config.encode())
            except Exception as e:
                log_message(f"Error reading config: {e}")
                self.send_json_response({"error": "Failed to read configuration"}, 500)
        else:
            self.send_json_response({"error": "Not found"}, 404)
    
    def do_POST(self):
        if self.path == '/config':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                try:
                    # Read POST data
                    post_data = self.rfile.read(content_length).decode()
                    
                    # Validate JSON
                    try:
                        json.loads(post_data)
                    except json.JSONDecodeError:
                        self.send_json_response({"error": "Invalid JSON data"}, 400)
                        return
                    
                    # Call config update script
                    result = subprocess.run(
                        [CONFIG_SCRIPT, "update-full", post_data],
                        capture_output=True,
                        text=True,
                        timeout=30
                    )
                    
                    if result.returncode == 0:
                        log_message("Config update successful")
                        self.send_json_response({
                            "success": True,
                            "message": "Configuration saved successfully"
                        })
                    else:
                        log_message(f"Config update failed: {result.stderr}")
                        self.send_json_response({
                            "success": False,
                            "message": "Failed to save configuration"
                        }, 500)
                        
                except Exception as e:
                    log_message(f"Error processing POST: {e}")
                    self.send_json_response({
                        "success": False,
                        "message": f"Failed to process request: {str(e)}"
                    }, 500)
            else:
                self.send_json_response({
                    "success": False,
                    "message": "No data provided"
                }, 400)
        
        elif self.path.startswith('/restart/'):
            service_name = self.path[8:]  # Remove '/restart/'
            try:
                result = subprocess.run(
                    [CONFIG_SCRIPT, "restart-service", service_name],
                    capture_output=True,
                    text=True,
                    timeout=15
                )
                
                if result.returncode == 0:
                    log_message(f"Service {service_name} restart successful")
                    self.send_json_response({
                        "success": True,
                        "message": f"Service {service_name} restarted successfully"
                    })
                else:
                    log_message(f"Service {service_name} restart failed: {result.stderr}")
                    self.send_json_response({
                        "success": False,
                        "message": f"Failed to restart service {service_name}"
                    }, 500)
                    
            except Exception as e:
                log_message(f"Error restarting service: {e}")
                self.send_json_response({
                    "success": False,
                    "message": f"Failed to restart service: {str(e)}"
                }, 500)
        else:
            self.send_json_response({"error": "Not found"}, 404)

if __name__ == '__main__':
    log_message(f"Starting config server on port {PORT}")
    httpd = HTTPServer(('', PORT), ConfigHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        log_message("Server stopped by user")
    except Exception as e:
        log_message(f"Server error: {e}")
        sys.exit(1)
