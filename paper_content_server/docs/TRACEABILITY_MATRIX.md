# Requirements Traceability Matrix

| Requirement | Target Module | Automated Test | Production Verification | ESP32/User Verification | Status |
|---|---|---|---|---|---|
| MQTT immediate refresh | mqtt/notifier.js | — | MQTT broker + HTTP smoke | Required | Planned |
| 60s polling fallback | firmware + poll loop | — | broker offline smoke | Required | Existing/Verify |
| Night image hold | schedule/resolver.js | schedule contract | state slot check | Optional | Existing/Verify |
| AUTO mode | operating-mode service | mode contract | live state | Required | Planned |
| ONE_SHOT expiry (HH:00/HH:30) | operating-mode service | boundary test | publish + verify revert | Required | Planned |
| FOCUS_LOCK | operating-mode service | lock test | admin live | Required | Planned |
| Learning auto fetch | library/learning/source-adapters | adapter test | live candidate smoke | Visual review | Planned |
| Learning rights gate | library/learning/rights-gate.js | rights test | candidate audit | Review | Planned |
| Learning relevance gate | library/learning/relevance-gate.js | relevance test | production audit | Visual review | Planned |
| Learning technical quality | library/learning/technical-quality.js | — | decode validation | N/A | Planned |
| Learning rotation | library/learning/rotation.js | rotation contract | multi-slot test | Visual review | Planned |
| Custom upload | library/custom/upload-service.js | upload integration | NAS upload smoke | Required | Planned |
| Custom metadata | library/custom/custom-repository.js | — | metadata edit test | Required | Planned |
| Custom album/tag | library/custom/album-service.js | album test | smoke | Required | Planned |
| Learning source selection | library/shared/source-selector.js | selector contract | state test | Required | Planned |
| Custom source selection | library/shared/source-selector.js | selector contract | state test | Required | Planned |
| No silent cross-library fallback | library/shared/source-selector.js | isolation test | live smoke | Required | Planned |
| Strict NSFW deletion | safety/delete-unsafe.js | deletion contract | file/reference audit | Required | Planned |
| Single render | render/single-renderer.js | renderer test | preview smoke | Required | Planned |
| Analysis card | render/analysis-card-renderer.js | renderer test | preview smoke | Required | Planned |
| Comparison pair (studySetId + pairRole) | render/comparison-renderer.js | pair integrity test | preview smoke | Required | Planned |
| 2x2 sequence (sequenceIndex 1-4) | render/sequence-grid-renderer.js | ordering test | preview smoke | Required | Planned |
| 6 unique news (URL, articleId, title) | news/ news-service.js | news contract | /api/news.json | Required | Planned |
| Translation semantic fidelity (subject, action, negation, numbers, entities) | news/translation/fidelity.js (does NOT exist — target only) | fidelity test (none — no real algorithm) | original-final audit | User sample review | NOT_IMPLEMENTED |
| Translation provider integration (OpenAI/DeepL/Gemini HTTP call) | src/news/translation-gate.js | translate() is a stub returning null | N/A — no real HTTP call made at runtime | N/A | NOT_IMPLEMENTED |
| Translation format gate (length, period, hanging-end, CJK presence, HTML residue, photo-credit) | server.js (isTextSemanticallyComplete / rewriteNewsTitle / rewriteNewsSummary / normalizeEntitiesAndAcronyms / evaluateNewsItemQuality) | translation-quality-test 31/31 (helper path) | N/A | N/A | IMPLEMENTED_NOT_PRODUCTION_VERIFIED |
| Final dedupe (canonical URL, article ID, original title, final title) | news/final-dedupe.js | dedupe contract | live smoke | N/A | Planned |
| Title one line | render/news-layout.js | layout contract | debug layout | Required | Planned |
| Summary 2-3 lines | render/news-layout.js | layout contract | debug layout | Required | Planned |
| Last-good (6 valid only) | news/last-good.js | fallback contract | feed failure smoke | Optional | Planned |
| EPF1 (header=10, payload=192000, total=192010) | epaper/epf1.js | frame contract | frame smoke | Required | Existing/Verify |
| State-frame coherence (frameId == X-Frame-Id) | snapshot/snapshot-service.js | coherence contract | HTTP smoke | Required | Existing/Verify |
| Pin TTL (29s hit, 31s miss) | snapshot/pin-store.js | pin contract | smoke | N/A | Existing/Verify |
| ESP32 frame validation (short, oversize, wrong ID, code4) | firmware + epaper/validator | frame contract | serial audit | Required | Existing/Verify |
| Admin publication (production-path render, validate, snapshot) | admin/admin-service.js | admin contract | admin publish + smoke | Required | Planned |
| Rollback (restore real snapshot) | publication/publication-service.js | rollback contract | admin live | Required | Planned |
| Lifecycle graceful shutdown (shared shutdown promise, MQTT disconnect awaited, timeout rejects) | src/app/bootstrap.js + server.js | lifecycle:test (graceful-shutdown-test.js) | NAS shutdown smoke | N/A | Implemented/Verify |
| Admin config centralization (load-config owns admin, no direct env reads in server.js) | src/config/load-config.js | admin-config-validation-test.js | config audit | N/A | Implemented/Verify |
