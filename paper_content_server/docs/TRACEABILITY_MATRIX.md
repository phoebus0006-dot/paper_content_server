# Requirements Traceability Matrix

| Requirement | Code Module | Automated Test | Production Verification | ESP32 Visual |
| Requirement | Code Module | Automated Test | Production Verification | ESP32 Visual |
|------------|-------------|---------------|----------------------|--------------|
| Dual library architecture | library modules (learning + custom) | — | Upload + auto-fetch → display | NOT VERIFIED |
| Automatic learning fetch | learning source adapters | adapter test | Live candidate smoke | NOT VERIFIED |
| Learning relevance gate | relevance service | relevance contract | Production audit | NOT VERIFIED |
| Custom upload | custom upload service | integration test | NAS upload smoke | NOT VERIFIED |
| Display source: learning | selector | contract test | HTTP state test | NOT VERIFIED |
| Display source: custom | selector | contract test | HTTP state test | NOT VERIFIED |
| Strict NSFW delete | safety/delete service | deletion contract | Audit | NOT VERIFIED |
| Analysis card | renderer | — | State → render → verify | NOT VERIFIED |
| Comparison pair | selector + renderer | — | Upload pair → display | NOT VERIFIED |
| 2x2 sequence | selector + renderer | — | Upload sequence → display | NOT VERIFIED |
| MQTT immediate refresh | admin routes + MQTT | — | State change → MQTT publish | NOT VERIFIED |
| 60s poll fallback | ESP32 firmware | — | Device polls every 60s | NOT VERIFIED |
| Night hold (19:00-10:00) | schedule resolver | A-schedule-contract | curl /api/state.json | NOT VERIFIED |
| One-shot override | admin routes + override store | admin-test | Publish → state change | NOT VERIFIED |
| Focus lock | override store | — | Admin → lock → verify | NOT VERIFIED |
| NSFW deletion | safety + library | — | Upload → scan → verify deleted | N/A |
| Comparison pair | selector + renderer | — | Label pair → display | NOT VERIFIED |
| 2x2 sequence | selector + renderer | — | Upload sequence → display | NOT VERIFIED |
| 6 unique news | news pipeline | E-news-contract | curl /api/news.json | NOT VERIFIED |
| Translation fidelity | translation pipeline | translation-quality-test | Audit translation output | N/A |
| Title 1 line | layoutNewsCard | F-news-render-contract | curl frame → inspect | NOT VERIFIED |
| Summary 2-3 lines | layoutNewsCard | F-news-render-contract | curl frame → inspect | NOT VERIFIED |
| EPF1 format | buildFrameBuffer | B-epf1-contract | curl frame → hexdump | N/A |
| State/frame coherence | snapshot + pin | C-state-frame-contract | State/frame curl | NOT VERIFIED |
| Code 4 = 0 | quantizer | B-epf1-contract, restart-test | Scan frame.bin | N/A |
| Frame size 192010 | buildFrameBuffer | B-epf1-contract | curl frame → wc -c | N/A |
| Restart recovery | frame cache + JSON store | restart-test | Docker restart → verify | NOT VERIFIED |
| Photo safety gate | selector | G-photo-contract, photo-safety-test | — | N/A |
| Admin publication | admin routes | admin-test | Admin publish → state | NOT VERIFIED |


## Updated Requirements (Dual Library Architecture)

| Requirement | Code Module | Test | Verification | ESP32 |
|------------|-------------|------|-------------|-------|
| Automatic Learning Fetch | learning source adapters | adapter test | live candidate smoke | visual review |
| Learning Relevance Gate | relevance service | relevance contract | production audit | visual review |
| Custom Upload | custom upload service | integration test | NAS upload smoke | screen validation |
| Display Source Learning | selector | contract test | HTTP state test | screen validation |
| Display Source Custom | selector | contract test | HTTP state test | screen validation |
| Strict NSFW Delete | safety/delete service | deletion contract | audit | screen validation |
| Analysis Card | renderer | — | state → render | visual review |
| Comparison Pair | renderer | — | upload pair → display | visual review |
| Sequence 2x2 | renderer | — | upload sequence → display | visual review |
