# Prelaunch Phase 1 Review Fix Report

## Baseline
- **Branch**: `refactor/prelaunch-core-firmware-phase1`
- **Target Commit**: `d926cab6055534f5fa0fabe25cd75ac8b3851418`

## Working Branch
- **Branch Name**: `fix/prelaunch-phase1-independent-review`
- **Base Commit**: `d926cab6055534f5fa0fabe25cd75ac8b3851418`

## Files Changed
- `NewsPhoto_esp32wf/NewsPhoto_esp32wf.ino`
- `paper_content_server/docs/FIRMWARE_DEPENDENCIES.md`
- `paper_content_server/src/publication/epf1-contract.js`
- `paper_content_server/src/epaper/frame-validator.js`
- `paper_content_server/src/snapshot/snapshot-model.js`
- `paper_content_server/src/snapshot/snapshot-store.js`
- `paper_content_server/src/app/readiness-evaluator.js`
- `paper_content_server/src/app/compose-services.js`
- `paper_content_server/src/app/bootstrap.js`
- `paper_content_server/src/app-factory.js`
- `paper_content_server/server.js`
- `paper_content_server/test/r12/mqtt-frame-sha256-test.js`
- `paper_content_server/PRELAUNCH_PHASE_1_REVIEW_FIX_REPORT.md`

## Fix Details by Defect (RF-01 to RF-12)
- **RF-01**: Renamed `flags` to `version` in `NewsPhoto_esp32wf.ino`. Enforced `version == 1` check. Rejects any other version with `EPF1_VERSION_UNSUPPORTED` error log without displaying or updating `lastFrameId`.
- **RF-02**: Enforced strict stream length check in `NewsPhoto_esp32wf.ino`. Checks for extra trailing bytes after payload read (`stream->available() > 0`) and rejects with `EPF1_TRAILING_BYTES` error without displaying.
- **RF-03**: Removed unused legacy `sha256Hex()` helper function in `NewsPhoto_esp32wf.ino`.
- **RF-04**: Added `clearPendingMqttNotification()` to clean all four MQTT pending variables (`publicationPending`, `pendingFrameId`, `pendingSnapshotId`, `pendingFrameSha256`). Added 5-second `mqttRetryMs` backoff timer on `fetchState()` or Wi-Fi failures to eliminate 50ms tight retry loops.
- **RF-05**: Updated `snapshot-model.js` `createSnapshot()` to enforce `epf1Contract.validateEpf1Frame(frame)` and use `epf1Contract.computeEpf1FrameSha256(frame)`. Updated `snapshot-store.js` read-back verification to use `epf1Contract`.
- **RF-06**: Cleaned up `epf1-contract.js` and `frame-validator.js` dependencies. Removed unused `epf1` require in `epf1-contract.js`. Updated `frame-validator.js` to depend strictly on `epf1-contract.js` and `palette.js` without circular dependencies.
- **RF-07**: Removed second `DeviceRegistryService` instantiation in `server.js`. `server.js` now uses `boot.services.deviceRegistryService` composed once via `bootstrap()`.
- **RF-08**: Updated `compose-services.js` DeviceRegistry defaults to fail closed (`provisioningEnabled = false`, `provisioningToken = null` when configuration is missing).
- **RF-09**: Refactored `app-factory.js` to consume core services (`adminStateService`, `newsTitleService`, `safeImagePath`, `imageRasterizer`, `imageRecipeService`, `deviceRegistryService`) directly from `boot.services`. Removed duplicate business service creation and ad-hoc `process.env` debug logic.
- **RF-10**: Moved instantiation of `adminStateService`, `newsTitleService`, `safeImagePath`, `imageRasterizer`, and `imageRecipeService` into `compose-services.js` and passed them via `boot.services`. `server.js` assigns services from `boot.services`.
- **RF-11**: Updated `readiness-evaluator.js` to fail closed with `BOOTSTRAP_UNAVAILABLE` when `boot` is null/missing or `boot.getState()` is invalid.
- **RF-12**: Rewrote `test/r12/mqtt-frame-sha256-test.js` to import real production modules (`epf1-contract`, `snapshot-model`). Removed payload-only assertions and tautologies. Added tests for full-frame SHA, payload-only SHA mismatch, invalid version, truncated frame, wrong length frame, invalid magic, and snapshot boundary enforcement.

## Hardware Target Investigation Result
- Checked host environment and workspace files (`README_CN.md` vs `FIRMWARE_DEPENDENCIES.md`).
- Code and pin map specify `ESP32-S3` with pins (BUSY=7, RST=8, DC=9, CS=10, DIN=11, SCLK=13).
- `preferences.txt` and `.vscode/arduino.json` do not exist on host.
- Exact board FQBN, Flash size, PSRAM, and partition scheme require physical hardware confirmation.
- `FIRMWARE_DEPENDENCIES.md` updated to remove unverified `ESP32 Dev Module` claims.

## Basic Syntax Commands Executed
- `node --check paper_content_server/src/publication/epf1-contract.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/epaper/frame-validator.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/snapshot/snapshot-model.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/snapshot/snapshot-store.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/app/readiness-evaluator.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/app/compose-services.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/app/bootstrap.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/app-factory.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/server.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/test/r12/mqtt-frame-sha256-test.js` (`EXIT_CODE=0`)

## Commands Not Executed
- `npm test`
- `npm run test:all`
- Full test suites or mutation tests (per instructions, executor does not perform final verification)
- Firmware compilation via `arduino-cli` / `pio`

## Commits
1. `fix(protocol): enforce EPF1 contract at snapshot and publication boundaries`
2. `fix(firmware): reject unsupported versions and trailing response bytes`
3. `fix(firmware): normalize pending retry and SHA cleanup state`
4. `refactor(app): remove duplicate production service construction`
5. `refactor(test-app): consume the production service graph`
6. `fix(readiness): fail closed when bootstrap is unavailable`
7. `test(protocol): replace payload-only and tautological SHA tests`
8. `docs(firmware): remove unresolved board target claims`
9. `docs: record independent review fix implementation`

---
FINAL TESTING NOT PERFORMED BY EXECUTOR
INDEPENDENT SUPERVISOR REVIEW REQUIRED
FIRMWARE TARGET REMAINS UNRESOLVED
