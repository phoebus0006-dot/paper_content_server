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
| Learning Library auto-fetch | NOT_IMPLEMENTED | | learningIngestionService.ingestAll() 存在但 sourceRegistry 为空,无真实 source adapter,无 scheduler | NOT VERIFIED | N/A |
| Learning relevance gate | PARTIAL | | PARTIAL_LICENSE_ONLY — learning-policy.js 只检查 license,无主题/关键词/质量评分 | NOT VERIFIED | N/A |
| Custom Library | PARTIAL | | PARTIAL_SECURITY_BLOCKED — POST /api/admin/library/custom/upload 接受客户端 filePath(安全漏洞),无真实 multipart,无真实 NSFW classifier(只是文件名关键词匹配) | NOT VERIFIED | N/A |
| Strict NSFW deletion | NOT_IMPLEMENTED | | NOT_IMPLEMENTED_REAL_CLASSIFIER — nsfw-safety-gate.js 只是文件名启发式,不是真实图像内容分类器 | NOT VERIFIED | N/A |
| Analysis Card | PARTIAL | | MODULE_ONLY_NOT_EPAPER_RENDERED — 渲染器只是 Buffer.from(JSON.stringify(layout)),不产生真实 EPF1 帧 | NOT VERIFIED | N/A |
| Comparison Pair | PARTIAL | | MODULE_ONLY_NOT_EPAPER_RENDERED — 渲染器只是 Buffer.from(JSON.stringify(layout)),不产生真实 EPF1 帧 | NOT VERIFIED | N/A |
| Sequence 2×2 | PARTIAL | | MODULE_ONLY_NOT_EPAPER_RENDERED — 渲染器只是 Buffer.from(JSON.stringify(layout)),不产生真实 EPF1 帧 | NOT VERIFIED | N/A |
| ONE_SHOT_OVERRIDE | PARTIAL | | 路由存在但 assetId 参数被接受后未真正用于资产选择 | NOT VERIFIED | NOT TESTED |
| FOCUS_LOCK | PARTIAL | | 路由存在但 theme/albumId 未真正查询资产 | NOT VERIFIED | NOT TESTED |
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
| Learning Library auto-fetch | src/learning/learning-ingestion-service.js (ingestAll exists) | — (sourceRegistry empty, no source adapter, no scheduler) | NOT VERIFIED | N/A |
| Learning relevance gate | src/learning/learning-policy.js | — (license-only check, no topic/keyword/quality scoring) | NOT VERIFIED | N/A |
| Custom Library | src/assets/asset-repository.js + server.js /api/admin/library routes | asset-repository tests; admin-test library routes (upload accepts client filePath — security vuln; no real multipart; NSFW is filename heuristic only) | NOT VERIFIED | N/A |
| Strict NSFW deletion | src/safety/nsfw-safety-gate.js (filename keyword match only) | — (no real image content classifier) | NOT VERIFIED | N/A |
| Analysis Card | module exists | — (renderer only Buffer.from(JSON.stringify(layout)), no real EPF1 frame: no magic/width/height/panel/palette quantization) | NOT VERIFIED | N/A |
| Comparison Pair | module exists | — (renderer only Buffer.from(JSON.stringify(layout)), no real EPF1 frame) | NOT VERIFIED | N/A |
| Sequence 2×2 | module exists | — (renderer only Buffer.from(JSON.stringify(layout)), no real EPF1 frame) | NOT VERIFIED | N/A |
| ONE_SHOT_OVERRIDE | src/publication/operating-mode-service.js enterOneShot/checkExpiry + server.js /api/admin/publish/one-shot + computeNextSwitchAt | operating-mode-service-test 23/23; admin-test one-shot route (assetId accepted but not actually used for asset selection) | NOT VERIFIED | NOT TESTED |
| FOCUS_LOCK | src/publication/operating-mode-service.js enterFocusLock/exitFocusLock + server.js PUT/DELETE /api/admin/focus-lock | operating-mode-service-test 23/23; admin-test focus-lock routes (theme/albumId accepted but not actually queried against assets) | NOT VERIFIED | NOT TESTED |
| MQTT immediate refresh | src/mqtt/mqtt-message.js (SCHEMA_VERSION=2, reason field) + mqtt-publisher + mqtt-notification-adapter + publication-service reason propagation | mqtt-message-test 16/16; r6 mqtt publisher/adapter tests | NOT VERIFIED | NOT TESTED |
| Admin production-path pub | server.js one-shot + focus-lock + library routes + buildManualPhotoFromAsset + reason propagation through snapshot-model.publishReason | admin-test (one-shot valid/invalid, asset validation, expiry boundary, frameId consistency, library CRUD) | NOT VERIFIED | NOT TESTED |
