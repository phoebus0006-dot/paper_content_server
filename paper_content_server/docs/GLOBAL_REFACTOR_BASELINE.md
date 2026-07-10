# Global Refactor Baseline

**Date**: 2026-07-10
**AUDITED_SHA**: a6cb25b27f7aeaf232c2c6bce21729fc5d5a7db3
**BRANCH**: master

## Repository Metrics

| Metric | Value |
|--------|-------|
| SERVER_JS_PHYSICAL_LINES | 3197 |
| SERVER_JS_LOGICAL_LOC | 2846 |
| TOP_LEVEL_FUNCTION_COUNT | 114 |
| ROUTE_COUNT | 40 |
| PROCESS_ENV_READ_COUNT | 24 |
| DIRECT_FILE_WRITE_COUNT | 6 |
| MUTABLE_RUNTIME_FIELD_COUNT | 33 |
| TEST_FILE_COUNT | 13 |
| CONTRACT_COUNT | 11 |
| DOC_FILES | 36 |
| DOCUMENT_DRIFT_COUNT | 5 |

## Invariants (Must Never Change)
- EPF1: header=10, payload=192000, total=192010, magic="EPF1"
- Palette: codes 0,1,2,3,5,6 (code 4 prohibited)
- Display: 800x480, panel 49
- ESP32: existing pins, 60s polling
- Schedule: 10:00-18:59, 00-29 photo, 30-59 news, 19:00-10:00 night hold
