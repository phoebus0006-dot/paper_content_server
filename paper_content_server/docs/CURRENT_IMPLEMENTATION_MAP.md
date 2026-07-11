# Current Implementation Map

Audited at commit: `70539996aa7119c86f2dad79f71b3709f71cf26d`

## R4 Asset Deletion & Safety
- reference-cleaner.js: isInside path check, lstatSync symlink rejection
- asset-delete-service.js: DeleteBlockedError short-circuit on replacement failure
- History invalidation: only publication_history + rollback_snapshot types

## R5 News Pipeline
- compose-services.js: Composition root creates NewsPipeline, PublicationService, etc.
- bootstrap.js: Creates all R1-R3 services, wires composition

## R6 MQTT
- mqtt-client-port.js: createMqttClientPort only creates real client (no fake fallback)
- server.js: MQTT_ENABLED conditional wiring with broker-down resilience

## R7 Learning Library (disabled by default)
- learning-validator.js: Rejects RESTRICTED rights, null candidates
- learning-deduplicator.js: Auto-commit on isDuplicate for transactional dedup
- learning-ingestion-service.js: Full gate pipeline with atomic repository write

## R8 Custom Upload
- custom-file-store.js: Real sharp metadata decode (width, height, sha256)
- custom-library-service.js: Safety gate required, decoded metadata, orphan cleanup

## R9 Render Shadow
- legacy-render-adapter.js: Clock injection for deterministic output
- render-shadow.js: Shadow dual-run, always returns legacy result

## R10 Admin HTTP
- admin-query-service.js: Read-only queries with real activeFrameId from snapshot
- feature-flag-view.js: configured/enabled/connected/ready structure
- server.js: /health/live, /health/ready endpoints

## R11 CI & Build
- .github/workflows/ci.yml: Full test matrix
- Dockerfile: Multi-stage, npm ci, non-root user
- scripts/dependency-selftest.js: Verifies all require() in package.json
- scripts/generate-build-manifest.js: Immutable build manifest
- scripts/container-selftest.js: Container health verification
