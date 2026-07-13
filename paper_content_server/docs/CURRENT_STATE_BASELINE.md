# 当前状态基线

> 本文件用于记录“当前真实状态”，不是目标架构。每个阶段完成后更新一次。

AUDITED_CODE_SHA=PENDING_INTEGRATION
ESP32_RUNTIME_STATUS=NOT TESTED
NAS_STAGING_PORT=18080:8787 (host 18080 → container 8787)

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
| Learning Library auto-fetch | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Wikimedia source adapter + downloader + scheduler + ingestion service wired behind learningLibraryEnabled flag | NOT VERIFIED | N/A |
| Learning relevance gate | PARTIAL | | PARTIAL_LICENSE_ONLY — learning-policy.js 只检查 license,无主题/关键词/质量评分 | NOT VERIFIED | N/A |
| Custom Library | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Secure upload pipeline (fileBuffer base64, no filePath), quarantine → sharp decode → MIME mismatch → SHA256 → safety gate → dedup → atomic move; gated by customLibraryEnabled | NOT VERIFIED | N/A |
| Strict NSFW deletion | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | safety-classifier-port + nsfw-safety-gate fail-closed; asset-delete-service full chain (reference check → tombstone → cleanup → audit) gated by deletePipelineEnabled | NOT VERIFIED | N/A |
| Analysis Card | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Real EPF1 rasterizer producing 192010-byte frames; gated by renderShadowEnabled | NOT VERIFIED | N/A |
| Comparison Pair | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Real EPF1 rasterizer producing 192010-byte frames; gated by renderShadowEnabled | NOT VERIFIED | N/A |
| Sequence 2×2 | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Real EPF1 rasterizer producing 192010-byte frames; gated by renderShadowEnabled | NOT VERIFIED | N/A |
| ONE_SHOT_OVERRIDE | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Route uses assetSelectionService.selectForOneShot() for explicit asset selection; 400 on selection failure | NOT VERIFIED | NOT TESTED |
| FOCUS_LOCK | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Route uses assetSelectionService.selectForFocusLock() for theme/albumId matching; 404 on no match (no schedule fallback) | NOT VERIFIED | NOT TESTED |
| MQTT immediate refresh | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | mqtt-message-test 16/16 covers schemaVersion=2 + reason field + v1 backward compat; mqtt-publisher/notification-adapter wiring present | NOT VERIFIED | NOT TESTED |
| Admin production-path publication | PARTIAL | | admin-test covers one-shot photo valid/invalid assetId, expiry, frameId consistency, legacy publish/photo photoId propagation. MQTT reason 字段贯穿 snapshot-model → publication-service → mqtt-publisher. | NOT VERIFIED | NOT TESTED |

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
| Learning Library auto-fetch | src/learning/learning-ingestion-service.js + wikimedia-source-adapter.js + learning-downloader.js + learning-scheduler.js | learning:test (ingestion-production, policy, scheduler, wikimedia adapter); compose-services wiring behind learningLibraryEnabled | NOT VERIFIED | N/A |
| Learning relevance gate | src/learning/learning-policy.js | learning-policy-test (license-only check, no topic/keyword/quality scoring — PARTIAL) | NOT VERIFIED | N/A |
| Custom Library | src/custom-library/custom-library-service.js + custom-file-store.js + server.js /api/admin/library/custom/upload | custom-upload-security-test 46/46; r8 custom-library-service-test 3/3; r8-required-safety-gate-test 2/2 (fileBuffer API, no filePath, no finalPath leak) | NOT VERIFIED | N/A |
| Strict NSFW deletion | src/safety/safety-classifier-port.js + nsfw-safety-gate.js + src/assets/asset-delete-service.js | safety-classifier-port-test; nsfw-safety-gate-test; asset-delete-service-test 37/37 (full delete chain: reference check → tombstone → cleanup → audit) | NOT VERIFIED | N/A |
| Analysis Card | src/render/analysis-card-renderer.js | analysis-card-test (real EPF1 192010-byte frame); renderShadow gating | NOT VERIFIED | N/A |
| Comparison Pair | src/render/comparison-pair-renderer.js | comparison-pair-test (real EPF1 192010-byte frame); renderShadow gating | NOT VERIFIED | N/A |
| Sequence 2×2 | src/render/sequence-2x2-renderer.js | sequence-2x2-test (real EPF1 192010-byte frame); renderShadow gating | NOT VERIFIED | N/A |
| ONE_SHOT_OVERRIDE | src/admin/asset-selection-service.js + server.js /api/admin/publish/one-shot | asset-selection-service-test 17/17; route uses selectForOneShot() for explicit asset validation | NOT VERIFIED | NOT TESTED |
| FOCUS_LOCK | src/admin/asset-selection-service.js + server.js PUT /api/admin/focus-lock | asset-selection-service-test 17/17; route uses selectForFocusLock() for theme/albumId matching, 404 on no match | NOT VERIFIED | NOT TESTED |
| MQTT immediate refresh | src/mqtt/mqtt-message.js (SCHEMA_VERSION=2, reason field) + mqtt-publisher + mqtt-notification-adapter + publication-service reason propagation | mqtt-message-test 16/16; r6 mqtt publisher/adapter tests | NOT VERIFIED | NOT TESTED |
| Admin production-path pub | server.js one-shot + focus-lock + library routes + buildManualPhotoFromAsset + reason propagation through snapshot-model.publishReason | admin-test (one-shot valid/invalid, asset validation, expiry boundary, frameId consistency, library CRUD) | NOT VERIFIED | NOT TESTED |
