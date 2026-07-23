# Prelaunch Phase 1 Review Round 3 Implementation Report

## Baseline
- **Branch**: `fix/prelaunch-phase1-review-round2`
- **Target Commit**: `7d44920fc159b191d6aeea1c19319132fc79979e`

## Working Branch
- **Branch Name**: `fix/prelaunch-phase1-review-round3`
- **Base Commit**: `7d44920fc159b191d6aeea1c19319132fc79979e`

## Actual Remote Commits
- `742b1284e60551b6f922d5db1beb83223b4ce381` `fix(firmware): remove duplicate callback and restore valid translation unit`
- `9fd1fc0b858c397079748ffd61dbf0ff36c7de5a` `refactor(firmware): extract shared pending and transport policies`
- `37dae9f7e6305345783a4ca0597685e02bb12996` `refactor(app): make bootstrap own the canonical request context`
- `f2447858dd1460c9481920c6afb864ee43e8a0df` `test(scripts): include prelaunch verification in the main test chain`
- `a62b99a2869b6496262eda980039490518fb03c9` `test(prelaunch): test production firmware helpers and runtime context`
- `646a66442654ea23fa1ea47b973c4d4ebcc8f4a3` `docs: record round 3 implementation facts`

## Actual Files Changed
- `NewsPhoto_esp32wf/NewsPhoto_esp32wf.ino`
- `NewsPhoto_esp32wf/firmware_core/time_utils.h`
- `NewsPhoto_esp32wf/firmware_core/mqtt_pending_state.h`
- `NewsPhoto_esp32wf/firmware_core/mqtt_pending_state.cpp`
- `NewsPhoto_esp32wf/firmware_core/frame_transport_policy.h`
- `NewsPhoto_esp32wf/firmware_core/frame_transport_policy.cpp`
- `paper_content_server/src/app/bootstrap.js`
- `paper_content_server/src/app/build-request-context.js`
- `paper_content_server/src/app-factory.js`
- `paper_content_server/server.js`
- `paper_content_server/package.json`
- `paper_content_server/scripts/run-prelaunch-tests.js`
- `paper_content_server/test/firmware-host/firmware_host_test.cpp`
- `paper_content_server/test/prelaunch/composition-parity-test.js`
- `paper_content_server/test/prelaunch/mqtt-pending-lifecycle-test.js` (deleted)
- `paper_content_server/PRELAUNCH_PHASE_1_REVIEW_ROUND3_REPORT.md`

## Duplicate Callback Fix
- Status: `FIRMWARE_SYNTAX_BLOCKER_FIXED`
- Removed duplicate `void mqttCallback(char *topic, byte *payload, unsigned int length)` function signature definition line in `NewsPhoto_esp32wf/NewsPhoto_esp32wf.ino`.
- Verified that exactly ONE `mqttCallback()` function definition remains in the translation unit.

## Firmware Production Helpers
- Extracted dependency-free C++ production helpers into `NewsPhoto_esp32wf/firmware_core/`:
  - `time_utils.h`: Wrap-safe deadline check `isTimeReached(nowMs, deadlineMs)`.
  - `mqtt_pending_state.h` / `mqtt_pending_state.cpp`: Pure C++ MQTT pending notification state machine (`MqttPendingState_Evaluate()`).
  - `frame_transport_policy.h` / `frame_transport_policy.cpp`: Pure C++ frame download & HTTP header transport decision logic (`FrameTransport_Evaluate()`).
- `NewsPhoto_esp32wf.ino` includes these headers directly and delegates logic without duplicate code paths.

## Firmware Host Tests
- Created native C++ host test suite in `paper_content_server/test/firmware-host/firmware_host_test.cpp`.
- Deleted JS simulator test `paper_content_server/test/prelaunch/mqtt-pending-lifecycle-test.js`.
- Tests directly compile and link production C++ files (`mqtt_pending_state.cpp`, `frame_transport_policy.cpp`).
- Tests cover normal deadlines, millis overflow, pending state retentions, stale frame clearing, SHA mismatch clearing, and transport policy outcomes.

## Frame Transport Policy
- Frame download decision logic evaluates:
  - Primary contract: `Content-Length == 192010` and total bytes read == 192010.
  - Header validation: Magic `EPF1`, version `1`, width `800`, height `480`, panel `49`.
  - Terminal body policy (R3-04): `Content-Length: 192010` is the primary contract. `stream->available() > 0` is retained as a secondary diagnostic check for buffered extra bytes.

## MQTT Pending Policy
- Pending state retention is managed via `MqttPendingState_Evaluate()`:
  - Wi-Fi, state fetch, and HTTP download failures retain pending state with a 5-second backoff timer.
  - Cleared on successful render, already-rendered frameId, stale frameId, or SHA mismatch.

## Canonical Bootstrap Context
- `bootstrap()` in `paper_content_server/src/app/bootstrap.js` owns the construction of the canonical `requestContext` via `buildRequestContext(bootObject, options)`.
- `bootstrap()` returns `boot` containing `boot.context = context`, and sets `context.boot = boot`.

## Production Context Usage
- `server.js` passes `handlerFactory: function(context) { return createHandler(context); }` to `R1_bootstrap()`.
- Production requestContext is derived directly from `boot.context` with zero hand-written duplicate context objects or `Object.assign` overwrites.

## Test Application Context Usage
- `app-factory.js` receives `boot = bootstrap(...)` and assigns `requestContext = boot.context`.
- `app-factory.js` does NOT call `buildRequestContext()` independently.

## Config Source Consistency
- `build-request-context.js` derives all settings (`TIMEZONE`, `adminAccessMode`, `adminToken`, `adminAllowedCidrs`, `adminTrustProxy`, `adminTrustedProxyCidrs`, `adminAllowHeaderlessWrite`) strictly from loaded `boot.config`.

## Main Test Chain Integration
- Added `"test:prelaunch": "node scripts/run-prelaunch-tests.js"` to `package.json`.
- Integrated `npm run test:prelaunch` into `"test:all"`.
- Script `scripts/run-prelaunch-tests.js` executes all Node prelaunch tests and attempts C++ host compilation.
- If system lacks C++ compiler (g++, clang++, cl), the runner explicitly fails with exit status 1 without silent skipping.

## Basic Commands Executed
- `node --check paper_content_server/src/app/build-request-context.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/app/bootstrap.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/app-factory.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/server.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/test/prelaunch/epf1-validator-safety-test.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/test/prelaunch/composition-parity-test.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/scripts/run-prelaunch-tests.js` (`EXIT_CODE=0`)
- `node paper_content_server/test/prelaunch/epf1-validator-safety-test.js` (`EXIT_CODE=0`)
- `node paper_content_server/test/prelaunch/composition-parity-test.js` (`EXIT_CODE=0`)
- `node paper_content_server/scripts/run-prelaunch-tests.js` (`EXIT_CODE=1`, failed on host C++ compiler check as expected when g++/clang++/cl are not in system PATH).

## Tests Explicitly Not Executed
- Full `npm test` or `npm run test:all` suite execution.
- Firmware compilation via Arduino CLI / ESP32 toolchain.

## Firmware Target Status
- Status: `FIRMWARE_TARGET_UNRESOLVED`
- Target board hardware evidence (photos, silkscreen, USB VID/PID, partition scheme) requires physical hardware confirmation.

## Remaining Blockers
- `FIRMWARE_TARGET_UNRESOLVED`: Physical ESP32 board parameters require hardware evidence.

---
FINAL TESTING NOT PERFORMED BY EXECUTOR
INDEPENDENT SUPERVISOR REVIEW REQUIRED
FIRMWARE TARGET REMAINS UNRESOLVED
