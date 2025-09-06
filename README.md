# NoC Raven – Telemetry Collection & Forwarding Appliance

NoC Raven is a high‑performance, turn‑key telemetry collection and forwarding appliance designed for venue environments.

Core services
- Web control panel (nginx) on container port 8080
- Config API (Go) on 5004, proxied by nginx at /api/
- Fluent Bit (syslog collection, dynamic port)
- GoFlow2 (NetFlow v5, IPFIX, sFlow collectors)
- Telegraf (SNMP traps, system metrics, dynamic port)
- Vector (log/metric pipeline + local file sinks)
- Log retention daemon enforcing size budgets

Quick start
1) Build the image
   DOCKER_BUILDKIT=1 docker build -t rectitude369/noc-raven:1.0.0 --build-arg BUILD_DATE=$(date -Iseconds) .

2) Run the appliance (web mode)
   # If standard ports are free on your host
   docker run -d --name noc-raven \
     -p 9080:8080 \
     -p 2055:2055/udp -p 4739:4739/udp -p 6343:6343/udp \
     -p 162:162/udp \
     -v noc-raven-data:/data -v noc-raven-config:/config \
     rectitude369/noc-raven:1.0.0 --mode=web

   # If you have port conflicts, map alternative host ports (example)
   docker run -d --name noc-raven \
     -p 19080:8080 \
     -p 12055:2055/udp -p 14739:4739/udp -p 16343:6343/udp \
     -p 10162:162/udp \
     -v noc-raven-data:/data -v noc-raven-config:/config \
     rectitude369/noc-raven:1.0.0 --mode=web

3) Open the web UI
   http://localhost:9080   (or the host port you mapped)

Default ports (inside the container)
- Web UI: 8080/tcp (expose on host of your choice)
- Vector API: 8084/tcp (internal)
- Collectors (UDP): NetFlow v5 2055, IPFIX 4739, sFlow 6343, SNMP traps 162

Dynamic configuration
- JSON config path: /opt/noc-raven/web/api/config.json
- GET/POST /api/config (proxied by nginx to local config-service on 5004)
- POST /api/services/<name>/restart to restart: fluent-bit | goflow2 | telegraf | nginx | vector

Examples
- Change syslog port to 5514
  curl -s http://localhost:9080/api/config | jq '.collection.syslog.port=5514' | \
  curl -sX POST http://localhost:9080/api/config -H 'Content-Type: application/json' --data-binary @-

- Restart Fluent Bit after config changes
  curl -sX POST http://localhost:9080/api/services/fluent-bit/restart

What’s persisted
- /data: telemetry buffers and logs (bind to docker volume)
- /config: user config (bind to docker volume)

Notes
- The container runs as non-root (user: nocraven). Certain kernel tunings and privileged ports may not be available in all environments.
- If host ports 514 or 162 are occupied, map alternative host ports as shown above.

Health
- Web health: http://localhost:9080/health (OK JSON)
- Config-service health: http://localhost:9080/api/config (GET)
- Vector health: internal http://localhost:8084/health

Production image tag
- rectitude369/noc-raven:1.0.0

Release notes and validation
- See docs/FINAL_VALIDATION.md and docs/RELEASE_NOTES_v1.0.0.md for details.

Optional API authentication
- You can protect the Config API with a static API key. By default, auth is disabled.
- For this beta (v.90-beta), API auth is intentionally disabled (no key is set in the container).
- To enable later, set an env var when running the container: NOC_RAVEN_API_KEY=<your-key>
- Clients must send either:
  - Header: X-API-Key: <your-key>
  - OR Header: Authorization: Bearer <your-key>
- CORS preflight (OPTIONS) is always allowed. Example:
  curl -s -H "X-API-Key: $KEY" http://localhost:9080/api/config | jq .

