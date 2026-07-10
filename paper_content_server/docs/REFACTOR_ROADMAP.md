# Refactor Roadmap

Branch: `refactor/system-architecture`

## Phases

### PHASE 0 — Architecture Audit ✅
- [x] docs/ARCHITECTURE_AUDIT.md

### PHASE 1 — Characterization Contracts ✅
- [x] test/contracts/ (6 contract test files)

### PHASE 2 — Infrastructure Foundation ✅
- [x] src/config/load-config.js
- [x] src/infra/clock.js
- [x] src/infra/json-store.js
- [x] src/infra/http-client.js

### PHASE 3 — EPF1 + Palette + Frame Validator
- [ ] Extract frame format to src/epaper/

### PHASE 4 — Snapshot + Pinning
- [ ] Extract snapshot service

### PHASE 5 — News Pipeline
- [ ] Domain modules for fetch → parse → translate → verify → select

### PHASE 6 — News Layout + Renderer
- [ ] Extract shared layout, news renderer

### PHASE 7 — Library + Safety + Selector
- [ ] Image repository, safety scanner, study selector

### PHASE 8 — Publication + Admin
- [ ] Publication service, admin routes

### PHASE 9 — Unified Tests + CI
- [ ] node:test migration, GitHub Actions

### PHASE 10 — Runtime Data Migration
- [ ] Separate runtime state from source tree

## Status

| Phase | Branch | Status |
|-------|--------|--------|
| PHASE 0-2 | refactor/system-architecture | COMPLETE |
| PHASE 3-10 | refactor/system-architecture | PENDING |
