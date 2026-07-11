AUDITED_CODE_SHA=6f3f0e3c8328fad2fcb98f3beac50bb628a5fe47

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
| GET | /admin/api/system/status | Admin system status | admin-query-service.js |
| GET | /admin/api/publications | Admin publication list | admin-query-service.js |
| GET | /admin/api/publications/:snapshotId | Admin publication detail | admin-query-service.js |
| GET | /admin/api/assets | Admin asset list | admin-query-service.js |
| GET | /admin/api/assets/:assetId | Admin asset detail | admin-query-service.js |
| GET | /admin/api/features | Admin feature flags | feature-flag-view.js |

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
| translate | server.js | server.js | OpenAI/DeepL/Gemini translation |
| normalize | news-normalizer | src/news/news-normalizer.js | Normalize feed items |
| identity | article-identity | src/news/article-identity.js | Article identity extraction |
| deduplicate | news-deduplicator | src/news/news-deduplicator.js | URL + content dedup |
| translate | translation-gate | src/news/translation-gate.js | Translation provider dispatch |
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
| FULL_TRANSLATION_PIPELINE_COVERED=NO | | |
| DUAL_LIBRARY_COVERAGE=NO | | |
| Contract aligned with Acceptance: summaryLines must be 2 or 3 | | |

## 8. Known Gaps

| ID | Description | Status |
|----|-------------|--------|
| GAP-001 | Full translation pipeline unit coverage | OPEN |
| GAP-002 | Dual library (Learning + Custom) end-to-end | OPEN |
| DATA_DIR resolution | Resolved from config or env | IMPLEMENTED |
| NAS target path | Not configured | NOT_IMPLEMENTED |
| Docker mode | Production container | IMPLEMENTED |
| Container name | paper-frame-server | IMPLEMENTED |
