# Prelaunch Phase 1 Review Round 4 Implementation Report

## Baseline
- **Branch**: `fix/prelaunch-phase1-review-round3`
- **Target Commit**: `817dc6e5e1ec98d33b5b6f1796f60e4ed0ae4cd0`

## Working Branch
- **Branch Name**: `fix/prelaunch-phase1-review-round4`
- **Base Commit**: `817dc6e5e1ec98d33b5b6f1796f60e4ed0ae4cd0`

## Actual Files Changed
- `NewsPhoto_esp32wf/firmware_core/time_utils.h`
- `NewsPhoto_esp32wf/firmware_core/frame_transport_policy.h`
- `NewsPhoto_esp32wf/firmware_core/mqtt_pending_state.h`
- `NewsPhoto_esp32wf/firmware_core/mqtt_pending_state.cpp`
- `NewsPhoto_esp32wf/NewsPhoto_esp32wf.ino`
- `paper_content_server/src/config/load-config.js`
- `paper_content_server/src/app/build-request-context.js`
- `paper_content_server/server.js`
- `paper_content_server/test/firmware-host/firmware_host_test.cpp`
- `paper_content_server/test/prelaunch/production-startup-smoke-test.js`
- `paper_content_server/scripts/run-prelaunch-tests.js`
- `paper_content_server/PRELAUNCH_PHASE_1_REVIEW_ROUND4_REPORT.md`

## Header Guard Repair
- Fixed double `#ifndef` guard lines in `NewsPhoto_esp32wf/firmware_core/time_utils.h` (`FIRMWARE_TIME_UTILS_H`) and `NewsPhoto_esp32wf/firmware_core/frame_transport_policy.h` (`FIRMWARE_FRAME_TRANSPORT_POLICY_H`).
- Verified all `firmware_core/*.h` header guards are single, unique, and support repetitive inclusion.

## Production Transport Integration
- Integrated `FrameTransport_Evaluate(&trParams)` into `fetchFrameAndDisplay()` in `NewsPhoto_esp32wf/NewsPhoto_esp32wf.ino`.
- `FrameTransport_Evaluate()` is the single authoritative decision maker for Content-Length (192010), exact byte count read, header fields (EPF1, width 800, height 480, panel 49, version 1), payload size, `streamHasExtraBytes`, `shaMatched`, and `displayOk`.
- Dual hand-written checks in `.ino` removed.

## MQTT State Authority
- `MqttPendingState mqttState` in `NewsPhoto_esp32wf.ino` is the single authoritative state object.
- Independent global shadow variables (`publicationPending`, `pendingFrameId`, `pendingSnapshotId`, `pendingFrameSha256`, `mqttRetryMs`) removed.
- `MqttPendingState_Clear()` resets `mqttRetryMs = 0`.
- `MqttPendingState_SetPending()` resets `mqttRetryMs = 0` (does not inherit previous backoff), validates ID and SHA lengths/formats, and returns `false` on invalid input.

## Production Runtime Binding
- `server.js` binds `Object.assign(runtime, boot.context)` directly after `R1_bootstrap()`.
- Undefined variable override `ADM_ALLOWED_CIDRS` removed; config flows via `boot.config.admin`.

## Canonical Application Context
- `server.js` `createApplication(options)` throws `CANONICAL_CONTEXT_REQUIRED` if `options.context` is missing. No fallback context objects created.

## Production Startup Smoke Test
- Created `paper_content_server/test/prelaunch/production-startup-smoke-test.js`.
- Exported `createProductionBoot(options)` in `server.js`.
- Smoke test verifies production composition pathway (`listen: false`), context parity, non-null services, and `createApplication` context enforcement.

## Configuration Source
- Added `config.news = { refreshMinutes: ... }` in `paper_content_server/src/config/load-config.js`.
- `build-request-context.js` derives `NEWS_REFRESH_MINUTES`, `TIMEZONE`, and `admin` settings using explicit `!== undefined` options checks to preserve falsy inputs without fallback collisions.

## Firmware Host Tests
- Updated `paper_content_server/test/firmware-host/firmware_host_test.cpp` to include headers twice (verifying header guards).
- Tested `MqttPendingState_SetPending` length/format validations and retry deadline resets.

## Main Test Chain
- Added `production-startup-smoke-test.js` into `scripts/run-prelaunch-tests.js`.
- `npm run test:prelaunch` executes all 4 Node prelaunch tests and attempts host C++ compilation.

## Basic Development Commands
- `node --check paper_content_server/src/config/load-config.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/app/build-request-context.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/server.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/test/prelaunch/composition-parity-test.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/test/prelaunch/production-startup-smoke-test.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/scripts/run-prelaunch-tests.js` (`EXIT_CODE=0`)
- `node paper_content_server/test/prelaunch/production-startup-smoke-test.js` (`EXIT_CODE=0`)
- `node paper_content_server/test/prelaunch/composition-parity-test.js` (`EXIT_CODE=0`)

## Tests Explicitly Not Performed
- Full `npm test` or `npm run test:all` suite execution.
- ESP32 hardware flashing or toolchain compilation.

## Firmware Target Status
- Status: `FIRMWARE_TARGET_UNRESOLVED`
- ESP32 board parameters require physical hardware evidence.

## Actual Implementation Commits
- `e5adaa0` `fix(firmware): repair host helper header guards`
- `e22c3e8` `refactor(firmware): use transport policy in the production download path`
- `db69266` `fix(config): source runtime context values from loaded configuration`
- `463ba60` `fix(server): bind production runtime to the canonical boot context`
- `c4d88c1` `test(prelaunch): exercise production startup and firmware helpers`

## Remaining Blockers
- `FIRMWARE_TARGET_UNRESOLVED`: Physical ESP32 parameters require hardware evidence.

---
REPORT_COMMIT_SHA_RECORDED_IN_FINAL_TERMINAL_OUTPUT

FINAL TESTING NOT PERFORMED BY EXECUTOR
INDEPENDENT SUPERVISOR REVIEW REQUIRED
FIRMWARE TARGET REMAINS UNRESOLVED
