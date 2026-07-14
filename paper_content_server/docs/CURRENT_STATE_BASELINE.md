# 当前状态基线

> 本文件用于记录“当前真实状态”，不是目标架构。每个阶段完成后更新一次。

AUDITED_CODE_SHA=PENDING_INTEGRATION
ESP32_RUNTIME_STATUS=RUNNING (WiFi connected, frame displayed, 60s polling, frameId skip)
NAS_PRODUCTION_PORT=8787 (direct container, ESP32 connects here)
NAS_STAGING_PORT=18080 (host 18080 → container 8787, staging/preview)
REAL_CJK_MODULE=IMPLEMENTED
REAL_CJK_GLYPH_RENDER=IMPLEMENTED_NOT_PRODUCTION_VERIFIED
ORCHESTRATOR_SHADOW=IMPLEMENTED
ORCHESTRATOR_PRODUCTION_SWITCH=NOT_IMPLEMENTED
REAL_CLASSIFIER=BLOCKED
OVERRIDE_CONCURRENCY_SAFE=YES
NAS_DYNAMIC_ACCEPTANCE=PARTIAL (8787 running, frame valid, but /api/build=404, SHA unverified)
ESP32_DYNAMIC_ACCEPTANCE=PARTIAL (WiFi+display+polling verified, MQTT not connected, 2h run not tested)

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
| News translation fidelity | NOT_IMPLEMENTED | | See TRANSLATION_PROVIDER_INTEGRATION / TRANSLATION_FORMAT_GATE / TRANSLATION_SEMANTIC_FIDELITY split below | | |
| News final dedupe | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | | | |
| News layout | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | | | |
| Last-good | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | | | |
| Learning Library auto-fetch | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Wikimedia source adapter + HTTPS-only downloader (size/redirect/timeout guards) + scheduler with classifierReady gate + ingestion service (enabled guard, fail-closed decode); wired behind learningLibraryEnabled flag. Scheduler does NOT start when classifier not ready (zero network requests). | NOT TESTED | N/A |
| Learning relevance gate | PARTIAL | | PARTIAL: learning-policy.js has computeTopicScore() and computeQualityScore() but NO computeKeywordScore() — `keywords` field is declared (L6) but never read. Default config has topics=[] so computeTopicScore returns 1 unconditionally, bypassing topic filtering entirely. qualityThreshold defaults to 2 (enforced). Effective production policy = license check + quality score check only; topic/keyword relevance NOT enforced when no topics configured. Production seed data cleaned (Hyatt image moved to test/fixtures/learning/). | NOT VERIFIED | N/A |
| Custom Library | BLOCKED | | Streaming upload (octet-stream → processUploadStream → quarantine → sharp decode → MIME mismatch → SHA256 → safety gate → dedup → atomic move) fully wired, but classifier has no real model → fail-closed (CLASSIFIER_UNAVAILABLE). Upload cannot ACCEPT until a real NSFW model is configured. Gated by customLibraryEnabled + classifierReady. | NOT TESTED | N/A |
| Strict NSFW deletion | NOT_IMPLEMENTED | | No real NSFW classifier model. safety-classifier-port fail-closed (configured=false, ready=false). AssetDeleteService atomic DELETE chain (HTTP route → feature flag check → AssetDeleteService.deleteAsset → findReferences → markBlocked → tombstone write → cleanup → audit → markTombstoned, reason enum UNSAFE/SUSPICIOUS/POLICY_BLOCKED, fail-closed: no swallow) is IMPLEMENTED but cannot make a real deletion decision without a classifier. | NOT TESTED | N/A |
| Analysis Card | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Real EPF1 rasterizer (5x7 ASCII bitmap font + real CJK glyphs via sharp SVG text / font-detector) producing 192010-byte frames; gated by renderShadowEnabled | NOT TESTED | N/A |
| Comparison Pair | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Real EPF1 rasterizer (sharp decode + quantize) producing 192010-byte frames; gated by renderShadowEnabled | NOT TESTED | N/A |
| Sequence 2×2 | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Real EPF1 rasterizer producing 192010-byte frames; gated by renderShadowEnabled | NOT TESTED | N/A |
| ONE_SHOT_OVERRIDE | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Route uses assetSelectionService.selectForOneShot() for strict explicit asset selection (no fallback); override persisted via overridePersistence.saveOverride() with restart validation (validateOverrideAsync re-checks asset safety/selectability/file existence; cleared if invalid, no silent swap) | NOT TESTED | NOT TESTED |
| FOCUS_LOCK | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | Route uses assetSelectionService.selectForFocusLock() for strict theme/albumId matching (404 on no match, no schedule fallback); override persisted + restart-validated same as ONE_SHOT | NOT TESTED | NOT TESTED |
| MQTT immediate refresh | IMPLEMENTED_NOT_PRODUCTION_VERIFIED | | mqtt-message-test 16/16 covers schemaVersion=2 + reason field + v1 backward compat; mqtt-publisher/notification-adapter wiring present | NOT VERIFIED | NOT TESTED |
| Admin production-path publication | PARTIAL | | admin-test covers one-shot photo valid/invalid assetId, expiry, frameId consistency, legacy publish/photo photoId propagation. MQTT reason 字段贯穿 snapshot-model → publication-service → mqtt-publisher. | NOT VERIFIED | NOT TESTED |

### Translation Fidelity (split)

The monolithic "News translation fidelity" status is split into three orthogonal layers. The previous single-row "IMPLEMENTED_NOT_PRODUCTION_VERIFIED" was misleading because it conflated provider integration, format gating, and semantic fidelity.

- `TRANSLATION_PROVIDER_INTEGRATION=NOT_IMPLEMENTED`
  - `src/news/translation-gate.js` is a stub: `translate()` always returns `Promise.resolve(null)` — no real OpenAI / DeepL / Gemini call is made at runtime. Provider selection is wired through config but the actual provider HTTP call has never been implemented.
- `TRANSLATION_FORMAT_GATE=IMPLEMENTED_NOT_PRODUCTION_VERIFIED`
  - `server.js` exports `isTextSemanticallyComplete`, `rewriteNewsTitle`, `rewriteNewsSummary`, `normalizeEntitiesAndAcronyms`, `evaluateNewsItemQuality`, `PROTECTED_ENTITIES`.
  - These functions enforce: title/summary non-empty, translated text contains Chinese characters, no hanging ends, no HTML residue, no photo-credit residue, sentence-ending punctuation, protected entities (OpenAI/ChatGPT/NATO/GDP/CEO) preserved.
  - Covered by `translation-quality-test.js` (31/31 pass on the helper path).
  - These are **format gates**, not semantic fidelity: they verify shape, not meaning.
- `TRANSLATION_SEMANTIC_FIDELITY=NOT_IMPLEMENTED`
  - No `src/news/translation/fidelity.js` file exists (referenced in SYSTEM_ARCHITECTURE.md and TRACEABILITY_MATRIX.md as a target, not as a real module).
  - No original-vs-translation semantic comparison algorithm.
  - No subject / action / negation / numbers / entities alignment test.
  - Cannot be claimed as PASS until a real fidelity algorithm + test exists.

**None of the following may be reported as "translation fidelity" alone:** length checks, period presence, hanging-end detection, numeric presence, Chinese-character presence, HTML residue, photo-credit residue. They are format gates.

### Render Fidelity (Text)

ASCII_TEXT_RENDER=IMPLEMENTED
CJK_PLACEHOLDER=IMPLEMENTED
REAL_CJK_MODULE=IMPLEMENTED
REAL_CJK_GLYPH_RENDER=IMPLEMENTED_NOT_PRODUCTION_VERIFIED

当前文字渲染器 (`src/render/text-rasterizer.js`) 使用内置 5x7 bitmap font 处理 ASCII 字母/数字/基本标点。CJK 字符通过 sharp SVG text 管线 (librsvg + pango + harfbuzz + freetype) 渲染真实字形 — `font-detector.js` 在模块加载时自动探测系统 CJK 字体 (Windows: Microsoft YaHei; Linux: Noto Sans CJK / Source Han Sans; macOS: PingFang SC)，`renderTextAsync` 将含 CJK 的文本路由到 sharp SVG 渲染器并将 alpha 像素 blit 到 EPF1 codes 数组。`CJK_PLACEHOLDER` 路径 (`renderCJKPlaceholder`) 仍保留作为 ASCII 同步路径的回退，但 `renderTextAsync` 不再静默回退到占位方块 — 无可用字体时返回 0 行。

> REAL_CJK_MODULE=IMPLEMENTED 表示 CJK 渲染模块本身（text-rasterizer + font-detector + sharp SVG 管线）已实现并通过单元/golden 测试（cjk-glyph-test）。
> REAL_CJK_GLYPH_RENDER=IMPLEMENTED_NOT_PRODUCTION_VERIFIED — 渲染实现已完成，但尚未在真机 ESP32-S3 + Spectra 6 面板上验证显示效果（NAS 端 EPF1 bytes 已生成，ESP32 真机刷新未测试）。

### Render Pipeline (Orchestrator Shadow)

ORCHESTRATOR_SHADOW=IMPLEMENTED
ORCHESTRATOR_PRODUCTION_SWITCH=NOT_IMPLEMENTED

`render-shadow.js` + `orchestrator-shadow-adapter.js` 实现了独立的 shadow 渲染管道：production 路径仍走 legacy-render-adapter，shadow 管道在 `renderShadowEnabled=true` 时并行运行（render-shadow-meaningful-test / shadow-independent-test 验证 shadow 与 legacy 输出可独立比较，shadow mismatch 不影响 production）。ORCHESTRATOR_PRODUCTION_SWITCH=NOT_IMPLEMENTED — orchestrator 尚未成为默认 production 路径，production 仍由 legacy-render-adapter 主导；切换需先完成 shadow↔legacy 长时间一致性验证 + 真机回归，目前未达成。

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
| News translation fidelity | server.js L1115-1185 (format gate only); src/news/translation-gate.js (stub) | TRANSLATION_PROVIDER_INTEGRATION=NOT_IMPLEMENTED (stub returns null); TRANSLATION_FORMAT_GATE=IMPLEMENTED_NOT_PRODUCTION_VERIFIED (translation-quality-test 31/31 on helper path — format gates only); TRANSLATION_SEMANTIC_FIDELITY=NOT_IMPLEMENTED (no fidelity.js, no original-vs-translation alignment) | NOT VERIFIED | NOT TESTED |
| News final dedupe | server.js L1462-1483 | news-render-readability-test | NOT VERIFIED | NOT TESTED |
| News layout | server.js L2106-2115 (layoutNewsCard) | news-render-readability-test 17/17 | NOT VERIFIED | NOT TESTED |
| Last-good | server.js L1542 | rotation-test Phase B/C | NOT VERIFIED | N/A |
| Learning Library auto-fetch | src/learning/learning-ingestion-service.js + wikimedia-source-adapter.js + learning-downloader.js + learning-scheduler.js + src/app/compose-services.js (classifierReady gate) | learning:test; v3:integration SECTION 2 (scheduler status=SAFETY_CLASSIFIER_NOT_READY when no model) | NOT TESTED | N/A |
| Learning relevance gate | src/learning/learning-policy.js (computeTopicScore, computeQualityScore; keywords declared but never read) | learning-policy-test; Production seed Hyatt image archived to test/fixtures/learning/hyatt-image.json (was in data/image_index.json — leaked via empty-topics bypass) | NOT VERIFIED | N/A |
| Custom Library | src/custom-library/custom-library-service.js (processUploadStream) + custom-file-store.js (createQuarantineWriteStream/streamDecode/streamSha256) + server.js /api/admin/library/custom/upload (octet-stream) + src/app/compose-services.js (config.safety passthrough) | custom-upload-security-test; v3:integration SECTION 2 (streaming upload → fail-closed CLASSIFIER_UNAVAILABLE when no model; 415 on wrong Content-Type) | NOT TESTED | N/A |
| Strict NSFW deletion | src/safety/safety-classifier-port.js + nsfw-safety-gate.js + src/assets/asset-delete-service.js (DELETE chain: HTTP route → feature flag check → AssetDeleteService.deleteAsset → findReferences → markBlocked → tombstone write → cleanup → audit → markTombstoned; reason enum UNSAFE/SUSPICIOUS/POLICY_BLOCKED; fail-closed: no swallow) + server.js DELETE route (atomic, no legacy fallback; 503 FEATURE_DISABLED when flag off) | safety-classifier-port-test; nsfw-safety-gate-test; asset-delete-service-test; v3:integration SECTION 2 (DELETE 400 no reason, 400 bad reason, 404 not found, 503 flag off) | NOT TESTED | N/A |
| Analysis Card | src/render/analysis-card-renderer.js (5x7 ASCII bitmap font + real CJK glyphs via sharp SVG text + font-detector) + src/render/legacy-shadow-adapter.js + orchestrator-shadow-adapter.js (independent shadow pipelines) | analysis-card-test; cjk-glyph-test; render-shadow-meaningful-test; v3:integration SECTION 4 (EPF1 192010 bytes) | NOT TESTED | N/A |
| Comparison Pair | src/render/comparison-pair-renderer.js (sharp decode + quantize) | comparison-pair-test; v3:integration SECTION 4 (EPF1 192010 bytes) | NOT TESTED | N/A |
| Sequence 2×2 | src/render/sequence-2x2-renderer.js | sequence-2x2-test; v3:integration SECTION 4 (EPF1 192010 bytes) | NOT TESTED | N/A |
| ONE_SHOT_OVERRIDE | src/admin/asset-selection-service.js + src/admin/override-persistence.js + server.js /api/admin/publish/one-shot + startup restore | asset-selection-service-test; v3:integration SECTION 3 (ONE_SHOT 200 + override file written + restart restored) + SECTION 6 (invalid override cleared on restart) | NOT TESTED | NOT TESTED |
| FOCUS_LOCK | src/admin/asset-selection-service.js + src/admin/override-persistence.js + server.js PUT/DELETE /api/admin/focus-lock | asset-selection-service-test; v3:integration SECTION 3 (FOCUS_LOCK 200 + override written + exit clears override) | NOT TESTED | NOT TESTED |
| MQTT immediate refresh | src/mqtt/mqtt-message.js (SCHEMA_VERSION=2, reason field) + mqtt-publisher + mqtt-notification-adapter + publication-service reason propagation | mqtt-message-test 16/16; r6 mqtt publisher/adapter tests | NOT VERIFIED | NOT TESTED |
| Admin production-path pub | server.js one-shot + focus-lock + library routes + buildManualPhotoFromAsset + reason propagation through snapshot-model.publishReason | admin-test (one-shot valid/invalid, asset validation, expiry boundary, frameId consistency, library CRUD) | NOT VERIFIED | NOT TESTED |
