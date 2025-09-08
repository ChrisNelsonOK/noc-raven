# NoC Raven – Security Guide

This document summarizes current security controls and how to enable optional protections.

Scope
- Web UI served by nginx on container port 8080 (map host port as needed)
- Config-Service (Go) on 5004, proxied by nginx at /api
- Telemetry collectors: Fluent Bit, GoFlow2, Telegraf, Vector

Optional API Authentication (Config API)
- Disabled by default for local/dev convenience.
- Enable by providing an environment variable when running the container:
  - NOC_RAVEN_API_KEY=<your-strong-key>
- Clients must include one of the following on requests to /api/*:
  - X-API-Key: <your-strong-key>
  - Authorization: Bearer <your-strong-key>
- CORS preflight (OPTIONS) is always allowed to simplify browser usage.
- Nginx is configured to forward the Authorization header to the backend.

Rate Limiting
- Nginx rate limiting is enabled for web and API locations.
  - zone=web: 50r/s (burst 20)
  - zone=api: 10r/s (burst 10)
- Consider additional app-level rate limits if needed.

TLS (HTTPS)
- The container includes an example HTTPS server block in config/nginx.conf (commented).
- To enable HTTPS inside the container:
  1) Add cert/key to /opt/noc-raven/ssl
  2) Uncomment the HTTPS server in config/nginx.conf and rebuild
  3) Map host port 9443->443 (or your choice)
- Alternatively, terminate TLS at an external reverse proxy.

Authentication/Authorization Roadmap
- Add signed JWT support and short-lived API tokens
- Add per-endpoint scopes with allow/deny lists
- Support mTLS between reverse proxy and backend if needed

Security Posture Notes
- Container runs as a non-root user (nocraven)
- Sensitive files under /opt/noc-raven/web are protected by nginx location rules
- Disk protection measures are enabled for Vector logs to avoid exhaustion
- Health endpoints are minimal and do not leak internal detail

Incident Response
- Review /var/log/noc-raven for service logs and the production-service-manager log
- Use POST /api/services/<name>/restart to restart a specific service
- Temporarily disable collectors by toggling .collection flags in the config JSON and POSTing it to /api/config

