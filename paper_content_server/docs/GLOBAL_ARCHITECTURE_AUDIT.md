# Global Architecture Audit

**Date**: 2026-07-11
AUDITED_CODE_SHA=8b1e298ca9bed5d7ecdfbb39f25287143e0c4103
**Branch**: master

## Domain Risk Matrix

| Domain | Current State | Risk | Keep | Refactor | Redesign |
|--------|--------------|------|------|----------|----------|
| Application Shell | Single 3196-line server.js; bootstrap({listen:false}) + createApp(handler) extracted in R1 | HIGH | — | Partial extraction | — |
| Config | 24 process.env reads centralized via loadConfig({cwd,env}) in R1 | MEDIUM | — | Centralized | — |
| Clock | SystemClock / FixedClock injectable abstraction in R1; server startup uses SystemClock | MEDIUM | — | Injectable Clock | — |
| Persistence | writeJson → writeFileAtomic (pid+random .tmp); readJson → JsonStore (NOT_FOUND/CORRUPT/IO). R1 completed. | MEDIUM | — | JsonStore | — |
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



## B. Runtime State Ownership Table

| State | Defined At | Writers | Readers | Persisted | Truth Source | Risk |
|-------|-----------|---------|---------|-----------|-------------|------|
| cachedFrames | runtime.cachedFrames | getContentForNow, buildNewsSnapshot, admin-publish | state.json, frame.bin handlers | No (in-memory Map) | runtime.cachedFrames | Lost on restart |
| newsCache | runtime.newsCache | translateArticle → writeJson news_cache.json | translateArticle cache lookup | news_cache.json | news_cache.json | Concurrent write via fixed .tmp |
| lastGoodNews | runtime.lastGoodNews | buildNewsSnapshot → writeJson last_good_news.json | buildNewsSnapshot fallback | last_good_news.json | last_good_news.json | Fixed .tmp collision |
| newsRotation | runtime.newsRotation | recordShownItems → writeJson | isRecentlyShown | news_rotation_state.json | news_rotation_state.json | Fixed .tmp collision |
| imageIndex | runtime.imageIndex + runtime.fullImageIndex | buildPhotoSnapshot → writeJson, loadImageIndex → readJson | selectPhotoSnapshot, selectStudyPhoto, isStudySelectable | image_index.json | image_index.json | Dual representation (index vs fullIndex) |
| libraryState | runtime.libraryState | buildPhotoSnapshot → writeJson | updateLibraryStateForPhoto | library_state.json | library_state.json | Fixed .tmp collision |
| pinStore | runtime.pinnedSnapshots | setPinnedSnapshot | getPinnedSnapshot | No (in-memory Map, 30s TTL) | runtime.pinnedSnapshots | Lost on restart; TTL not persisted |
| adminOverride | (none in-memory) | Admin routes writeFileSync | computeSnapshot reads file | admin_override.json | admin_override.json | No atomicity; no schema |
| publicationHistory | (none in-memory) | Admin routes writeFileSync | readPubHistory, rollback | publish_history.json | publish_history.json | No atomicity; inline Date.now() IDs |
| debugClock | runtime.nowProvider/pinNowProvider | /debug/clock | All time-dependent functions | No (in-memory) | runtime | Global mutable test hook |

## Critical Risks

1. PUBLICATION_CHAIN: Admin routes bypass publication service. writeFileSync writes override.json + history.json directly. FrameId=Date.now().toString(36). No atomic activation. Rollback rewrites override.json, does NOT restore snapshot.
2. MULTIPLE_TRUTH_SOURCES: runtime.cachedFrames, runtime.cachedSnapshots, data/*.json, admin_override.json - all inconsistent. No single source of truth.
3. STATE_CORRUPTION_ON_RESTART: No snapshot persistence. Frame cache lost on restart. Pin store in-memory only.
4. WRITE_ATOMICITY: R1 migrated to writeFileAtomic (pid+random .tmp, no collision). readJson → JsonStore with explicit NOT_FOUND/CORRUPT/IO errors. Fixed .tmp risk RESOLVED. No fsync remains.
5. SAFETY_DELETION: Single regex. No deletion pipeline. Unsafe content in cache/snapshot/rollback would persist.
6. TRANSLATION_FIDELITY: "Verified" translations pass only format check (Chinese chars + punctuation).
7. TEST_OVERCLAIM: translation-quality-test = helper path, not full pipeline.

## Document Drift

| Document | Claim | Code Reality |
|----------|-------|-------------|
| API_CONTRACT.md | /api/admin/publish/one-shot | Route does NOT exist (confirmed at AUDITED_CODE_SHA)
| API_CONTRACT.md | /api/admin/focus-lock | Route does NOT exist (confirmed at AUDITED_CODE_SHA)
| API_CONTRACT.md | /api/admin/library | Route does NOT exist (confirmed at AUDITED_CODE_SHA)
| DOMAIN_MODEL.md | libraryType field on LibraryAsset | No libraryType in image_index.json |
| DOMAIN_MODEL.md | relevanceStatus, technicalQualityStatus | Fields do not exist |


## D. Persistence Table

| File | Readers | Writers | Atomic | Recovery | Risk |
|------|---------|---------|--------|----------|------|
| admin_override.json | computeSnapshot | admin publish routes | No (writeFileSync) | None | Crash mid-write corrupts override |
| publish_history.json | readPubHistory, rollback | admin publish routes | No (writeFileSync) | None | Crash mid-write loses history |
| last_good_news.json | buildNewsSnapshot fallback | buildNewsSnapshot (conditionally) | YES (writeFileAtomic pid+random .tmp) | Atomic rename | RESOLVED in R1 |
| news_cache.json | translateArticle cache | translateArticle | YES (writeFileAtomic pid+random .tmp) | Atomic rename | RESOLVED in R1 |
| library_state.json | updateLibraryStateForPhoto | buildPhotoSnapshot | YES (writeFileAtomic pid+random .tmp) | Atomic rename | RESOLVED in R1 |
| image_index.json | selectPhotoSnapshot, selectStudyPhoto | buildPhotoSnapshot | YES (writeFileAtomic pid+random .tmp) | Atomic rename | Dual representation risk |


## Test Overclaims

| Test | Problem |
|------|---------|
| translation-quality-test | Helper function path, not full translation pipeline |
| photo-safety-test | Uses old study_frames model; NOT dual-library |


## E. Test Trust Matrix

| Test | Type | Production Path | Trust Level | Known Gap |
|------|------|----------------|-------------|-----------|
| schedule-test | UNIT | lib/schedule.js direct | HIGH | None |
| frame-selftest | UNIT | imageToFrameBuffer direct | HIGH | None |
| coherence-test | INTEGRATION | HTTP server | HIGH | None |
| restart-test | INTEGRATION | HTTP server | HIGH | None |
| admin-test | INTEGRATION | HTTP server | HIGH | None |
| rotation-test | INTEGRATION | HTTP server | HIGH | Port conflict sensitivity |
| translation-quality-test | HELPER | Exported functions | MEDIUM | Not full pipeline; no mock provider |
| news-render-readability | INTEGRATION | HTTP + layoutNewsCard | HIGH | None |
| photo-safety-test | UNIT | Functions | MEDIUM | Old model only; not dual-library |
| storyboard-source-test | UNIT | lib modules | HIGH | None |
| A-schedule-contract | CONTRACT | lib/schedule.js | HIGH | None |
| B-epf1-contract | CONTRACT | HTTP frame | HIGH | None |
| C-state-frame-contract | CONTRACT | HTTP server | HIGH | None |
| D-schedule-night-contract | CONTRACT | HTTP + clock injection | HIGH | RESOLVED in R0.1 |
| E-news-contract | CONTRACT | Exported functions | MEDIUM | Helper path, not full pipeline |
| F-news-render-contract | CONTRACT | layoutNewsCard | HIGH | None |
| G-photo-contract | CONTRACT | selectStudyPhoto | MEDIUM | Old model only |
| H-safety-contract | CONTRACT | isStudySelectable | MEDIUM | Deletion NOT_IMPLEMENTED |
| I-news-lastgood-contract | CONTRACT | HTTP + feed server | HIGH | Port conflict sensitivity |
| J-admin-contract | CONTRACT | HTTP server | HIGH | None |
| K-operating-modes-contract | CONTRACT | lib + code scan | MEDIUM | Behavior for not-implemented via code scan |
