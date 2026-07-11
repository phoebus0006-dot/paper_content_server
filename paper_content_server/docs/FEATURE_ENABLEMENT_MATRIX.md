# Feature Enablement Readiness Matrix

Each feature gate requires specific conditions before it reports `ready: true`.
No flag is automatically toggled — all must be explicitly set via environment variables.

## Delete Pipeline (R4)

| Gate | Condition |
|---|---|
| `configured` | `DELETE_PIPELINE_ENABLED` env var present |
| `enabled` | `DELETE_PIPELINE_ENABLED=true` |
| `dependenciesReady` | reference scan complete + path allowlist configured + safe replacement available |
| `dataReady` | audit store writable |
| `safetyReady` | always true |
| `runtimeReady` | backup ready |
| `ready` | all gates pass + enabled |

**Blockers:** `REFERENCE_SCAN_INCOMPLETE`, `PATH_ALLOWLIST_NOT_CONFIGURED`, `SAFE_REPLACEMENT_UNAVAILABLE`, `AUDIT_STORE_NOT_WRITABLE`, `BACKUP_NOT_READY`

## MQTT (R6)

| Gate | Condition |
|---|---|
| `configured` | `MQTT_ENABLED` env var present |
| `enabled` | `MQTT_ENABLED=true` |
| `dependenciesReady` | mqtt npm dependency present + notification adapter ready |
| `dataReady` | broker configured + deviceId valid |
| `safetyReady` | HTTP fallback enabled (always true in current architecture) |
| `runtimeReady` | always true |
| `ready` | all gates pass + enabled |

**Blockers:** `BROKER_NOT_CONFIGURED`, `MQTT_CLIENT_DEPENDENCY_MISSING`, `DEVICE_ID_INVALID`, `HTTP_FALLBACK_DISABLED`, `NOTIFICATION_ADAPTER_NOT_READY`

## Learning Library (R7)

| Gate | Condition |
|---|---|
| `configured` | `LEARNING_LIBRARY_ENABLED` env var present |
| `enabled` | `LEARNING_LIBRARY_ENABLED=true` |
| `dependenciesReady` | all gates configured + source registry configured |
| `dataReady` | AssetRepository writable |
| `safetyReady` | always true |
| `runtimeReady` | R7 dedup semantics fixed (isDuplicate read-only, commit explicit) |
| `ready` | all gates pass + enabled |

**Blockers:** `DEDUP_SEMANTICS_NOT_FIXED`, `ASSET_REPOSITORY_NOT_WRITABLE`, `GATES_NOT_CONFIGURED`, `SOURCE_REGISTRY_NOT_CONFIGURED`

## Custom Library (R8)

| Gate | Condition |
|---|---|
| `configured` | `CUSTOM_LIBRARY_ENABLED` env var present |
| `enabled` | `CUSTOM_LIBRARY_ENABLED=true` |
| `dependenciesReady` | decode dependency (sharp) ready + safety gate configured |
| `dataReady` | quarantine writable + final asset root writable |
| `safetyReady` | safety gate configured |
| `runtimeReady` | AssetRepository writable |
| `ready` | all gates pass + enabled |

**Blockers:** `QUARANTINE_NOT_WRITABLE`, `FINAL_ASSET_ROOT_NOT_WRITABLE`, `DECODE_DEPENDENCY_NOT_READY`, `SAFETY_GATE_NOT_CONFIGURED`, `ASSET_REPOSITORY_NOT_WRITABLE`

## Advanced Render (R9)

| Gate | Condition |
|---|---|
| `configured` | `R9_ADVANCED_RENDER_ENABLED` env var present |
| `enabled` | `R9_ADVANCED_RENDER_ENABLED=true` |
| `dependenciesReady` | full EPF1 validator pass |
| `dataReady` | golden parity pass + shadow comparison pass |
| `safetyReady` | legacy fallback available |
| `runtimeReady` | always true |
| `ready` | all gates pass + enabled |

**Blockers:** `GOLDEN_PARITY_NOT_PASSED`, `SHADOW_COMPARISON_NOT_PASSED`, `FULL_EPF1_VALIDATOR_NOT_PASSED`, `LEGACY_FALLBACK_UNAVAILABLE`

## Render Shadow (R9)

| Gate | Condition |
|---|---|
| `configured` | `R9_RENDER_SHADOW_ENABLED` env var present |
| `enabled` | `R9_RENDER_SHADOW_ENABLED=true` |
| `dependenciesReady` | always true |
| `dataReady` | shadow comparison pass |
| `safetyReady` | always true |
| `runtimeReady` | always true |
| `ready` | all gates pass + enabled |

**Blockers:** `SHADOW_COMPARISON_NOT_PASSED`

## Usage

```js
var RS = require('./src/features/feature-readiness-service');
var svc = RS.createReadinessService({ rootDir: __dirname });
var all = svc.getAll();
// all.deletePipeline.ready, all.mqtt.ready, etc.
```

## Notes

- No flag is automatically set to `true` by this service.
- Environment variables are the single source of truth for `enabled`.
- Blockers list all reasons a feature is not ready.
- `ready` is `true` only when `enabled && configured && blockers.length === 0`.
