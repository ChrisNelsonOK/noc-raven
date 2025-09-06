# NoC Raven – Release Notes v1.0.0

Date: 2025-09-06

Highlights
- Production Service Manager v2: startup order, health checks (proc/ports/HTTP), restart backoff, status summaries
- Config-service (Go): atomic JSON config writes, backups, impacted-service restarts; tests refactored for injectability
- Web UI: built React app (dist) served by nginx; API proxied to config-service on 5004
- Collectors: GoFlow2 (NetFlow/IPFIX/sFlow), Fluent Bit (syslog), Telegraf (SNMP traps + system metrics)
- Vector: minimal stable config with hourly files and reduced buffer sizes
- Log retention daemon: enforces disk usage budgets per class

Breaking changes
- Nginx now listens on container port 8080 (was 9080); map host port as desired (e.g., 9080->8080)
- Health checks updated; scripts avoid BusyBox-incompatible flags

Known considerations
- Runs as non-root; privileged operations (kernel sysctl) are skipped in container environments
- If host ports 514/162 are taken, map alternative host UDP ports

How to run (example)
- docker run -d --name noc-raven -p 9080:8080 -p 2055:2055/udp -p 4739:4739/udp -p 6343:6343/udp -p 162:162/udp -v noc-raven-data:/data -v noc-raven-config:/config rectitude369/noc-raven:1.0.0 --mode=web

Verification
- Web: curl -s http://localhost:9080/health
- Config: curl -s http://localhost:9080/api/config | jq .


