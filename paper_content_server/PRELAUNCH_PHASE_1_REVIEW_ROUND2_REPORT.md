# Prelaunch Phase 1 Review Round 2 Implementation Report

## Baseline
- **Branch**: `fix/prelaunch-phase1-independent-review`
- **Target Commit**: `d4dfa0065b276ce3b4289a4f710ff74e5f514a04`

## Working Branch
- **Branch Name**: `fix/prelaunch-phase1-review-round2`
- **Base Commit**: `d4dfa0065b276ce3b4289a4f710ff74e5f514a04`

## Actual Files Changed
- `paper_content_server/src/publication/epf1-contract.js`
- `paper_content_server/src/epaper/frame-validator.js`
- `NewsPhoto_esp32wf/NewsPhoto_esp32wf.ino`
- `paper_content_server/src/app/build-request-context.js`
- `paper_content_server/src/app/compose-services.js`
- `paper_content_server/src/app/bootstrap.js`
- `paper_content_server/src/app-factory.js`
- `paper_content_server/server.js`
- `paper_content_server/test/prelaunch/epf1-validator-safety-test.js`
- `paper_content_server/test/prelaunch/mqtt-pending-lifecycle-test.js`
- `paper_content_server/test/prelaunch/composition-parity-test.js`
- `paper_content_server/PRELAUNCH_PHASE_1_REVIEW_ROUND2_REPORT.md`

## Validator Safety Changes
- Input type checking: Rejects any non-Buffer input (`null`, `undefined`, string, plain object, array) returning `{ ok: false, errors: ['Input is not a Buffer'] }` without throwing errors.
- Short input protection: Header field reads (`slice` / `readUInt16LE` / `readUInt8`) are guarded until `buffer.length >= 10`.
- Untrusted input boundary safety: Inputs of length 0, 1, 4, 8, 9, 10, 192009, 192011, or invalid magic/width/height/panel/version return structured invalid results without throwing `RangeError`.

## Dependency Direction
- Standardized strictly one-way linear dependency graph:
  - `epf1-contract.js` (Authoritative protocol constants, `parseEpf1Header()`, `validateEpf1Frame()`, `computeEpf1FrameSha256()`). Depends only on `crypto` and `palette.js`.
  - `frame-validator.js` delegates directly to `epf1Contract.validateEpf1Frame(buffer)` as a wrapper.
  - `epf1.js`, `snapshot-model.js`, `snapshot-store.js`, `publication-service.js` depend directly on `epf1-contract.js`.
  - Reverse requires removed; circular dependencies eliminated.

## Firmware Body Termination Policy
- Adopted strict fail-closed `Content-Length` policy:
  - Download requires explicit `Content-Length == 192010`.
  - Missing, non-positive, or non-192010 `Content-Length` values are rejected with `EPF1_CONTENT_LENGTH_REQUIRED` or `EPF1_LENGTH_MISMATCH`.
  - Exact stream read length must match 192010 bytes. Premature disconnects, timeouts, or extra trailing bytes (`stream->available() > 0`) abort download without rendering display or updating `lastFrameId`.

## MQTT Retry Semantics
- Preserved pending notification retention on temporary network/fetch failures:
  - Temporary Wi-Fi, `fetchState()`, or HTTP download failures retain `publicationPending`, `pendingFrameId`, `pendingSnapshotId`, `pendingFrameSha256`.
  - 5-second retry delay is set on `mqttRetryMs`.
  - Pending notifications are cleared ONLY on successful render, already-rendered frameId, stale frameId, or permanent SHA mismatch.
- Timer comparisons: Implemented `isTimeReached(now, deadline)` using signed 32-bit arithmetic `(int32_t)(now - deadline) >= 0` for `millis()` uint32 overflow safety across all timers.

## Request Context Builder
- Created single authoritative builder module: `paper_content_server/src/app/build-request-context.js`.
- Both `server.js` (production) and `app-factory.js` (test runtime) call `buildRequestContext(boot, options)`.

## Service Override Injection
- Enabled service overrides during composition phase: `bootstrap(overrides)` passes `serviceOverrides` to `composeServices(deps)`.
- Replaced separate instantiation in `app-factory.js` with composition-injected overrides.
- Guaranteed 100% object identity parity (`context.deviceRegistryService === boot.services.deviceRegistryService`, `context.publicationService === boot.services.publicationService`, etc.).

## Config Path Parity
- Replaced hardcoded path assignments in `app-factory.js` with canonical paths derived from `boot.config.paths` (`DATA_DIR`, `IMAGE_INDEX_FILE`, `LIBRARY_STATE_FILE`, `NEWS_CACHE_FILE`, `NEWS_ROTATION_FILE`, `FEEDS_FILE`, `LAST_GOOD_NEWS_FILE`, `FALLBACK_STUDY_DIR`).
- Test paths enter via `options.env` -> `loadConfig()` -> `boot.config.paths`.

## Tests Added
- `paper_content_server/test/prelaunch/epf1-validator-safety-test.js`
- `paper_content_server/test/prelaunch/mqtt-pending-lifecycle-test.js`
- `paper_content_server/test/prelaunch/composition-parity-test.js`

## Basic Commands Executed
- `node --check paper_content_server/src/publication/epf1-contract.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/epaper/frame-validator.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/app/build-request-context.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/app/compose-services.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/app/bootstrap.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/src/app-factory.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/server.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/test/prelaunch/epf1-validator-safety-test.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/test/prelaunch/mqtt-pending-lifecycle-test.js` (`EXIT_CODE=0`)
- `node --check paper_content_server/test/prelaunch/composition-parity-test.js` (`EXIT_CODE=0`)

## Tests Explicitly Not Executed
- `npm test`
- `npm run test:all`
- Full test suite execution or firmware build verification (per rules, executor does not perform final test acceptance).

## Firmware Target Status
- Status: `FIRMWARE_TARGET_UNRESOLVED`
- Source code pin map specifies `ESP32-S3` with pins (7,8,9,10,11,13).
- Required evidence for hardware confirmation:
  - Clear front/back photos of PCB
  - ESP32 module silkscreen marking
  - USB VID/PID
  - Arduino IDE board selection
  - Flash capacity
  - PSRAM detection result
  - Partition scheme

## Actual Commits
- `fix(protocol): make EPF1 validation total and acyclic`
- `fix(firmware): require an exact and terminal frame body`
- `fix(firmware): preserve pending notifications with wrap-safe retry`
- `refactor(app): share one request context builder`
- `refactor(test-app): inject overrides through bootstrap composition`
- `test(prelaunch): cover protocol transport and context boundaries`
- `docs: record round 2 implementation facts`

## Remaining Blockers
- `FIRMWARE_TARGET_UNRESOLVED`: Board FQBN, Flash, PSRAM, and partition scheme require physical hardware evidence confirmation.

---
FINAL TESTING NOT PERFORMED BY EXECUTOR
INDEPENDENT SUPERVISOR REVIEW REQUIRED
FIRMWARE TARGET REMAINS UNRESOLVED
