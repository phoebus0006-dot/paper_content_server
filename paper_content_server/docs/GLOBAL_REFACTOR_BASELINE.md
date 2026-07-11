AUDITED_CODE_SHA=8f98cc2cd7e14b42bb2eadd40f3b660c14dbad10

# Global Refactor Baseline

## R4-R10 Closure Status
- R4 path safety: isInside() replaces indexOf, lstatSync before realpathSync
- R4 replacement short-circuit: DeleteBlockedError terminates pipeline immediately
- R4 history filter: Only publication_history + rollback_snapshot trigger invalidation
- R5 composition root: Services created once at startup, never per-request
- R5 HTTP test: Real HTTP server with temp DATA_DIR
- R6 MQTT: Real broker test with Aedes, no fake clients in production
- R7 learning: All unit tests pass with LEARNING_LIBRARY_ENABLED=false
- R8 safety gate: Required — null gate returns DEPENDENCY_UNAVAILABLE
- R8 decoded metadata: sharp metadata overrides upload dimensions
- R8 orphan cleanup: Repository failure removes final orphan file
- R9 clock injection: Deterministic render via clock.now()
- R9 golden parity: Real production render path verified
- R10 admin routes: Read-only HTTP with Bearer auth
- R10 feature flags: configured/enabled/connected/ready per service

## Default-Disabled Features
DELETE_PIPELINE_ENABLED=false MQTT_ENABLED=false LEARNING_LIBRARY_ENABLED=false
CUSTOM_LIBRARY_ENABLED=false R9_ADVANCED_RENDER_ENABLED=false R9_RENDER_SHADOW_ENABLED=false
