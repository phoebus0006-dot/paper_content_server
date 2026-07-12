# 当前状态基线

> 本文件用于记录“当前真实状态”，不是目标架构。每个阶段完成后更新一次。

AUDITED_CODE_SHA=55e44e054a9e0df0a95d1d09fc4168de6cf6f45a
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
| News translation fidelity | PARTIAL | | | | |
| News final dedupe | PARTIAL | | | | |
| News layout | PARTIAL | | | | |
| Last-good | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | | | |
| Learning Library auto-fetch | NOT_IMPLEMENTED | | | | |
| Learning relevance gate | NOT_IMPLEMENTED | | | | |
| Custom Library | NOT_IMPLEMENTED | | | | |
| Strict NSFW deletion | PARTIAL | | | | |
| Analysis Card | NOT_IMPLEMENTED | | | | |
| Comparison Pair | NOT_IMPLEMENTED | | | | |
| Sequence 2×2 | NOT_IMPLEMENTED | | | | |
| ONE_SHOT_OVERRIDE | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | admin-test 62/62 includes one-shot endpoint, expiry boundary, state/frameId consistency | NOT VERIFIED | NOT TESTED |
| FOCUS_LOCK | NOT_IMPLEMENTED | | | | |
| MQTT immediate refresh | NOT_IMPLEMENTED | | | | |
| Admin production-path publication | PARTIAL | | admin-test 62/62 covers one-shot photo valid/invalid assetId, expiry, frameId consistency, legacy publish/photo photoId propagation. No snapshot service, no MQTT. | NOT VERIFIED | NOT TESTED |

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
| Learning Library auto-fetch | — | — | NOT VERIFIED | N/A |
| Learning relevance gate | — | — | NOT VERIFIED | N/A |
| Custom Library | — | — | NOT VERIFIED | N/A |
| Strict NSFW deletion | server.js L890 (blocklist) | — | NOT VERIFIED | N/A |
| Analysis Card | — | — | NOT VERIFIED | N/A |
| Comparison Pair | — | — | NOT VERIFIED | N/A |
| Sequence 2×2 | — | — | NOT VERIFIED | N/A |
| ONE_SHOT_OVERRIDE | server.js L3093/L3113 computeNextHalfHourBoundary + loadActiveOverride + getContentForNow + buildManualPhotoFromAsset | admin-test (override expiry test, one-shot photo endpoint, frameId consistency) | NOT VERIFIED | NOT TESTED |
| FOCUS_LOCK | — | — | NOT VERIFIED | NOT TESTED |
| MQTT immediate refresh | — | — | NOT VERIFIED | NOT TESTED |
| Admin production-path pub | server.js one-shot route, buildManualPhotoFromAsset, legacy publish/photo photoId propagation | admin-test (one-shot valid/invalid, asset validation, expiry boundary, frameId consistency) | NOT VERIFIED | NOT TESTED |
