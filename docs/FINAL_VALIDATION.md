# NoC Raven – Final Validation (v1.0.0)

Date: 2025-09-06

Image: rectitude369/noc-raven:1.0.1-auth (built via Dockerfile)

Summary
- Core services start in deterministic order (config-service, nginx, fluent-bit, goflow2, telegraf, vector)
- Health checks pass for nginx (/health), config-service (/health), and vector (/health)
- UDP collectors bind inside the container; host UDP mapping verified on macOS via lsof
- Log retention daemon active (enforces budgets for logs/metrics/alerts/varlog)
- Web UI loads and proxies API endpoints correctly

Observed ports
- Inside: 8080/tcp (web), 8084/tcp (vector), 2055/udp, 4739/udp, 6343/udp, 162/udp
- Host (example mapping): 19080->8080, 12055->2055/udp, 16343->6343/udp

API
- GET /api/config returns current JSON configuration
- POST /api/config saves atomically with backups under /opt/noc-raven/backups and restarts impacted services
- POST /api/services/<name>/restart supports fluent-bit, goflow2, telegraf, nginx, vector

Validation commands (examples)
- curl -s http://localhost:19080/health
- curl -s http://localhost:19080/api/config | jq .
- lsof -nP -i UDP:12055 ; lsof -nP -i UDP:16343

Notes
- If standard host ports are in use, map alternative host ports when running the container
- Non-root runtime: kernel-level sysctl tunings are skipped (benign) in container environments

Status
- Core functionality: PASS
- Web mode: PASS
- Port binding (host mapped): PASS
- Optional API auth: PASS (disabled by default; requires NOC_RAVEN_API_KEY when enabled)
- Terminal mode (non-interactive test harness): N/A – interactive by design; menu verified manually


