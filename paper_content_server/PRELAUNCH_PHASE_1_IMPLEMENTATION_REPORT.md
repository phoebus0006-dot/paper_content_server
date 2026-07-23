# Prelaunch Phase 1 Implementation Report

## Baseline
- **Branch**: `fix/master-production-p0-baseline`
- **Correct Target Commit**: `f234b036f4cefd031c4c987f7abb7ad50d91c5e6`

## Working Branch
- **Branch Name**: `refactor/prelaunch-core-firmware-phase1`
- **Base Commit**: `f234b036f4cefd031c4c987f7abb7ad50d91c5e6`

## Files Changed
- `paper_content_server/src/publication/epf1-contract.js` [NEW]
- `paper_content_server/src/epaper/epf1.js` [MODIFY]
- `paper_content_server/test/fixtures/epf1/valid-frame.epf1` [NEW]
- `paper_content_server/test/fixtures/epf1/valid-frame.metadata.json` [NEW]
- `paper_content_server/test/fixtures/epf1/invalid-magic.epf1` [NEW]
- `paper_content_server/test/fixtures/epf1/truncated-frame.epf1` [NEW]
- `paper_content_server/test/fixtures/epf1/wrong-length.epf1` [NEW]
- `paper_content_server/test/fixtures/epf1/sha-mismatch.metadata.json` [NEW]
- `NewsPhoto_esp32wf/NewsPhoto_esp32wf.ino` [MODIFY]
- `paper_content_server/src/app/readiness-evaluator.js` [NEW]
- `paper_content_server/src/app/compose-services.js` [MODIFY]
- `paper_content_server/src/app/bootstrap.js` [MODIFY]
- `paper_content_server/src/app-factory.js` [MODIFY]
- `paper_content_server/server.js` [MODIFY]
- `paper_content_server/Dockerfile` [MODIFY]
- `paper_content_server/PRELAUNCH_PHASE_1_IMPLEMENTATION_REPORT.md` [NEW]

## EPF1 Contract Implementation
- Created authoritative protocol module `src/publication/epf1-contract.js`.
- Fixed constants: Magic (`EPF1`), Header (10 bytes), Width (800), Height (480), Panel (49), Version (1), Payload (192000 bytes), Total Frame (192010 bytes).
- Standardized `computeEpf1FrameSha256` to calculate SHA256 over the complete 192010-byte EPF1 frame (header + payload).
- Created deterministic protocol fixtures in `test/fixtures/epf1/`.

## Firmware Changes
- Updated `NewsPhoto_esp32wf.ino`:
  - Cold boot (`refreshOnce`) validates `state.frameSha256` (must be non-empty 64-character valid hex) and verifies download against `expectedSha`.
  - MQTT notification (`handleMqttNotification`) verifies `pendingFrameId` and `pendingFrameSha256` against server state (`fetchState`), rejecting stale notifications or SHA mismatches.
  - Download & SHA computation (`fetchFrameAndDisplay`) uses streamed mbedTLS SHA256 over the full 192010-byte frame (`header` + `frame`). All mbedTLS returns checked, context freed on all exit paths, fail closed.
  - Length and stream read strict validation enforced (exact 192010 bytes required).

## Firmware Target Information
- Target device referenced in `NewsPhoto_esp32wf/README_CN.md` is `ESP32-S3`.
- `paper_content_server/docs/FIRMWARE_DEPENDENCIES.md` mentions `ESP32 Dev Module`.

## Firmware Build Configuration Added
- No guessed `arduino-cli` or `PlatformIO` config files were added to avoid unverified target board guessing.
- `FIRMWARE_TARGET_UNRESOLVED` recorded as firmware build configuration status.

## Composition Root Changes
- Unified server composition root via `src/app/bootstrap.js`.
- Created `src/app/readiness-evaluator.js` as single source of truth for readiness evaluation.
- Updated `compose-services.js` and `bootstrap.js` to construct and export `deviceRegistryService`.
- Refactored `src/app-factory.js` to build service context by delegating to `bootstrap()`.

## Health Endpoint Changes
- Updated `/health/ready` and `/api/health.json` in `server.js` to delegate to `evaluateReadiness`.
- When blockers exist, `/api/health.json` returns HTTP 503 with `status: "not_ready"`.
- Updated `Dockerfile` HEALTHCHECK to target `http://localhost:8787/health/ready`.

## Basic Syntax or Build Commands Executed
- `node --check paper_content_server/src/publication/epf1-contract.js` (EXIT_CODE=0)
- `node --check paper_content_server/src/epaper/epf1.js` (EXIT_CODE=0)
- `node --check paper_content_server/src/app/readiness-evaluator.js` (EXIT_CODE=0)
- `node --check paper_content_server/src/app/compose-services.js` (EXIT_CODE=0)
- `node --check paper_content_server/src/app/bootstrap.js` (EXIT_CODE=0)
- `node --check paper_content_server/src/app-factory.js` (EXIT_CODE=0)
- `node --check paper_content_server/server.js` (EXIT_CODE=0)

## Commands Not Executed
- `npm test`
- `npm run test:all`
- Firmware compilation via `arduino-cli` / `pio` (toolchain not installed on host)

## Commits
1. `fix(protocol): unify full-frame EPF1 SHA contract`
2. `fix(firmware): fail closed on frame integrity and stale notifications`
3. `refactor(app): converge production and test composition roots`
4. `fix(health): use unified readiness in runtime health endpoints`
5. `docs: record phase 1 implementation facts`

## Unresolved Implementation Blockers
- **FIRMWARE_TARGET_UNRESOLVED**: Firmware board target and reproducible compilation toolchain must be resolved by supervisor on host with `arduino-cli` / `pio` installed.

---
FINAL TESTING NOT PERFORMED BY EXECUTOR
FINAL REVIEW PENDING INDEPENDENT SUPERVISOR TESTING
