AUDITED_CODE_SHA=PENDING_INTEGRATION
REAL_CJK_MODULE=IMPLEMENTED
REAL_CJK_GLYPH_RENDER=IMPLEMENTED_NOT_PRODUCTION_VERIFIED
ORCHESTRATOR_SHADOW=IMPLEMENTED
ORCHESTRATOR_PRODUCTION_SWITCH=NOT_IMPLEMENTED
REAL_CLASSIFIER=BLOCKED
TRANSLATION_PROVIDER_INTEGRATION=NOT_IMPLEMENTED
TRANSLATION_FORMAT_GATE=IMPLEMENTED_NOT_PRODUCTION_VERIFIED
TRANSLATION_SEMANTIC_FIDELITY=NOT_IMPLEMENTED
NAS_DYNAMIC_ACCEPTANCE=NOT_TESTED
ESP32_DYNAMIC_ACCEPTANCE=NOT_TESTED

# Global Refactor Baseline

## R4-R10 Closure Status
- R4 path safety: isInside() replaces indexOf, lstatSync before realpathSync
- R4 replacement short-circuit: DeleteBlockedError terminates pipeline immediately
- R4 history filter: Only publication_history + rollback_snapshot trigger invalidation
- R5 composition root: Services created once at startup, never per-request
- R5 HTTP test: Real HTTP server with temp DATA_DIR
- R6 MQTT: Real broker test with Aedes, no fake clients in production
- R7 learning: All unit tests pass with LEARNING_LIBRARY_ENABLED=false
- R8 safety gate: Required — null gate returns DEPENDENCY_UNAVAILABLE
- R8 decoded metadata: sharp metadata overrides upload dimensions
- R8 orphan cleanup: Repository failure removes final orphan file
- R9 clock injection: Deterministic render via clock.now()
- R9 golden parity: Real production render path verified
- R10 admin routes: Read-only HTTP with Bearer auth
- R10 feature flags: configured/enabled/connected/ready per service

## Render & Safety State (NOT production-ready)
- ORCHESTRATOR_SHADOW=IMPLEMENTED — shadow pipeline (render-shadow.js + orchestrator-shadow-adapter.js) implemented; runs alongside legacy production path when renderShadowEnabled=true. Shadow mismatch does NOT affect production.
- ORCHESTRATOR_PRODUCTION_SWITCH=NOT_IMPLEMENTED — orchestrator is NOT the default production path. Production still uses legacy-render-adapter. Switching to orchestrator as production requires shadow↔legacy long-run consistency + ESP32真机回归.
- REAL_CJK_MODULE=IMPLEMENTED — CJK rendering module (text-rasterizer + font-detector + sharp SVG pipeline) implemented; cjk-glyph-test PASS.
- REAL_CJK_GLYPH_RENDER=IMPLEMENTED_NOT_PRODUCTION_VERIFIED — implementation complete, ESP32真机显示效果未验证.
- REAL_CLASSIFIER=BLOCKED — no real NSFW model loaded; safety-classifier-port fail-closed (configured=false, ready=false). Custom / Learning libraries cannot ACCEPT uploads; Strict NSFW deletion cannot make a real deletion decision.
- Advanced Render NOT production-ready (R9_ADVANCED_RENDER_ENABLED=false default).
- Custom / Learning libraries NOT production-ready (classifier BLOCKED).

## Default-Disabled Features
DELETE_PIPELINE_ENABLED=false MQTT_ENABLED=false LEARNING_LIBRARY_ENABLED=false
CUSTOM_LIBRARY_ENABLED=false R9_ADVANCED_RENDER_ENABLED=false R9_RENDER_SHADOW_ENABLED=false
