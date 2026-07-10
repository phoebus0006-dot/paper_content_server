# Global Refactor Roadmap

## R0: Truth Baseline Repair (CURRENT)
**GOAL**: Establish credible architecture baseline.
**IN_SCOPE**: Fix contract runner, status model, docs:check, readability test, admin-test. Create audit docs.
**OUT_OF_SCOPE**: server.js extraction, PublicationService, Safety delete, MQTT, Libraries, FOCUS_LOCK.

## R1: App Shell + Infrastructure
**GOAL**: Extract config, clock, persistence, HTTP client from server.js into src/infra/.

## R2: Frame Core
**GOAL**: Extract palette, quantizer, EPF1 encoder, frame validator into src/epaper/.

## R3: Snapshot + Publication Core + Admin Migration
**GOAL**: Unified PublicationService. Admin routes delegate, not write state.

## R4: Asset Model + Safety Core
**GOAL**: Dual-library asset model. Safety delete pipeline + tombstone.

## R5: News Pipeline Extraction
**GOAL**: Domain modules for fetch/parse/translate/verify/select.

## R6: MQTT Notification
**GOAL**: Server-side MQTT publisher. Notification-only, HTTP source of truth.

## R7: Learning Library
**GOAL**: Source adapters, relevance gate, rights gate, rotation.

## R8: Custom Library
**GOAL**: Upload API, safety gate, album/tag, explicit selector.

## R9: Advanced Render Modes
**GOAL**: Analysis card, comparison pair, sequence 2x2.

## R10: Admin Management Completion
**GOAL**: Library management, FOCUS_LOCK, ONE_SHOT expiry.

## R11: CI + Immutable Deployment + NAS
**GOAL**: GitHub Actions, immutable deploy, healthcheck.

## R12: ESP32 MQTT + Device Acceptance
**GOAL**: Firmware MQTT client, coalesce, reconnect, resubscribe.
