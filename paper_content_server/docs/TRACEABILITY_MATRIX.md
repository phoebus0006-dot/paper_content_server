# Requirements Traceability Matrix

| Requirement | Code Module | Automated Test | Production Verification | ESP32 Visual |
|------------|-------------|---------------|----------------------|--------------|
| MQTT immediate refresh | admin routes + MQTT | — | State change → MQTT publish | NOT VERIFIED |
| 60s poll fallback | ESP32 firmware | — | Device polls every 60s | NOT VERIFIED |
| Night hold (19:00-10:00) | schedule resolver + server.js | A-schedule-contract | curl /api/state.json | NOT VERIFIED |
| One-shot override | admin routes + override store | admin-test | Publish → state change | NOT VERIFIED |
| Focus lock | override store | — | Admin → lock → verify | NOT VERIFIED |
| NSFW deletion | safety + library | — | Upload → scan → verify deleted | N/A |
| Custom library only | image index + fetch-images | — | Upload → approve → display | NOT VERIFIED |
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
