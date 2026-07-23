# server.js Size Baseline

> Phase A3.5 — Record current server.js dimensions before further migration.
> Date: 2026-07-24
> Branch: `refactor/post-mvp-phase-a1-http-foundation`

---

## File Metrics

| Metric | Value |
|--------|-------|
| Total lines | 4,491 |
| Blank lines | 378 |
| Comment lines | 163 |
| Code lines | 3,950 |
| File size (bytes) | 218,351 |
| File size (KB) | 213.2 |

## Function Count

| Type | Count |
|------|-------|
| Named function declarations | 9 |
| Arrow / anonymous assignments | 1 |
| **Total defined functions** | **10** |
| Module-level declarations (const/let/var) | 118 |

## Named Functions

| Line | Function | Purpose |
|------|----------|---------|
| 478 | `gracefulShutdown(signal)` | Server shutdown handler |
| 1145 | `takeOne(group)` | News rotation: pick one from group |
| 1739 | `isDuplicate(entry)` | News dedup helper |
| 1812 | `canonicalUrl(u)` | URL normalization for dedup |
| 1817 | `normalizeDedupKey(text)` | Text normalization for dedup |
| 1826 | `isDuplicate(item)` | News item dedup check |
| 1836 | `markSeen(item)` | Track seen items |
| 1845 | `tryAdd(items)` | Try-add to seen set |
| 2856 | `onData(c)` | Inline data handler for frame buffer |
| 772 | `pad(n)` | Zero-pad numbers |

## Route Count

| Category | Count | Lines | Notes |
|----------|-------|-------|-------|
| P0 migrated (route-registry) | 5 | ~60 | `/health/live`, `/health/ready`, `/api/health.json`, `/api/state.json`, `/api/frame.bin` |
| Read-only business | 5 | ~150 | `/`, `/api/news.json`, `/api/library.json`, `/api/review.json` |
| Debug / diagnostic | 17 | ~375 | SVG, PNG, JSON debug endpoints |
| Admin routes | 27 | ~800 | Dashboard, news publish, photo upload, operating mode, library CRUD, assets, publications, features |
| Device / provisioning | 2 | ~110 | `/api/v2/device-provisioning/register`, `/api/v2/devices` |
| Test routes | 6 | ~80 | Frame corruption tests for ESP32 validation |
| Health (old fallback) | 3 | ~70 | Legacy inline health probes (superseded by P0 routes) |
| Unknown / not found | 3 | ~20 | 404 handler, 405 detection |
| **Total** | **~68** | **~1,665** | |

Note: Route count includes path pattern checks in the inline `if/else if` chain. Some routes handle multiple methods (`GET`/`POST`/`DELETE`), bringing the effective route-to-handler mapping higher.

## Dependency Distribution

| Dependency type | server.js usage | Proposed layer |
|----------------|-----------------|----------------|
| `fs.readFileSync` | 16 calls | repository |
| `path.join(DATA_DIR, ...)` | 19 calls | repository |
| `crypto.createHash` | 29 calls | service / domain |
| `publicationService.*` | 20+ references | service |
| `pinStore.*` | 6 references | repository |
| `snapshotCache.*` | 4 references | repository |
| `operatingModeService.*` | 8 references | service |
| `process.env` | 6 (all guarded) | config layer |

---

## Section Breakdown

| Section | Lines | Content |
|---------|-------|---------|
| L1–48 | 48 | Module imports & requires |
| L49–476 | 428 | P0 route registry setup, boot & config |
| L477–1144 | 667 | `gracefulShutdown`, server creation, MQTT, sched |
| L1145–1845 | 700 | News pipeline (rotation, dedup, aggregation) |
| L1846–2440 | 594 | Publication service, snapshot, bootstrap |
| L2441–2690 | 249 | Image rendering (sharp, EPF1 frame buffer build) |
| L2691–2853 | 162 | `ensureActiveSnapshotForSchedule`, `getContentForNow` |
| L2854–2900 | 46 | Frame buffer reading |
| L2901–4750 | 1,849 | `handleRequest` — inline route dispatch (~68 routes) |
| L4751–end | ~50 | Exports |

---

## Trendline (for future tracking)

| Phase | server.js Lines | Routes | Functions |
|-------|----------------|--------|-----------|
| Pre-A1 | ~4,550 | ~73 | ~12 |
| A1 (baseline) | ~4,500 | ~70 | ~10 |
| A2 (P0 migration) | ~4,491 | ~68 | ~10 |
| A3 (service intro) | ~4,491 | ~68 | ~10 |
| **A3.5 (baseline)** | **4,491** | **68** | **10** |
