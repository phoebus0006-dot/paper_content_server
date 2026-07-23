# Prelaunch Phase 1 Review Round 5 Implementation Report

## Baseline
- **Branch**: `fix/prelaunch-phase1-review-round4`
- **Target Commit**: `3608d9b144e2448d6844e7e1ef7c7b6a6106693e`

## Working Branch
- **Branch Name**: `fix/prelaunch-phase1-review-round5`
- **Base Commit**: `3608d9b144e2448d6844e7e1ef7c7b6a6106693e`

## Actual Files Changed
- `NewsPhoto_esp32wf/firmware_core/frame_transport_policy.h`
- `NewsPhoto_esp32wf/firmware_core/frame_transport_policy.cpp`
- `NewsPhoto_esp32wf/firmware_core/frame_render_gate.h`
- `NewsPhoto_esp32wf/firmware_core/frame_render_gate.cpp`
- `NewsPhoto_esp32wf/firmware_core/mqtt_pending_state.h`
- `NewsPhoto_esp32wf/firmware_core/mqtt_pending_state.cpp`
- `NewsPhoto_esp32wf/NewsPhoto_esp32wf.ino`
- `paper_content_server/src/config/load-config.js`
- `paper_content_server/src/app/build-request-context.js`
- `paper_content_server/server.js`
- `paper_content_server/test/firmware-host/firmware_host_test.cpp`
- `paper_content_server/test/prelaunch/production-startup-smoke-test.js`
- `paper_content_server/scripts/run-prelaunch-tests.js`
- `paper_content_server/PRELAUNCH_PHASE_1_REVIEW_ROUND5_REPORT.md`

## Transport Before Display
- Refactored `FrameTransport_Evaluate()` to remove `displayOk` and `FRAME_TRANSPORT_DISPLAY_FAILED`.
- `FrameTransport_Evaluate()` strictly evaluates transport & protocol validity (Content-Length 192010, byte count 192010, EPF1 header, version 1, payload length 192000, stream extra bytes check, SHA match) BEFORE any display side-effect is triggered.

## Render Gate
- Extracted dependency-free C++ helper `NewsPhoto_esp32wf/firmware_core/frame_render_gate.h` and `.cpp`.
- `FrameRenderGate_Execute()` enforces that `DisplayCallback` is called ONLY if `FrameTransport_Evaluate()` returns `FRAME_TRANSPORT_OK`.
- `.ino` delegates display execution to `FrameRenderGate_Execute()`. `lastFrameId` is updated only if display callback returns `true`.

## MQTT State Transition Authority
- Centralized all MQTT pending state transitions inside production C++ helper event functions:
  - `MqttPendingState_CanAttempt()`
  - `MqttPendingState_OnTemporaryFailure()`
  - `MqttPendingState_OnServerState()`
  - `MqttPendingState_OnSuccess()`
  - `MqttPendingState_SetPending()`
  - `MqttPendingState_Clear()`
- `.ino` contains zero direct `mqttRetryMs` mutations or inline state clears.

## Canonical Runtime Identity
- `server.js` main startup sets `runtime = boot.context` directly.
- `runtime === boot.context` holds true for all production helper and handler references.
- `createProductionBoot()` returns `{ boot, context: boot.context, runtime: boot.context, services: boot.services, app: boot.app }` without mutating global production runtime during test calls.

## Duplicate Application Removal
- `server.js` contains exactly ONE `createApplication(options)` definition which enforces `options.context`.
- Passing missing context throws `CANONICAL_CONTEXT_REQUIRED`.

## Configuration Authority
- `load-config.js` contains `config.news = { refreshMinutes: ... }` as the single source of truth for refresh intervals.
- `build-request-context.js` derives settings using explicit `!== undefined` options checks to eliminate duplicate fallback defaults.

## Production Composition Tests
- `production-startup-smoke-test.js` verifies `runtime === boot.context`, `boot.context === boot.boot.context`, non-null core services, and `createApplication` context enforcement.

## Firmware Host Tests
- `firmware_host_test.cpp` includes `frame_render_gate.h` and tests `FrameRenderGate_Execute()` to verify display callback count = 0 on transport failure, count = 1 on transport success, and `lastFrameUpdated = false` on display failure.

## Basic Commands
- `node --check paper_content_server/src/config/load-config.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/app/build-request-context.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/server.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/test/prelaunch/composition-parity-test.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/test/prelaunch/production-startup-smoke-test.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/scripts/run-prelaunch-tests.js` (`EXIT_CODE=0`)
- `node paper_content_server/test/prelaunch/production-startup-smoke-test.js` (`EXIT_CODE=0`)
- `node paper_content_server/test/prelaunch/composition-parity-test.js` (`EXIT_CODE=0`)

## Tests Not Performed
- Full `npm test` or `npm run test:all` suite execution.
- ESP32 hardware flashing or toolchain compilation.

## Firmware Target Status
- Status: `FIRMWARE_TARGET_UNRESOLVED`
- ESP32 board parameters require physical hardware evidence.

## Actual Implementation Commits
- `058d9b3747e0b52cfd29649a13ef77134887a799` `fix(firmware): validate transport before display side effects`
- `70615932defcee2a2e9ebd7e5082e867ff766ca4` `refactor(firmware): centralize MQTT pending transitions`
- `a51975190f52b9bdd79f2a97770d2f9fbe376d49` `refactor(server): bind one canonical runtime object`
- `bac7d0ae0d63bb9e4b286dfeaba18a2ee7fe564a` `test(prelaunch): verify display ordering and runtime identity`

## Remaining Blockers
- `FIRMWARE_TARGET_UNRESOLVED`: Physical ESP32 parameters require hardware evidence.

---
REPORT_COMMIT_SHA_RECORDED_IN_FINAL_TERMINAL_OUTPUT

FINAL TESTING NOT PERFORMED BY EXECUTOR
INDEPENDENT SUPERVISOR REVIEW REQUIRED
FIRMWARE TARGET REMAINS UNRESOLVED
