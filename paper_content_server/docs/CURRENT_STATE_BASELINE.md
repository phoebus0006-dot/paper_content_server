# 当前状态基线

> 本文件用于记录“当前真实状态”，不是目标架构。每个阶段完成后更新一次。

AUDITED_CODE_SHA=PENDING_INTEGRATION
ESP32_RUNTIME_STATUS=NOT TESTED
NAS_STAGING_PORT=18080:8787 (host 18080 → container 8787)
REAL_CLASSIFIER=BLOCKED
NAS_DYNAMIC_ACCEPTANCE=NOT_TESTED
ESP32_DYNAMIC_ACCEPTANCE=NOT_TESTED

## 1. 状态标签

只允许：

- IMPLEMENTED_AND_VERIFIED
- IMPLEMENTED_NOT_PRODUCTION_VERIFIED
- PARTIAL
- NOT_IMPLEMENTED
- BLOCKED
- UNKNOWN

## 2. 当前项目硬约束

- ESP32-S3；
- 7.3-inch Spectra 6；
- 800×480；
- panel 49；
- 现有 SPI pins 不变；
- 60 秒 HTTP polling 保留；
- EPF1 total=192010；
- palette codes=0,1,2,3,5,6；
- code4 禁止。

## 3. 当前功能状态表

审查者必须根据最新 Git、NAS 和真机证据填写，禁止从目标文档推断。

| Capability | Status | Evidence Commit | Test Evidence | NAS Evidence | ESP32 Evidence |
|---|---|---|---|---|---|
| Schedule | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | | | |
| State/frame coherence | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | | | |
| ESP32 frame validation | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | | | |
| News live fetch | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | | | |
| News translation fidelity | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | | | |
| News final dedupe | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | | | |
| News layout | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | | | |
| Last-good | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | | | |
| Learning Library auto-fetch | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Wikimedia source adapter + HTTPS-only downloader (size/redirect/timeout guards) + scheduler with classifierReady gate + ingestion service (enabled guard, fail-closed decode); wired behind learningLibraryEnabled flag. Scheduler does NOT start when classifier not ready (zero network requests). | NOT TESTED | N/A |
| Learning relevance gate | PARTIAL | | PARTIAL_LICENSE_ONLY — learning-policy.js 只检查 license,无主题/关键词/质量评分 | NOT VERIFIED | N/A |
| Custom Library | BLOCKED | | Streaming upload (octet-stream → processUploadStream → quarantine → sharp decode → MIME mismatch → SHA256 → safety gate → dedup → atomic move) fully wired, but classifier has no real model → fail-closed (CLASSIFIER_UNAVAILABLE). Upload cannot ACCEPT until a real NSFW model is configured. Gated by customLibraryEnabled + classifierReady. | NOT TESTED | N/A |
| Strict NSFW deletion | NOT_IMPLEMENTED | | No real NSFW classifier model. safety-classifier-port fail-closed (configured=false, ready=false). asset-delete-service atomic chain (markBlocked → tombstone → cleanup → audit → markTombstoned, reason enum) is IMPLEMENTED but cannot make a real deletion decision without a classifier. | NOT TESTED | N/A |
| Analysis Card | PARTIAL | | Real EPF1 rasterizer (5x7 ASCII bitmap font + CJK placeholder blocks; NOT real CJK glyphs) producing 192010-byte frames; gated by renderShadowEnabled | NOT TESTED | N/A |
| Comparison Pair | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Real EPF1 rasterizer (sharp decode + quantize) producing 192010-byte frames; gated by renderShadowEnabled | NOT TESTED | N/A |
| Sequence 2×2 | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Real EPF1 rasterizer producing 192010-byte frames; gated by renderShadowEnabled | NOT TESTED | N/A |
| ONE_SHOT_OVERRIDE | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Route uses assetSelectionService.selectForOneShot() for strict explicit asset selection (no fallback); override persisted via overridePersistence.saveOverride() with restart validation (validateOverrideAsync re-checks asset safety/selectability/file existence; cleared if invalid, no silent swap) | NOT TESTED | NOT TESTED |
| FOCUS_LOCK | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Route uses assetSelectionService.selectForFocusLock() for strict theme/albumId matching (404 on no match, no schedule fallback); override persisted + restart-validated same as ONE_SHOT | NOT TESTED | NOT TESTED |
| MQTT immediate refresh | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | mqtt-message-test 16/16 covers schemaVersion=2 + reason field + v1 backward compat; mqtt-publisher/notification-adapter wiring present | NOT VERIFIED | NOT TESTED |
| Admin production-path publication | PARTIAL | | admin-test covers one-shot photo valid/invalid assetId, expiry, frameId consistency, legacy publish/photo photoId propagation. MQTT reason 字段贯穿 snapshot-model → publication-service → mqtt-publisher. | NOT VERIFIED | NOT TESTED |

### Render Fidelity (Text)

ASCII_TEXT_RENDER=IMPLEMENTED
CJK_PLACEHOLDER=IMPLEMENTED
REAL_CJK_GLYPH_RENDER=NOT_IMPLEMENTED

当前文字渲染器 (`src/render/text-rasterizer.js`) 使用内置 5x7 bitmap font，仅支持 ASCII 字母/数字/基本标点。CJK 字符回退到 `renderCJKPlaceholder` 绘制的占位方块 (填充轮廓)，不是真实 CJK 字形。Noto Sans CJK 路径仅被探测 (`CJK_FONT_AVAILABLE` flag) 但从不加载，因此不渲染任何真实 CJK glyph。`cjk=YES` 标签不正确 — 应为 `cjk=PLACEHOLDER_ONLY`。

## 4. 更新规则

每次状态变化必须同时记录：

- commit SHA；
- 测试名称与 exit code；
- NAS 版本 SHA；
- HTTP 实际结果；
- ESP32 状态，若没有真机证据必须写 NOT TESTED。

禁止写：

“全部完成”

而没有逐项证据。
## 5. Evidence Summary

| Capability | Evidence Commit | Test Evidence | NAS Evidence | ESP32 Evidence |
|---|---|---|---|---|
| Schedule | server.js L1968 + lib/schedule.js | schedule-test 18/18 | NOT VERIFIED | NOT TESTED |
| State/frame coherence | server.js L2535-2598 | coherence-test 53/53 | NOT VERIFIED | NOT TESTED |
| ESP32 frame validation | firmware + test routes | restart-test + frame tests | NOT VERIFIED | NOT TESTED |
| News live fetch | server.js L691-735 | rotation-test Phase A/B/C | NOT VERIFIED | NOT TESTED |
| News translation fidelity | server.js L1115-1185 | translation-quality-test 31/31 (helper path) | NOT VERIFIED | NOT TESTED |
| News final dedupe | server.js L1462-1483 | news-render-readability-test | NOT VERIFIED | NOT TESTED |
| News layout | server.js L2106-2115 (layoutNewsCard) | news-render-readability-test 17/17 | NOT VERIFIED | NOT TESTED |
| Last-good | server.js L1542 | rotation-test Phase B/C | NOT VERIFIED | N/A |
| Learning Library auto-fetch | src/learning/learning-ingestion-service.js + wikimedia-source-adapter.js + learning-downloader.js + learning-scheduler.js + src/app/compose-services.js (classifierReady gate) | learning:test; v3:integration SECTION 2 (scheduler status=SAFETY_CLASSIFIER_NOT_READY when no model) | NOT TESTED | N/A |
| Learning relevance gate | src/learning/learning-policy.js | learning-policy-test (license-only check, no topic/keyword/quality scoring — PARTIAL) | NOT VERIFIED | N/A |
| Custom Library | src/custom-library/custom-library-service.js (processUploadStream) + custom-file-store.js (createQuarantineWriteStream/streamDecode/streamSha256) + server.js /api/admin/library/custom/upload (octet-stream) + src/app/compose-services.js (config.safety passthrough) | custom-upload-security-test; v3:integration SECTION 2 (streaming upload → fail-closed CLASSIFIER_UNAVAILABLE when no model; 415 on wrong Content-Type) | NOT TESTED | N/A |
| Strict NSFW deletion | src/safety/safety-classifier-port.js + nsfw-safety-gate.js + src/assets/asset-delete-service.js (reason enum, markBlocked-before-tombstone) + server.js DELETE route (atomic, no legacy fallback) | safety-classifier-port-test; nsfw-safety-gate-test; asset-delete-service-test; v3:integration SECTION 2 (DELETE 400 no reason, 400 bad reason, 404 not found, 503 flag off) | NOT TESTED | N/A |
| Analysis Card | src/render/analysis-card-renderer.js (5x7 ASCII bitmap font + CJK placeholder blocks; real CJK glyphs NOT implemented) | analysis-card-test; v3:integration SECTION 4 (EPF1 192010 bytes) | NOT TESTED | N/A |
| Comparison Pair | src/render/comparison-pair-renderer.js (sharp decode + quantize) | comparison-pair-test; v3:integration SECTION 4 (EPF1 192010 bytes) | NOT TESTED | N/A |
| Sequence 2×2 | src/render/sequence-2x2-renderer.js | sequence-2x2-test; v3:integration SECTION 4 (EPF1 192010 bytes) | NOT TESTED | N/A |
| ONE_SHOT_OVERRIDE | src/admin/asset-selection-service.js + src/admin/override-persistence.js + server.js /api/admin/publish/one-shot + startup restore | asset-selection-service-test; v3:integration SECTION 3 (ONE_SHOT 200 + override file written + restart restored) + SECTION 6 (invalid override cleared on restart) | NOT TESTED | NOT TESTED |
| FOCUS_LOCK | src/admin/asset-selection-service.js + src/admin/override-persistence.js + server.js PUT/DELETE /api/admin/focus-lock | asset-selection-service-test; v3:integration SECTION 3 (FOCUS_LOCK 200 + override written + exit clears override) | NOT TESTED | NOT TESTED |
| MQTT immediate refresh | src/mqtt/mqtt-message.js (SCHEMA_VERSION=2, reason field) + mqtt-publisher + mqtt-notification-adapter + publication-service reason propagation | mqtt-message-test 16/16; r6 mqtt publisher/adapter tests | NOT VERIFIED | NOT TESTED |
| Admin production-path pub | server.js one-shot + focus-lock + library routes + buildManualPhotoFromAsset + reason propagation through snapshot-model.publishReason | admin-test (one-shot valid/invalid, asset validation, expiry boundary, frameId consistency, library CRUD) | NOT VERIFIED | NOT TESTED |
