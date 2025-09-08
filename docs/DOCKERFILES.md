# Dockerfiles Overview

This repository contains multiple Dockerfiles observed during development. To avoid confusion:

## Canonical
- Dockerfile
  - Use this for building the production image.
  - Nginx proxies the Go config-service at /api.
  - Container exposes 8080 for the Web UI and required UDP collectors.

## Deprecated / Legacy
- Dockerfile.web
  - Marked DEPRECATED. Retained for reference/testing only while we standardized on the canonical Dockerfile.
- Dockerfile.production (if present in your local branch)
  - Considered legacy. It may contain older bootstrap logic (e.g., python venv, redis, or supervisor flows) that diverge from the current architecture.
  - Prefer using the canonical Dockerfile. If a feature is only in this legacy file and needed, port it explicitly into the canonical build with clear documentation.

## Build examples

Build:
```
DOCKER_BUILDKIT=1 docker build -t rectitude369/noc-raven:1.0.0 .
```

Run:
```
docker run -d --name noc-raven \
  -p 9080:8080 \
  -p 8084:8084 \
  -p 2055:2055/udp -p 4739:4739/udp -p 6343:6343/udp \
  -p 162:162/udp \
  -v noc-raven-data:/data -v noc-raven-config:/config \
  rectitude369/noc-raven:1.0.0 --mode=web
```

## Notes
- API auth remains optional by default; configure NOC_RAVEN_API_KEY later if desired.
- CORS is permissive by default; consider restricting origins at Nginx for production deployments.

