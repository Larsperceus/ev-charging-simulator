# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.6] - 2024-01-XX

### Added
- Complete GitHub Actions CI/CD pipeline
  - Automated testing on Node 18/20/22
  - Automated npm publishing on GitHub releases
  - Weekly security scanning with Trivy
  - Pre-release quality validation
- Professional documentation suite
  - CONTRIBUTING.md for development workflow
  - DEPLOYMENT.md for CI/CD setup
  - SECURITY.md for security practices
  - Enhanced inline JSDoc comments

### Changed
- Improved error messages in test outputs
- Enhanced logging for connection debugging
- Updated package.json with organization URLs

### Fixed
- Critical bug: Race condition in `sendCall()` when `rawSend()` throws synchronously
- Critical bug: Unhandled promise rejection in message event handler
- Medium bug: Missing error handling in `sendCallResult()` and `sendCallError()`

## [1.0.5] - 2024-01-XX

### Changed
- Removed all hardcoded company-specific data
- Updated default CSMS URL from `ws://proxy.optimile-dev.eu:80/services/ocppj` to `ws://localhost:9000/ocpp1.6`
- Updated default charger vendor from `Alfen` to `GenericVendor`
- Updated default charger model from `NG910-60023` to `GenericModel`
- Cleaned README to remove company references

### Security
- Verified no hardcoded credentials in codebase
- Added security scanning to CI/CD pipeline

## [1.0.4] - 2024-01-XX

### Added
- Comprehensive professional README with 500+ lines
  - Detailed feature list with emojis
  - Installation instructions
  - Quick start guides (minimal and full)
  - Core concepts documentation
  - Complete API reference
  - 5 usage examples (single charger, fleet, charging flow, error handling, retry patterns)
  - Configuration guide
  - Troubleshooting section

### Changed
- Enhanced package.json metadata
  - Added comprehensive description
  - Added 13 relevant keywords
  - Added author and repository URLs
  - Added bugs URL
  - Specified Node 18+ requirement

### Removed
- Unused dependencies (validated all are actively used)

## [1.0.3] - 2024-01-XX

### Added
- Enum-based state management system
  - `ConnectorState` enum with standardized states
  - `ChargePointErrorCode` enum with OCPP error codes
  - Type-safe state transitions

### Changed
- **BREAKING**: `connect()` is now async
  - Waits for boot notification before resolving
  - Returns `Promise<void>` instead of returning `this`
  - Prevents race conditions with state initialization

- **BREAKING**: `disconnect()` is now async
  - Properly cleans up WebSocket connection
  - Returns `Promise<void>`

### Fixed
- Async/await patterns to prevent race conditions
- Connection lifecycle management
- State synchronization during reconnection

## [1.0.2] - 2024-01-XX

### Added
- Core OCPP 1.6 protocol implementation
  - WebSocket connection management
  - Boot Notification flow
  - Heartbeat mechanism
  - Status Notification updates
  - Remote Start/Stop Transaction
  - Auto-reconnection with exponential backoff

### Changed
- Refined error handling in message processing
- Improved connection state management

## [1.0.1] - 2024-01-XX

### Fixed
- TypeScript compilation errors
- Test file enum imports
- Mock function signatures

## [1.0.0] - 2024-01-XX

### Added
- Initial release of `ev-charging-simulator`
- Core `Charger` class with public API
- Configuration loading from JSON files
- Test suite with 97 tests (100% passing)
- Full TypeScript support with strict mode
- Support for multiple connectors per charger
- Configurable boot parameters (vendor, model, firmware)
- Fleet initialization with `createChargers()` and `loadChargersFromConfig()`
- Comprehensive type definitions exported

## Unreleased

### Planned
- Support for OCPP 2.0.1
- Multiple CSMS endpoints in fleet mode
- Performance optimization for large charger fleets (1000+)
- Metrics export (Prometheus format)
- Dashboard for simulated charger status
- REST API gateway for OCPP operations

---

## Release Guidelines

### Version Bumping

- **MAJOR** (x.0.0): Breaking API changes
- **MINOR** (0.x.0): New features, backward compatible
- **PATCH** (0.0.x): Bug fixes, no API changes

### Pre-Release Versions

- Alpha: `v1.0.0-alpha.1` (internal testing)
- Beta: `v1.0.0-beta.1` (external testing)
- Release Candidate: `v1.0.0-rc.1` (final validation)

### Commit Message Format

```
feat: add async lifecycle methods
fix: handle connection race condition
docs: improve README examples
refactor: simplify message handling
test: add coverage for error scenarios
chore: update dependencies
```

### Release Process

1. Update version in `package.json`
2. Update this CHANGELOG.md with changes
3. Create commit: `git commit -m "chore: release v1.0.6"`
4. Tag release: `git tag v1.0.6`
5. Create GitHub Release with tag and changelog excerpt
6. GitHub Actions automatically publishes to npm

---

## How to Read This Changelog

- **Added** - new features
- **Changed** - changes in existing functionality
- **Deprecated** - soon-to-be removed features
- **Removed** - removed features
- **Fixed** - bug fixes
- **Security** - security fixes and improvements

---

**For more details, see:**
- [Contributing Guide](CONTRIBUTING.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Security Policy](SECURITY.md)
