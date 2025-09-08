# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0-beta] - 2025-09-08
### Added
- Playwright smoke tests and GitHub Actions E2E workflow (container boots, UI loads, basic API responds)
- React Router in the web UI; dev server proxy for /api; reliable data-testid hook for tests
- docs/DOCKERFILES.md to clarify canonical vs. deprecated Dockerfiles

### Changed
- Canonical API path: use Go config-service behind Nginx at /api (removed Node backend under web/backend)
- Standardized the Settings UI to the components/ implementation and removed legacy duplicates
- Deprecated Dockerfile.web to prevent confusion with the canonical Dockerfile
- Moved prototype/simple API scripts into scripts/legacy/

### Fixed
- Removed no-op code in config-service/main.go backup path handling

### Notes
- API key auth remains optional (disabled by default), per owner preference
- CORS remains permissive by default; consider a whitelist for production later

