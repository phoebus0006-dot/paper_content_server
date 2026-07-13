AUDITED_CODE_SHA=PENDING_INTEGRATION

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

## Safety Boundaries
- Asset delete: blocked → reference scan → replacement → history invalidate → cache clear → unlink → tombstone
- Custom upload: safety gate failure = DEPENDENCY_UNAVAILABLE, quarantine cleaned
- Path allowed: isInside() check on data/ + images/ directories only
- Symlink: rejected before realpathSync via lstatSync

## Security
- Admin: Bearer token auth, no secrets in responses
- Docker: non-root user (appuser:1001), .env excluded from image
- Build manifest: dirty worktree = no release artifact
