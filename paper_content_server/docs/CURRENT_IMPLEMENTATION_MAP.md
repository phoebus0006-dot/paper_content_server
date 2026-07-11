# Current Implementation Map

> This file describes "what the code actually does". Generated from live code scan.
> Generator: executor (docs-only phase)

## 1. Repository Baseline

branch=master
AUDITED_CODE_SHA=e3a48071a28bd4d23efd5db75f0212357648d50a
origin/master at audit time=e3a48071a28bd4d23efd5db75f0212357648d50a
server entrypoint=paper_content_server/server.js
firmware entrypoint=NewsPhoto_esp32wf/NewsPhoto_esp32wf.ino
node major=v24.14.1
package manager=npm 10.x
r1 app shell=paper_content_server/src/app/create-app.js
r1 bootstrap=paper_content_server/src/app/bootstrap.js
r1 config=paper_content_server/src/config/load-config.js
r1 infra modules=paper_content_server/src/infra/{clock,logger,atomic-file,json-store,http-client}.js
r1 tests=paper_content_server/test/r1/
r2 frame core=paper_content_server/src/epaper/{palette,quantizer,epf1,frame-validator,image-frame}.js
r2 tests=paper_content_server/test/r2/

### Audit Scope

AUDIT_SCOPE=paper_content_server/server.js at AUDITED_CODE_SHA
AUDITED FEATURES: schedule resolver via lib/schedule.js, news pipeline (fetch/parse/translate/select), photo rotation, basic admin override, EPF1 frame format, state/frame coherence
NOT_IN_SCOPE: ONE_SHOT route, boundary expiry, FOCUS_LOCK, MQTT, learning/custom library, safety delete pipeline
NAS/ESP32 evidence: NOT VERIFIED / NOT TESTED.
R1_INTEGRATION_COMPLETE: server.js uses loadConfig, SystemClock, ConsoleLogger, writeFileAtomic, JsonStore, httpClient. bootstrap() provides app shell. See test/r1/production-integration-test.js for 18 passing integration checks.

## 2. Server Entrypoint

SERVER_JS_PHYSICAL_LINES=3033
TOP_LEVEL_FUNCTIONS=114
PROCESS_ENV_READS=24 (24 in process.env reads at module scope; now centralized via loadConfig)
ROUTE_REGISTRATION=handleRequest() at byte 96995
SHUTDOWN_HOOKS=process.on found (SIGTERM/SIGINT)
MQTT_MODULE_IMPORT=NOT_FOUND (verified) (confirmed)
MQTT_PACKAGE=NOT_IN_PACKAGE_JSON (verified) (confirmed)

### Mutable Global State

All mutable state lives in single `runtime` object:
- runtime.feeds / runtime.feedsLoadedAt
- runtime.newsCache (persisted: news_cache.json)
- runtime.newsRotation (persisted: news_rotation_state.json)
- runtime.lastGoodNews (persisted: last_good_news.json)
- runtime.fallbackStudyEntries / runtime.fallbackStudyReady
- runtime.libraryState (persisted: library_state.json)
- runtime.imageIndex / runtime.fullImageIndex (persisted: image_index.json)
- runtime.cachedFrames (Map, in-memory)
- runtime.cachedSnapshots (Map, in-memory)
- runtime.pinnedSnapshots (Map, in-memory, 30s TTL)
- runtime.nowProvider / runtime.pinNowProvider (global test overrides)
- runtime.renderCount / runtime.serverStartTime / runtime.lastNewsRefreshAt

## 3. HTTP Routes

| Method | Path | Handler Location | Service Called | Writes State | Classification |
|---|---|---|---|---|---|
| GET | /api/state.json | handleRequest | computeSnapshot() | No (reads caches) | CURRENT_PRODUCTION |
| GET | /api/frame.bin | handleRequest | getContentForNow() | No (reads caches) | CURRENT_PRODUCTION |
| GET | /api/news.json | handleRequest | buildNewsSnapshot() | No (reads caches) | CURRENT_PRODUCTION |
| GET | /api/health.json | handleRequest | inline counters | No | CURRENT_PRODUCTION |
| GET | /api/review.json | handleRequest | getContentForNow() | No | CURRENT_PRODUCTION |
| GET | /api/library.json | handleRequest | inline index filter | No | CURRENT_PRODUCTION |
| GET | /debug/config | handleRequest | inline | No | DEBUG_ONLY |
| GET | /debug/clock | handleRequest | runtime.nowProvider | No | DEBUG_ONLY |
| GET | /debug/news.svg | handleRequest | buildNewsSnapshot + render | No | DEBUG_ONLY |
| GET | /debug/news.png | handleRequest | buildNewsSnapshot + sharp | No | DEBUG_ONLY |
| GET | /debug/news-review-6.png | handleRequest | buildNewsSnapshot + sharp | No | DEBUG_ONLY |
| GET | /debug/photo.png | handleRequest | buildPhotoSnapshot + sharp | No | DEBUG_ONLY |
| GET | /debug/photo-info.json | handleRequest | buildPhotoSnapshot() | No | DEBUG_ONLY |
| GET | /debug/photo-palette.json | handleRequest | inline | No | DEBUG_ONLY |
| GET | /debug/photo-before-after.png | handleRequest | buildPhotoSnapshot + sharp | No | DEBUG_ONLY |
| GET | /debug/photo-review.png | handleRequest | buildPhotoSnapshot | No | DEBUG_ONLY |
| GET | /debug/pin-state.json | handleRequest | getPinnedSnapshot | No | DEBUG_ONLY |
| GET | /test/frame-ok|handleRequest|buildFrameBuffer static|No|DEBUG_ONLY|
| GET | /test/frame-500|handleRequest|HTTP 500|No|DEBUG_ONLY|
| GET | /test/frame-id-missing|handleRequest|no X-Frame-Id|No|DEBUG_ONLY|
| GET | /test/frame-id-mismatch|handleRequest|wrong X-Frame-Id|No|DEBUG_ONLY|
| GET | /test/frame-short|handleRequest|100-byte body|No|DEBUG_ONLY|
| GET | /test/frame-bad-magic|handleRequest|BAD! header|No|DEBUG_ONLY|
| GET | /test/frame-bad-size|handleRequest|1234x567|No|DEBUG_ONLY|
| GET | /test/frame-bad-panel|handleRequest|panel 99|No|DEBUG_ONLY|
| GET | /test/frame-short-read|handleRequest|truncated EPF1|No|DEBUG_ONLY|
| GET | /admin|handleRequest|serveAdminFile|No|CURRENT_LEGACY|
| GET | /admin/admin.css|handleRequest|serveAdminFile|No|CURRENT_LEGACY|
| GET | /admin/admin.js|handleRequest|serveAdminFile|No|CURRENT_LEGACY|
| GET | /api/admin/dashboard|handleRequest|inline stats|No|CURRENT_LEGACY|
| GET | /api/admin/news|handleRequest|read cachedSnapshots|No|CURRENT_LEGACY|
| POST | /api/admin/news/draft|handleRequest|validate+writeFileSync|YES direct fs|CURRENT_LEGACY|
| POST | /api/admin/publish/news|handleRequest|inline render+writeFileSync|YES direct fs|CURRENT_LEGACY|
| POST | /api/admin/publish/photo|handleRequest|inline check+writeFileSync|YES direct fs|CURRENT_LEGACY|
| DELETE | /api/admin/override|handleRequest|unlinkSync|YES direct fs|CURRENT_LEGACY|
| GET | /api/admin/publish-history|handleRequest|readPubHistory|No|CURRENT_LEGACY|
| POST | /api/admin/rollback|handleRequest|readPubHistory+writeFileSync|YES direct fs|CURRENT_LEGACY|
| GET | /api/admin/photos|handleRequest|index filter|No|CURRENT_LEGACY|
| POST | /api/admin/publish/one-shot|handleRequest|validate+writeFileSync|YES direct fs|TARGET_IMPLEMENTED (admin-test only, NAS NOT VERIFIED, ESP32 NOT TESTED)|

TARGET_NOT_IMPLEMENTED: /api/admin/focus-lock, /api/admin/library, /api/admin/library/custom/upload

## 4. Runtime State

| State | In-memory Owner | Persistent File | Write Paths | Read Paths |
|---|---|---|---|---|
| News translation cache | runtime.newsCache.translations | data/news_cache.json | translateArticle() | translateArticle() cache lookup |
| News rotation history | runtime.newsRotation.shown | data/news_rotation_state.json | recordShownItems() | isRecentlyShown() |
| Last-good news | runtime.lastGoodNews | data/last_good_news.json | buildNewsSnapshot() (6 valid) | buildNewsSnapshot() fallback |
| Image index | runtime.imageIndex+fullImageIndex | data/image_index.json | buildPhotoSnapshot() | selectPhotoSnapshot/selectStudyPhoto |
| Library state | runtime.libraryState | data/library_state.json | buildPhotoSnapshot() | updateLibraryStateForPhoto() |
| Publication history | none | data/publish_history.json | publish/news + publish/photo | readPubHistory() |
| Admin override | none | data/admin_override.json | publish/news + publish/photo | loadActiveOverride() in computeSnapshot() and getContentForNow() |
| Frame cache | runtime.cachedFrames (Map) | in-memory only | getContentForNow() | getContentForNow() |
| Snapshot cache | runtime.cachedSnapshots (Map) | in-memory only | buildNewsSnapshot/computeSnapshot | same |
| Pin store | runtime.pinnedSnapshots (Map) | in-memory 30s TTL | setPinnedSnapshot() | getPinnedSnapshot() |

## 5. News Implementation Map

| Stage | Function | File | Status | Evidence |
|---|---|---|---|---|
| fetch | fetchText() | server.js L658 | IMPLEMENTED | HTTP with AbortController |
| parse | parseFeedXml/parseJsonFeed | server.js L591/L620 | IMPLEMENTED | RSS + JSON feed |
| normalize | normalizeText/stripHtml | server.js L331/L338 | IMPLEMENTED | Unicode + HTML |
| pre-dedupe | bigramDice+canonicalUrl | server.js L716 | IMPLEMENTED | URL + 0.88 similarity |
| translation provider | translateArticle | server.js L1115 | IMPLEMENTED | openai/gemini/deepl |
| translation cache | runtime.newsCache.translations | server.js L1173 | IMPLEMENTED | key=provider+lang+source+title+summary |
| format gate | evaluateNewsItemQuality | server.js L1327 | IMPLEMENTED | length+bad endings |
| fidelity verifier | isTextSemanticallyComplete | server.js L907 | PARTIAL | format only (Chinese chars, punctuation, hanging ends). NOT semantic fidelity. |
| Chinese editor | rewriteNewsTitle+rewriteNewsSummary | server.js L950/L1024 | IMPLEMENTED | entity normalization, hanging-end removal |
| layout | layoutNewsCard | server.js L2106 | IMPLEMENTED | shared by production+tests |
| final dedupe | seenUrls+seenTitles | server.js L1462 | PARTIAL | URL+title dedupe exists, but article identity/event-level dedup not fully proven. History: same event occupied two slots. |
| quality gate | evaluateNewsItemQuality + isTextSemanticallyComplete | server.js L1327/L907 | PARTIAL | format+basic completeness. No true semantic gate. |
| selector | tryAdd+selectNewsItems | server.js L1453/L765 | IMPLEMENTED | source quota max 2, category round-robin |
| last-good | runtime.lastGoodNews | server.js L1542 | IMPLEMENTED | saved on 6 valid, used as fallback |

## 6. Image Library Implementation Map

### Learning Library

| Capability | Status | File | Function | Evidence | Gap |
|---|---|---|---|---|---|
| source adapters | NOT_IMPLEMENTED | — | — | No learning/source-adapters/ | Wikimedia photo_sources.json exists but is not targeted learning adapter |
| rights gate | NOT_IMPLEMENTED | — | — | parseWikimediaRights in lib/wikimedia.js not integrated | No formal rights verification gate |
| safety gate | PARTIAL | server.js L890 | BLOCKLIST_WORDS regex | Regex only; no real NSFW scanner | isImageReady checks file existence only |
| relevance gate | NOT_IMPLEMENTED | — | — | No relevance evaluation | selectStudyPhoto selects by theme/kind only |
| technical quality | NOT_IMPLEMENTED | — | — | isImageReady checks dimensions+exists only | No decode quality assessment |
| repository | IMPLEMENTED | server.js L1588 | loadImageIndex() | image_index.json loaded at startup | |
| selector | IMPLEMENTED | server.js L1937 | selectStudyPhoto() | isStudySelectable filter | Uses old safetyStatus/poolType model |
| rotation | IMPLEMENTED | server.js L1852 | updateLibraryStateForPhoto() | Theme-based, daySeed, slot tracking | |

### Custom Library

| Capability | Status | File | Function | Evidence | Gap |
|---|---|---|---|---|---|
| upload endpoint | NOT_IMPLEMENTED | — | — | No HTTP upload | CLI-only process-images.js |
| decode validation | PARTIAL | process-images.js | sharp decode | CLI validates decode | No server-side upload validation |
| safety gate | PARTIAL | server.js L890 | BLOCKLIST_WORDS | Same regex as Learning | No upload-path safety integration |
| repository | PARTIAL | server.js L1588 | loadImageIndex() | Same image_index.json | No libraryType field |
| album/tag | NOT_IMPLEMENTED | — | — | No album/tag data model | |
| selector | PARTIAL | server.js L1937 | selectStudyPhoto() | No libraryType filter | No PHOTO_SOURCE_MODE |

## 7. Operating Modes

| Mode | Status | Evidence |
|---|---|---|
| AUTO | IMPLEMENTED | resolveDisplayMode in lib/schedule.js; 00-29 photo, 30-59 news; night hold 19:00-10:00 |
| ONE_SHOT_OVERRIDE | IMPLEMENTED | admin_override.json written with expiresAt=next HH:00/HH:30. loadActiveOverride() checks expiry and deletes expired. Override read in computeSnapshot() + getContentForNow(). POST /api/admin/publish/one-shot validates assetId and stores it; getContentForNow renders the specified asset when override contains assetId/photoId. |
| FOCUS_LOCK | NOT_IMPLEMENTED | No FOCUS_LOCK API, state, or handling in code |

## 8. MQTT

| Capability | Status | Evidence |
|---|---|---|
| server publisher | NOT_IMPLEMENTED | No MQTT library in package.json; no MQTT code in server.js |
| topic configuration | NOT_IMPLEMENTED | — |
| publish ordering | NOT_IMPLEMENTED | — |
| firmware client | NOT_IMPLEMENTED | No MQTT code in firmware directory |
| callback behavior | NOT_IMPLEMENTED | — |
| reconnect/resubscribe | NOT_IMPLEMENTED | — |
| immediate state check | NOT_IMPLEMENTED | — |
| poll fallback | IMPLEMENTED | 60s HTTP polling in firmware (confirmed existing behavior) |

## 9. Rendering and Frame

| Capability | Status | File | Function | Evidence |
|---|---|---|---|---|
| news renderer | IMPLEMENTED | server.js L2130 | renderNewsSvg+renderNewsFrame | SVG-based, 6 cards, sharp PNG |
| photo renderer | IMPLEMENTED | server.js L2168 | renderPhotoFrame | sharp PNG, resize, quantize |
| analysis card | NOT_IMPLEMENTED | — | — | No analysis overlay code |
| comparison pair | NOT_IMPLEMENTED | — | — | No side-by-side renderer |
| sequence 2x2 | NOT_IMPLEMENTED | — | — | No 2x2 grid renderer |
| quantizer | IMPLEMENTED | server.js L2258 | imageToFrameBuffer+nearestPaletteCode | nearest-neighbor; optional FS dither |
| EPF1 encoder | IMPLEMENTED | server.js L2350 | buildFrameBuffer | 10-byte header + 192000 payload |
| frame validator | NOT_IMPLEMENTED | — | — | No dedicated validator module; validation ad-hoc in tests/firmware |

## 10. Test Map

| Test Script | Production Modules Called | External Mocks | Duplicated Algorithm? | Hardcoded Pass? | Network Error | Exit Code | Notes |
|---|---|---|---|---|---|---|---|
| schedule-test.js | lib/schedule.js | none | No | No | N/A | 0 | 18 boundaries |
| frame-selftest.js | imageToFrameBuffer | none | No | No | N/A | 0 | palette encoding |
| coherence-test.js | full server HTTP | server process | No | No | timeout=FAIL | 0 | state/frame/pinning/TTL |
| restart-test.js | full server HTTP | server process | No | No | timeout=FAIL | 0 | fresh/restart/corrupt/isolation |
| admin-test.js | full server HTTP | server process | No | No | error=FAIL | 0 | auth/draft/publish/photo/override |
| photo-safety-test.js | selectStudyPhoto, isStudySelectable, isImageApproved | none | No | No | N/A | 0 | LEGACY_POOL_MODEL_COVERAGE=YES (study_frames/decorative_photos). DUAL_LIBRARY_COVERAGE=NO. SOURCE_ISOLATION_COVERAGE=NO. STRICT_DELETE_PIPELINE_COVERAGE=NO |
| storyboard-source-test.js | lib modules | Wikimedia HTTP | No | No | N/A | 0 | metadata parsing, sequence sort |
| rotation-test.js | full server HTTP | feed HTTP mock | No | No | timeout=FAIL | 0 | photo unit/HTTP rotation/last-good A/B/C |
| translation-quality-test.js | isTextSemanticallyComplete, normalizeEntities, rewriteTitle, rewriteSummary, evaluateQuality, PROTECTED_ENTITIES | none | No | No | N/A | 0 | TEST_LEVEL=HELPER_FUNCTION_PATH FULL_TRANSLATION_PIPELINE_COVERED=NO FIDELITY_SEMANTIC_VALIDATION_COVERED=NO |
| news-render-readability-test.js | full server HTTP + layoutNewsCard | server process | No | No | timeout=FAIL | 0 | Contract aligned with Acceptance: summaryLines must be 2 or 3; overflow remains forbidden. |
| rss-selftest.js | standalone | none | No | No | N/A | 0 | self-contained |
| docs-consistency-check.js | fs only | none | No | No | N/A | 0 | 25 docs, 6 ADRs, patterns |

## 11. Data and Deployment

| Item | Value | Evidence |
|---|---|---|
| DATA_DIR resolution | resolveConfiguredPath(APP_CONFIG.dataDir || 'data') | server.js L149 |
| Tracked runtime files | image_index.json, library_state.json, news_cache.json, news_rotation_state.json, last_good_news.json, publish_history.json, admin_news_draft.json, admin_override.json | all in data/ |
| NAS target path | /vol1/docker/paper-frame-server/ | previous deployments |
| Docker mode | docker compose with build + docker-compose.yml | compose.yml |
| Bind mounts | server.js, package.json, feeds.json, scripts/, config.json, .env (ro); data/, images/ (rw) | docker-compose.yml |
| Persistent volumes | none (bind mounts only) | docker-compose.yml |
| Container name | paper-frame-server | docker-compose.yml |

## 12. Known Gaps

GAP-001 MQTT Immediate Refresh — NOT_IMPLEMENTED. No MQTT code. Risk: device waits 60s.
GAP-002 FOCUS_LOCK — NOT_IMPLEMENTED. No focus lock API or state.
GAP-003 ONE_SHOT Boundary Expiry — IMPLEMENTED. admin_override written with expiresAt=next HH:00/HH:30; loadActiveOverride() deletes expired.
GAP-004 Dual-Library Source Isolation — NOT_IMPLEMENTED. No libraryType field. Single selector.
GAP-005 Custom Library Upload/API — NOT_IMPLEMENTED. No HTTP upload.
GAP-006 Learning Relevance Gate — NOT_IMPLEMENTED. No relevance evaluation.
GAP-007 Strict NSFW Delete Pipeline — PARTIAL. Blocklist regex only; no delete pipeline or tombstone store.
GAP-008 Real Translation Fidelity Verifier — PARTIAL. isTextSemanticallyComplete checks format only.
GAP-009 Analysis Card Renderer — NOT_IMPLEMENTED.
GAP-010 Comparison Pair Renderer — NOT_IMPLEMENTED.
GAP-011 Sequence 2x2 Renderer — NOT_IMPLEMENTED.
GAP-012 Production-Path Admin Publication — PARTIAL. POST /api/admin/publish/one-shot implemented with asset validation and expiry. getContentForNow renders the specific asset when override contains assetId/photoId. Legacy publish/photo also writes photoId for corrected rendering. Evidence: admin-test only (62 tests). No snapshot service, no MQTT. NAS NOT VERIFIED, ESP32 NOT TESTED.


### GAP-013: Final Dedupe Completeness
- **Requirement**: 6 independent news (canonical URL unique, article identity unique, final title unique, duplicate count=0)
- **Current Implementation**: URL/title dedupe exists but article identity/event-level duplicate prevention not fully proven
- **Status**: PARTIAL
- **Risk**: Same event may occupy multiple slots (historically confirmed)
- **Evidence**: History shows same NYT article occupied two slots. Current dedup checks URL + normalized title but not event identity.
- **Planned Phase**: Phase 6 — News Pipeline

### GAP-014: News Layout Test Requirement Mismatch
- **Requirement**: Acceptance requires summaryLines=2 or 3
- **Current Implementation**: news-render-readability-test accepts summaryLines 2 or 3 while still rejecting overflow.
- **Status**: RESOLVED_IN_PHASE_1_CONTRACT
- **Risk**: None for the previous 3-line-only mismatch. Full news pipeline fidelity remains separate Phase 6 work.
- **Planned Phase**: Phase 1 — Characterization Contracts

### GAP-015: Photo Safety Test — Dual Library Coverage
- **Requirement**: Dual-library architecture with Learning Library + Custom Library source isolation
- **Current Implementation**: photo-safety-test.js covers old study_frames/decorative_photos model only
- **Status**: NOT_COVERED
- **Risk**: No automated test validates dual-library source isolation
- **Planned Phase**: Phase 7 — Learning Library + Phase 8 — Custom Library

## 13. Update Rule

Each refactor Phase must update this file after merge. Prohibited: claiming target module as implemented because it appears in SYSTEM_ARCHITECTURE.md.
