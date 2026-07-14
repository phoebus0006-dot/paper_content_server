AUDITED_CODE_SHA=PENDING_INTEGRATION
REAL_CJK_MODULE=IMPLEMENTED
REAL_CJK_GLYPH_RENDER=IMPLEMENTED_NOT_PRODUCTION_VERIFIED
ORCHESTRATOR_SHADOW=IMPLEMENTED
ORCHESTRATOR_PRODUCTION_SWITCH=NOT_IMPLEMENTED
REAL_CLASSIFIER=BLOCKED
NAS_DYNAMIC_ACCEPTANCE=NOT_TESTED
ESP32_DYNAMIC_ACCEPTANCE=NOT_TESTED

## 1. Route Map

| Method | Path | Purpose | Controller |
|--------|------|---------|------------|
| GET | / | Status page | server.js |
| GET | /api/state.json | Current snapshot state | server.js |
| GET | /api/frame.bin | Binary frame data (EPF1) | server.js |
| GET | /api/news.json | Current news items | server.js |
| GET | /api/library.json | Photo library index | server.js |
| GET | /api/health.json | Health check | server.js |
| GET | /api/review.json | Review snapshot | server.js |
| GET | /health/live | Liveness probe | server.js |
| GET | /health/ready | Readiness probe | server.js |
| GET | /api/admin/access-mode | Admin access mode echo | server.js |
| GET | /api/admin/dashboard | Admin dashboard (mode/frame/uptime) | server.js |
| GET | /api/admin/news | Current news selection preview | server.js |
| POST | /api/admin/news/draft | Save admin news draft (6 items) | server.js |
| POST | /api/admin/publish/news | Manual news publication | server.js |
| POST | /api/admin/publish/photo | Manual photo publication | server.js |
| POST | /api/admin/rollback | Rollback to snapshot by id | server.js |
| GET | /api/admin/publish-history | Publication history list | server.js |
| GET | /api/admin/photos | Photo library index (admin view) | server.js |
| DELETE | /api/admin/override | Clear admin override & re-publish | server.js |
| GET | /api/admin/system/status | System status (mode/frame/uptime/features) | server.js → admin-query-service |
| GET | /api/admin/publications | Publication history list | server.js → admin-query-service |
| GET | /api/admin/publications/:id | Get publication by snapshotId | server.js → admin-query-service |
| GET | /api/admin/assets | List assets (optional ?libraryType= filter) | server.js → admin-query-service |
| GET | /api/admin/assets/:id | Get asset by assetId | server.js → admin-query-service |
| GET | /api/admin/features | Feature flags (dynamic: mqtt/news/render state) | server.js → admin-query-service |
| POST | /api/admin/publish/one-shot | One-shot publish (expires at next HH:00/HH:30 boundary) | server.js → publication-service + operating-mode-service |
| PUT | /api/admin/focus-lock | Enter FOCUS_LOCK (libraryType/theme/albumId) | server.js → operating-mode-service |
| DELETE | /api/admin/focus-lock | Exit FOCUS_LOCK (restore AUTO schedule) | server.js → operating-mode-service |
| GET | /api/admin/library | List library assets | server.js → asset-repository |
| POST | /api/admin/library/custom/upload | Upload custom asset (safety gate + dedup + persist) | server.js → customLibraryService |
| POST | /api/admin/learning/ingest | Trigger learning library ingestion | server.js → learningIngestionService |
| GET | /api/admin/learning/status | Learning ingestion status | server.js |
| PATCH | /api/admin/library/:id | Update asset metadata (guarded fields) | server.js → asset-repository |
| DELETE | /api/admin/library/:id | Delete asset (atomic chain: HTTP route → feature flag check → AssetDeleteService.deleteAsset → findReferences → markBlocked → tombstone write → cleanup → audit → markTombstoned; reason enum UNSAFE/SUSPICIOUS/POLICY_BLOCKED) | server.js → assetDeleteService (gated by deletePipelineEnabled; no legacy fallback) |

> **NOTE — admin-query-service 已挂载 HTTP**:R10 测试中 `/admin/api/system/status` 路径仍保留为 mock 直查路径;正式生产路由为 `/api/admin/system/status` 等(见 [API_CONTRACT.md](API_CONTRACT.md) §3-§5)。

## 2. Runtime State Map

| Key | Type | Persisted | Description |
|-----|------|-----------|-------------|
| News translation cache | object | yes (news_cache.json) | Translations by cache key |
| News rotation state | object | yes (news_rotation_state.json) | Recently shown articles |
| Library state | object | yes (library_state.json) | Image library cursor |
| Image index | array | yes (image_index.json) | Photo library metadata |
| Last good news | object | yes (last_good_news.json) | Fallback news |
| Active snapshot | pointer | yes (active-snapshot.json) | Current publication |
| Cached snapshots | Map | no | In-memory snapshot cache |
| Publication history | array | yes (history.json) | Publication log |

## 3. News Pipeline Map

| Step | Module | File | Description |
|------|--------|------|-------------|
| fetch | server.js | server.js | HTTP fetch from RSS/JSON feeds |
| parse | server.js | server.js | RSS/JSON feed parsing |
| translate | server.js | server.js | OpenAI/DeepL/Gemini translation (declared in config, NOT wired — translation-gate.js is a stub) |
| normalize | news-normalizer | src/news/news-normalizer.js | Normalize feed items |
| identity | article-identity | src/news/article-identity.js | Article identity extraction |
| deduplicate | news-deduplicator | src/news/news-deduplicator.js | URL + content dedup |
| translate | translation-gate | src/news/translation-gate.js | Translation provider dispatch (STUB: translate() returns null — no real HTTP call) |
| edit | news-editor | src/news/news-editor.js | Title/summary rewrite |
| layout | news-layout | src/news/news-layout.js | Card layout computation |
| last-good | last-good-store | src/news/last-good-store.js | Fallback persistence |
| pipeline | news-pipeline | src/news/news-pipeline.js | Orchestrator |

## 4. Image Library Map

| Component | Module | File |
|-----------|--------|------|
| Asset model | asset-model | src/assets/asset-model.js |
| Asset repository | asset-repository | src/assets/asset-repository.js |
| Asset reference index | asset-reference-index | src/assets/asset-reference-index.js |
| Asset status | asset-status | src/assets/asset-status.js |
| Legacy adapter | legacy-asset-adapter | src/assets/legacy-asset-adapter.js |
| Delete service | asset-delete-service | src/safety/asset-delete-service.js |
| Reference cleaner | reference-cleaner | src/safety/reference-cleaner.js |
| Safety decision | safety-decision | src/safety/safety-decision.js |
| Tombstone store | tombstone-store | src/safety/tombstone-store.js |
| Safety audit log | safety-audit-log | src/safety/safety-audit-log.js |

## 5. Learning Library Map

| Component | Module | File |
|-----------|--------|------|
| Candidate model | learning-candidate-model | src/learning/learning-candidate-model.js |
| Validator | learning-validator | src/learning/learning-validator.js |
| Deduplicator | learning-deduplicator | src/learning/learning-deduplicator.js |
| Policy | learning-policy | src/learning/learning-policy.js |
| Source registry | learning-source-registry | src/learning/learning-source-registry.js |
| Source port | learning-source-port | src/learning/learning-source-port.js |
| Ingestion service | learning-ingestion-service | src/learning/learning-ingestion-service.js |
| source adapters | learning-adapters | src/learning/ |

## 6. Custom Library Map

| Component | Module | File |
|-----------|--------|------|
| Upload model | custom-upload-model | src/custom-library/custom-upload-model.js |
| Validator | custom-validator | src/custom-library/custom-validator.js |
| File store | custom-file-store | src/custom-library/custom-file-store.js |
| Deduplicator | custom-deduplicator | src/custom-library/custom-deduplicator.js |
| Library service | custom-library-service | src/custom-library/custom-library-service.js |
| Selector | custom-selector | src/custom-library/custom-selector.js |
| upload endpoint | (admin route) | server.js |

## 7. Test Map

| Test file | Suite | Description |
|-----------|-------|-------------|
| schedule-test.js | schedule | Schedule boundary + mode switch |
| frame-selftest.js | frame | EPF1 frame format validation |
| coherence-test.js | coherence | HTTP state/frame coherence |
| restart-test.js | restart | Restart recovery + data isolation |
| admin-test.js | admin | Admin workflow + auth |
| photo-safety-test.js | photo | Photo source safety |
| storyboard-source-test.js | storyboard | Storyboard source validation |
| rotation-test.js | rotation | Photo + news rotation |
| translation-quality-test.js | translation | Translation quality gates |
| news-render-readability-test.js | render | News readability + SVG render |
| docs-consistency-check.js | docs | Documentation integrity |
| FULL_TRANSLATION_PIPELINE_COVERED=YES | | |
| DUAL_LIBRARY_COVERAGE=YES | | |
| Contract aligned with Acceptance: summaryLines must be 2 or 3 | | |

## 8. Known Gaps

| ID | Description | Status |
|----|-------------|--------|
| GAP-001 | Full translation pipeline unit coverage | CLOSED |
| GAP-002 | Dual library (Learning + Custom) end-to-end | CLOSED |
| GAP-003 | Real CJK glyph rendering — text-rasterizer.js renders real CJK glyphs via sharp SVG text + font-detector (Microsoft YaHei / Noto Sans CJK / Source Han Sans / PingFang SC). ASCII_TEXT_RENDER=IMPLEMENTED, CJK_PLACEHOLDER=IMPLEMENTED, REAL_CJK_MODULE=IMPLEMENTED, REAL_CJK_GLYPH_RENDER=IMPLEMENTED_NOT_PRODUCTION_VERIFIED (true-device ESP32 verification pending). | CLOSED |
| DATA_DIR resolution | Resolved from config or env | IMPLEMENTED |
| NAS target path | Configured default `/var/lib/paper-content-server/data` | CONFIGURED |
| Docker mode | Production container | IMPLEMENTED |
| Container name | paper-frame-server | IMPLEMENTED |
