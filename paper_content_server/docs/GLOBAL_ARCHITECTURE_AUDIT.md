AUDITED_CODE_SHA=PENDING_INTEGRATION
REAL_CJK_MODULE=IMPLEMENTED
REAL_CJK_GLYPH_RENDER=IMPLEMENTED_NOT_PRODUCTION_VERIFIED
ORCHESTRATOR_SHADOW=IMPLEMENTED
ORCHESTRATOR_PRODUCTION_SWITCH=NOT_IMPLEMENTED
REAL_CLASSIFIER=BLOCKED
NAS_DYNAMIC_ACCEPTANCE=NOT_TESTED
ESP32_DYNAMIC_ACCEPTANCE=NOT_TESTED

# Global Architecture Audit

## Composition Root
- `src/app/bootstrap.js` creates R3 services (SnapshotStore, PinStore, etc.)
- `src/app/compose-services.js` wires NewsPipeline, PublicationService, AdminQueryService
- Server created once in bootstrap, not rebuilt per request

## Data Flow
- News: provider/fetch → newsPipeline.run() → PublicationService.publish() → Snapshot → Frame
- MQTT: (disabled) connect → MqttNotificationAdapter → notify on publish
- Custom Upload: (disabled) validate → quarantine → decode → safety → dedup → repository
- Admin Query: snapshotStore → publicationHistory → assetRepository → HTTP JSON response
- Render: production path = legacy-render-adapter; render-shadow / orchestrator-shadow-adapter runs as independent shadow pipeline (renderShadowEnabled) — orchestrator is NOT the default production path (ORCHESTRATOR_PRODUCTION_SWITCH=NOT_IMPLEMENTED)

## Safety Boundaries
- Asset delete (production path via `src/assets/asset-delete-service.js`): HTTP route → feature flag check (deletePipelineEnabled; 503 FEATURE_DISABLED when off, no legacy fallback) → AssetDeleteService.deleteAsset → findReferences → markBlocked → tombstone write → cleanup (referenceCleaner.cleanCache) → audit (auditLog.append) → markTombstoned. Reason enum UNSAFE / SUSPICIOUS / POLICY_BLOCKED; fail-closed: every step rejects on failure (no swallow).
- Custom upload: safety gate failure = DEPENDENCY_UNAVAILABLE, quarantine cleaned
- Path allowed: isInside() check on data/ + images/ directories only
- Symlink: rejected before realpathSync via lstatSync

## Security
- Admin: Bearer token auth, no secrets in responses
- Docker: non-root user (appuser:1001), .env excluded from image
- Build manifest: dirty worktree = no release artifact
