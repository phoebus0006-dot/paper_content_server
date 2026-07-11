# Global Refactor Roadmap

## R0: Truth Baseline Repair (COMPLETE)
Fixed: Night image stability, contract runner status model, writeJson atomicity, docs:check.

## R1: App Shell + Infrastructure (COMPLETE)

### GOAL
Establish testable, injectable application shell and infrastructure with no business semantic changes.

### IN_SCOPE (IMPLEMENTED)
- createApp/bootstrap separation (server.js → src/app/create-app.js) — handler injection, no auto-listen, no process.exit
- Config loading centralization (src/config/load-config.js) — loadConfig({env,cwd}) covers all process.env keys; opts.env path does NOT mutate global process.env
- Clock abstraction (src/infra/clock.js) — SystemClock / FixedClock with now/nowMs/timezone/advanceMs/setTime
- Logger abstraction (src/infra/logger.js) — ConsoleLogger / SilentLogger / MemoryLogger with debug/info/warn/error
- Atomic file primitive (src/infra/atomic-file.js) — writeFileAtomic with pid+random temp + rename, no fsp.mkdir overhead
- JsonStore (src/infra/json-store.js) — read/readOrNull/readOrDefault/write with explicit NOT_FOUND / INVALID_JSON / IO_ERROR
- HTTP client abstraction (src/infra/http-client.js) — createHttpClient with fetchText/fetchJson, timeout and abort
- Dependency injection boundaries (createApp receives handler, config, clock, logger, stores, httpClient)
- bootstrap({env,cwd,clock,logger,stores,httpClient,handler,listen}) supports listen:false for testing; throws BootstrapError on config failure

### SERVER INTEGRATION
- loadAppConfig() delegates to loadConfig({cwd:ROOT_DIR})
- writeJson delegates to writeFileAtomic
- readJson delegates to JsonStore
- fetchText delegates to httpClient.fetchText
- Logger replaces console.* at startup/config-error/server-listen/request-error/crash
- SystemClock used for startup timezone check and listen callback
- main() uses bootstrap({handler:handleRequest, listen:false}) for app shell
- handleRequest exported for test use

### TEST COVERAGE
- test/r1/app-shell-test.js — createApp bootstrap import no-crash
- test/r1/config-parity-test.js — validates loadConfig returns same results as legacy, verifies process.env NOT mutated
- test/r1/clock-test.js — SystemClock / FixedClock / advanceMs / setTime
- test/r1/logger-test.js — ConsoleLogger / SilentLogger / MemoryLogger entries
- test/r1/atomic-file-test.js — writeFileAtomic write+read
- test/r1/json-store-test.js — read/write/readOrNull, NOT_FOUND / INVALID_JSON errors
- test/r1/http-client-test.js — createHttpClient fetchText fetchJson exist
- test/r1/dependency-boundary-test.js — infra/config must not import server.js
- test/r1/production-integration-test.js — 18 tests verifying SERVER_USES_LOAD_CONFIG, SERVER_USES_SYSTEM_CLOCK, SERVER_USES_LOGGER, SERVER_USES_JSON_STORE, SERVER_USES_ATOMIC_FILE, HTTP_CLIENT_FETCH_USED, CREATE_APP_USES_REAL_HANDLER, BOOTSTRAP_STARTS_SERVER, APP_NO_AUTO_LISTEN, APP_NO_PROCESS_EXIT, BOOTSTRAP_LISTEN_FALSE, BOOTSTRAP_CONFIG_ERROR, plus REAL HTTP test (health/state/frame 192010 EPF1 all green)

### EXIT_CONDITIONS (VERIFIED)
- server.js import does not auto-start server ✅
- createApp() is testable ✅
- Config centralized and validated ✅
- Clock injectable (SystemClock / FixedClock) ✅
- JsonStore has explicit error semantics (NOT_FOUND ≠ INVALID_JSON ≠ IO_ERROR) ✅
- All legacy behavior contracts remain green ✅

### TEST_GATE (PASSED)
- node --check server.js = 0
- npm run contracts:test = 122P/0F/0C exit=0
- npm run r1:test = all pass exit=0
- npm run schedule:test = 18P/0F exit=0
- npm run frame:test = exit=0
- npm run coherence:test = 53P/0F exit=0
- npm run restart:test = 43P/0F exit=0
- npm run admin:test = 20P/0F exit=0
- npm run rotation:test = 23P/0F exit=0
- npm run translation-quality:test = 31P/0F exit=0
- npm run photo:safety-test = 12P/0F exit=0
- npm run storyboard-source:test = 23P/0F exit=0
- npm run rss:test = exit=0
- npm run docs:check = exit=0 (after baseline update)

### ROLLBACK_PLAN (UNCHANGED)
- Small commits per extraction
- Adapter compatibility layer for legacy callers
- Legacy entry in server.js retained until parity proven
- Each extraction verified by existing contract tests

## R2: Frame Core

### GOAL
Extract palette, quantizer, EPF1 encoder, and frame validator into src/epaper/ as pure modules.

### IN_SCOPE
- nearestPaletteCode → src/epaper/palette.js
- imageToFrameBuffer (quantizer) → src/epaper/quantizer.js
- buildFrameBuffer (EPF1 encoder) → src/epaper/epf1.js
- Frame validator (nibble scan, code4 detection) → src/epaper/frame-validator.js

### OUT_OF_SCOPE
- Renderer redesign (news or photo)
- Publication changes
- Snapshot changes
- MQTT
- Admin

### EXIT_CONDITIONS
- Golden byte-for-byte parity (192010 total, code4=0, nibble ordering unchanged)
- Frame validator produces same results as ad-hoc scans in tests
- All frame-related contracts remain green

## R3: Snapshot + Publication Core

### GOAL
Unified PublicationService, SnapshotService, and OperatingModeService. Admin write path migration.

### IN_SCOPE
- SnapshotService (persist immutable snapshots, restart recovery)
- PublicationService (build → render → validate → persist → atomically activate → record → notify)
- OperatingModeService (AUTO / ONE_SHOT / FOCUS_LOCK state machine)
- PinStore (persisted, survives restart)
- Admin write path migration (routes delegate to services, no direct writeFileSync)
- state/frame same snapshot guarantee
- Rollback restores real snapshot
- MQTT notification port reserved (no broker integration)

### OUT_OF_SCOPE
- MQTT broker integration (R6)
- News pipeline redesign (R5)
- Asset model / dual library (R4)
- ESP32 changes

### ENTRY_CONDITIONS
- R1 and R2 APPROVED
- Frame core extracted and byte-identical

### EXIT_CONDITIONS
- All publications go through unified chain
- state.json and frame.bin return same snapshot
- Rollback restores real snapshot (verified by contract)
- Restart recovers active snapshot
- Admin routes do not write state directly
- Admin legacy routes maintain backward compatibility
- All contracts remain green

## R4-R12
See docs/REFACTOR_ROADMAP.md for detailed descriptions. The phases after R3 will be detailed when R3 exit conditions are met.
