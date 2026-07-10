# Requirements Traceability Matrix

| Requirement | Target Module | Automated Test | Production Verification | Visual Verification | Status |
|------------|--------------|---------------|----------------------|-------------------|--------|
| MQTT immediate refresh | admin routes + MQTT | — | State change → MQTT publish | NOT VERIFIED | DEFINED |
| 60s polling fallback | ESP32 firmware | — | Device polls every 60s | NOT VERIFIED | DEFINED |
| Night image hold (19:00-10:00) | schedule resolver | A-schedule-contract | curl /api/state.json | NOT VERIFIED | DEFINED |
| AUTO mode | schedule + snapshot | A-schedule-contract | State matches schedule | NOT VERIFIED | DEFINED |
| ONE_SHOT expiry (HH:00/HH:30) | publication service | — | Publish → verify revert | NOT VERIFIED | DEFINED |
| FOCUS_LOCK | override store + focus service | — | Admin lock → verify state | NOT VERIFIED | DEFINED |
| Learning Library auto fetch | learning source adapters | adapter test | Live candidate smoke | VISUAL REVIEW | DEFINED |
| Learning relevance gate | relevance service | relevance contract | Production audit | VISUAL REVIEW | DEFINED |
| Learning rights gate | rights service | — | Rights metadata validation | N/A | DEFINED |
| Learning technical quality | technical quality service | — | Decode validation | N/A | DEFINED |
| Custom upload | custom upload service | integration test | NAS upload smoke | SCREEN | DEFINED |
| Learning source selection | source-selector | contract test | HTTP state test | SCREEN | DEFINED |
| Custom source selection | source-selector | contract test | HTTP state test | SCREEN | DEFINED |
| No silent cross-library fallback | source-selector | isolation contract | Audit state.json | SCREEN | DEFINED |
| NSFW strict delete (both libs) | safety/delete service | deletion contract | Audit filesystem | SCREEN | DEFINED |
| Single image render | render/single-renderer | — | Frame.bin verify | VISUAL REVIEW | DEFINED |
| Analysis card render | render/analysis-card-renderer | — | Frame.bin verify | VISUAL REVIEW | DEFINED |
| Comparison pair render | render/comparison-renderer | — | Upload pair → display | VISUAL REVIEW | DEFINED |
| 2x2 sequence render | render/sequence-grid-renderer | — | Upload sequence → display | VISUAL REVIEW | DEFINED |
| 6 unique news | news pipeline | E-news-contract | curl /api/news.json | NOT VERIFIED | DEFINED |
| Translation fidelity | translation pipeline | translation-quality-test | Audit translation output | N/A | DEFINED |
| Title one line | layoutNewsCard | F-news-render-contract | curl frame → inspect | NOT VERIFIED | DEFINED |
| Summary two or three lines | layoutNewsCard | F-news-render-contract | curl frame → inspect | NOT VERIFIED | DEFINED |
| Last-good news | last-good-store | rotation-test | Feed fail → verify | N/A | DEFINED |
| EPF1 format | buildFrameBuffer | B-epf1-contract | curl frame → hexdump | N/A | DEFINED |
| State/frame coherence | snapshot + pin | C-state-frame-contract | State/frame curl match | NOT VERIFIED | DEFINED |
| Code 4 = 0 | quantizer | B-epf1-contract, restart-test | Scan frame.bin | N/A | DEFINED |
| Frame size 192010 | buildFrameBuffer | B-epf1-contract | curl frame → wc -c | N/A | DEFINED |
| Restart recovery | frame cache + JSON store | restart-test | Docker restart → verify | NOT VERIFIED | DEFINED |
| Admin publication | admin routes | admin-test | Admin publish → state | NOT VERIFIED | DEFINED |
