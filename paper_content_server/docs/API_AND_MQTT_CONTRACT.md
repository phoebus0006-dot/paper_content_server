# API & MQTT Contract

## REST API

### GET /api/state.json
Current display state snapshot. Content determines which frame the device should fetch.

**Response:**
```json
{
  "panelIndex": 49,
  "mode": "news",
  "frameId": "news:2026-07-10T10:30:news:a1b2c3d4",
  "title": "France 24 / politics",
  "nextSwitchAt": "2026-07-10T11:00:00.000Z",
  "timezone": "Europe/Paris",
  "items": [...]
}
```

### GET /api/frame.bin
Current EPF1 frame binary.

**Headers:**
- `Content-Type: application/octet-stream`
- `Content-Length: 192010`
- `X-Frame-Id: <frameId>` — MUST match state.json frameId

**Body:** EPF1 format (10-byte header + 192000-byte payload)

### GET /api/news.json
Current news data (same 6 items as frame).

### GET /api/health.json
Server health and pipeline statistics.

## CURRENT (Legacy) Admin Routes
These routes represent the current implementation. They remain operational but
are expected to be replaced or wrapped by target API in future refactoring.

| Route | Method | Purpose | Status |
|-------|--------|---------|--------|
| /admin | GET | Admin UI | CURRENT |
| /api/admin/dashboard | GET | Server status | CURRENT |
| /api/admin/news | GET | Cached news list | CURRENT |
| /api/admin/news/draft | POST | Draft news items | CURRENT |
| /api/admin/publish/news | POST | Publish manual news | CURRENT |
| /api/admin/publish/photo | POST | Publish manual photo | CURRENT |
| /api/admin/override | DELETE | Clear admin override | CURRENT |
| /api/admin/publish-history | GET | Publication history | CURRENT |
| /api/admin/rollback | POST | Rollback publication | CURRENT |
| /api/admin/photos | GET | Photo library overview | CURRENT |

## TARGET (Future) Admin Routes
These routes define the intended API contract after refactoring.

### Library
```
GET /api/admin/library?libraryType=learning|custom
```
Returns list of assets filtered by library type.

### One-Shot Publish
```
POST /api/admin/publish/one-shot
```
**Body:**
```json
{
  "contentType": "photo",
  "libraryType": "learning",
  "assetId": "film-shot-001"
}
```
**Expiry behavior:**
- Published at 10:12 → expires at 10:30 (next half-hour boundary)
- Published at 10:42 → expires at 11:00 (next hour boundary)
- On expiry: AUTO mode resumes automatically
- MQTT refresh sent on publication and on expiry

### Focus Lock
```
PUT /api/admin/focus-lock
```
**Body:**
```json
{
  "libraryType": "learning",
  "theme": "dialogue"
}
```
or:
```json
{
  "libraryType": "custom",
  "albumId": "my-study"
}
```
**Behavior:**
- Schedule paused
- Only content matching the specified source/filter is shown
- Active until explicitly released

```
DELETE /api/admin/focus-lock
```
**Behavior:**
- Immediately restores current-time AUTO snapshot
- Sends MQTT refresh when active snapshot is ready

## MQTT

### Topic
Configurable. Default: `epaper/device01/refresh`

### Publish (server → device)
```json
{
  "frameId": "news:2026-07-10T10:30:news:a1b2c3d4",
  "snapshotId": "snap_abc123",
  "reason": "publication_activated",
  "publishedAt": "2026-07-10T10:30:00.000Z"
}
```

### Behavior Rules
1. MQTT is notification only. HTTP is the sole source of truth for state and frame data.
2. MQTT failure must not affect publication success.
3. ESP32 receives MQTT → sets pending refresh flag → main loop calls refreshOnce().
4. Duplicate frameId within 30s: debounced.
5. Burst messages within 5s: merged (only latest frame processed).
6. On reconnect: resubscribe + immediate HTTP state check.
7. 60-second polling is the fallback. MQTT provides faster refresh but is not required.
