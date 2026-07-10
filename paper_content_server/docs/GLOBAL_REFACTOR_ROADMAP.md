# Global Refactor Roadmap

## R0: Truth Baseline Repair (COMPLETE)
Fixed: Night image stability, contract runner status model, writeJson atomicity, docs:check.

## R1: App Shell + Infrastructure

### GOAL
Establish testable, injectable application shell and infrastructure with no business semantic changes.

### IN_SCOPE
- createApp/bootstrap separation (server.js → src/app/create-app.js)
- Config loading centralization (24 process.env reads → src/config/load-config.js)
- Clock abstraction (global runtime.nowProvider → injectable interface)
- Logger abstraction
- Atomic file primitive (unique temp + rename + fsync)
- JsonStore (explicit ENOENT/CORRUPT/IO errors, schema versioning)
- HTTP client abstraction
- Dependency injection boundaries (createApp receives config, clock, stores, etc.)

### OUT_OF_SCOPE
- Publication behavior changes
- Snapshot redesign
- News pipeline redesign
- Asset model changes
- MQTT
- Admin feature changes
- ESP32 changes

### ALLOWED_FILES
- src/app/, src/config/, src/infra/
- server.js (refactored to bootstrap)
- package.json

### FORBIDDEN_CHANGES
- Schedule semantics
- News selection rules
- EPF1 bytes
- Photo rotation semantics
- Admin API contract
- Device protocol

### ENTRY_CONDITIONS
- R0.1 APPROVED by reviewer
- All mandatory green tests exit 0
- Truth Baseline current
- Night Stability PASS

### EXIT_CONDITIONS
- server.js import does not auto-start server
- createApp() is testable
- Config centralized and validated
- Clock injectable (ProductionClock / TestClock)
- JsonStore has explicit error semantics (ENOENT ≠ CORRUPT ≠ IO)
- All legacy behavior contracts remain green

### TEST_GATE
npm run checks:all (all mandatory green commands)

### ROLLBACK_PLAN
- Small commits per extraction
- Adapter compatibility layer for legacy callers
- Legacy entry in server.js retained until parity proven
- Each extraction verified by existing contract tests

### EVIDENCE_REQUIRED
- git diff stat
- Dependency graph (no cycles)
- All contract test output
- Behavior parity report (before/after)

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
