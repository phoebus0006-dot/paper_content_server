# Global Architecture Audit

**Date**: 2026-07-10
**Audited SHA**: a6cb25b27f7aeaf232c2c6bce21729fc5d5a7db3
**Branch**: master

## Domain Risk Matrix

| Domain | Current State | Risk | Keep | Refactor | Redesign |
|--------|--------------|------|------|----------|----------|
| Application Shell | Single 3197-line server.js with module-level mutable state | CRITICAL | — | Full extraction | — |
| Config | 24 process.env reads scattered across server.js | HIGH | — | Centralize | — |
| Clock | runtime.nowProvider global injection | HIGH | — | Injectable Clock | — |
| Persistence | 6 direct fs writes, no atomicity guarantee | CRITICAL | — | JsonStore | — |
| Runtime State | 33 fields in single runtime object, no domain isolation | CRITICAL | — | Domain stores | — |
| Schedule | Dedicated lib/schedule.js module | LOW | Keep | — | — |
| Frame (EPF1) | buildFrameBuffer + imageToFrameBuffer in server.js | MEDIUM | — | Extract to epaper/ | — |
| Snapshot | computeSnapshot() in server.js, no persistence | HIGH | — | Extract + persist | — |
| Publication | Admin routes writeFileSync directly; no service layer | CRITICAL | — | Unified PublicationService | — |
| Operating Modes | AUTO resolved; ONE_SHOT partial; FOCUS_LOCK missing | HIGH | — | OperatingModeService | — |
| Admin | Routes write state directly, inline frameId generation | CRITICAL | — | Route -> Service -> Repository | — |
| News Pipeline | 500+ LOC inline in server.js, staged but tightly coupled | HIGH | — | Domain extraction | — |
| Translation Fidelity | isTextSemanticallyComplete - format only | HIGH | — | Real verifier | Redesign |
| Library / Asset | Old study_frames/decorative model; no libraryType | HIGH | — | Dual model | Redesign |
| Safety | Blocklist regex only; no delete pipeline; no tombstone | CRITICAL | — | SafetyService | Redesign |
| MQTT | NOT_IMPLEMENTED | LOW | — | New module | New |
| ESP32 | Stable firmware with 60s polling | LOW | Keep | Minor | — |
| Testing | Ad-hoc scripts; contract runner exists; call production | MEDIUM | — | Unified runner | — |
| Docs | 37 files; some drift | MEDIUM | — | Align to SHA | — |
| Docker/NAS | Bind-mount deployment; no immutable deploy | MEDIUM | — | Immutable CI | — |

## Critical Risks

1. PUBLICATION_CHAIN: Admin routes bypass publication service. writeFileSync writes override.json + history.json directly. FrameId=Date.now().toString(36). No atomic activation. Rollback rewrites override.json, does NOT restore snapshot.
2. MULTIPLE_TRUTH_SOURCES: runtime.cachedFrames, runtime.cachedSnapshots, data/*.json, admin_override.json - all inconsistent. No single source of truth.
3. STATE_CORRUPTION_ON_RESTART: No snapshot persistence. Frame cache lost on restart. Pin store in-memory only.
4. WRITE_ATOMICITY: writeJson uses fixed .tmp path. Concurrent writes corrupt. No fsync. readJson silently returns fallback on corrupt JSON.
5. SAFETY_DELETION: Single regex. No deletion pipeline. Unsafe content in cache/snapshot/rollback would persist.
6. TRANSLATION_FIDELITY: "Verified" translations pass only format check (Chinese chars + punctuation).
7. TEST_OVERCLAIM: translation-quality-test = helper path, not full pipeline.

## Document Drift

| Document | Claim | Code Reality |
|----------|-------|-------------|
| API_CONTRACT.md | /api/admin/publish/one-shot defined | Route does NOT exist |
| API_CONTRACT.md | /api/admin/focus-lock defined | Route does NOT exist |
| API_CONTRACT.md | /api/admin/library defined | Route does NOT exist |
| DOMAIN_MODEL.md | libraryType field on LibraryAsset | No libraryType in image_index.json |
| DOMAIN_MODEL.md | relevanceStatus, technicalQualityStatus | Fields do not exist |

## Test Overclaims

| Test | Problem |
|------|---------|
| translation-quality-test | Helper function path, not full translation pipeline |
| photo-safety-test | Uses old study_frames model; NOT dual-library |
