# Global Refactor Baseline

**Date**: 2026-07-11
AUDITED_CODE_SHA=67c679e41749e38fd8839dfca8372660eb34b0fd
DOCUMENT_UPDATED_AT_SHA=SELF
**DOCUMENT_COMMIT_SHA**: SELF
**BRANCH**: master

## Repository Metrics

| Metric | Value |
|--------|-------|
| SERVER_JS_PHYSICAL_LINES | 3196 |
| SERVER_JS_LOGICAL_LOC | ~2846 |
| TOP_LEVEL_FUNCTION_COUNT | 114 |
| ROUTE_COUNT | 40 |
| PROCESS_ENV_READ_COUNT | 24 (centralized in load-config) |
| DIRECT_FILE_WRITE_COUNT | 6 (writeJson → writeFileAtomic; readJson → JsonStore) |
| MUTABLE_RUNTIME_FIELD_COUNT | 33 |
| TEST_FILE_COUNT | 13 + 9 R1 tests |
| CONTRACT_COUNT | 11 |
| DOC_FILES | 36 |
| DOCUMENT_DRIFT_COUNT | 5 |

## R1 Migration Evidence

| Metric | Value |
|--------|-------|
| modules_created | 8 (create-app, bootstrap, load-config, clock, logger, atomic-file, json-store, http-client) |
| server_integrated | loadConfig, SystemClock, ConsoleLogger, writeFileAtomic, JsonStore, httpClient |
| console_migrated | startup, config-error, server-listen, request-error, crash |
| json_persistence | writeJson → writeFileAtomic, readJson → JsonStore (all production paths) |
| http_client | fetchText → httpClient.fetchText (RSS feed production path) |
| r1_tests | 9 files, 65 assertions, all PASS exit=0 |
| regression | 14/14 green (1 pre-existing news-render-readability flake unrelated) |
| real_http_verify | health=200, state=200, frame=200/192010/EPF1 |

## R1 Infrastructure Modules

| Module | File | Purpose |
|--------|------|---------|
| createApp | src/app/create-app.js | App factory, no auto-listen, no process.exit |
| bootstrap | src/app/bootstrap.js | Startup orchestrator, supports listen:false, throws BootstrapError |
| loadConfig | src/config/load-config.js | Centralized config, opts.env path does NOT mutate process.env |
| clock | src/infra/clock.js | SystemClock / FixedClock abstraction |
| logger | src/infra/logger.js | ConsoleLogger / SilentLogger / MemoryLogger |
| atomic-file | src/infra/atomic-file.js | writeFileAtomic with pid+random temp + rename |
| json-store | src/infra/json-store.js | JsonStore with NOT_FOUND / INVALID_JSON / IO_ERROR |
| http-client | src/infra/http-client.js | createHttpClient with timeout, abort, error classification |

## Baseline Acceptance Bugs

| Bug | Status | Fix |
|-----|--------|-----|
| NightImageStability | RESOLVED (slotKey anchored to night start date in lib/schedule.js) | R0.1 |

## Invariants (Must Never Change)
- EPF1: header=10, payload=192000, total=192010, magic="EPF1"
- Palette: codes 0,1,2,3,5,6 (code 4 prohibited)
- Display: 800x480, panel 49
- ESP32: existing pins, 60s polling
- Schedule: 10:00-18:59, 00-29 photo, 30-59 news, 19:00-10:00 night hold
