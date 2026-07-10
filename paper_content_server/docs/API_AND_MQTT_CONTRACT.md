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

### Admin Routes
| Route | Method | Purpose |
|-------|--------|---------|
| /admin | GET | Admin UI |
| /api/admin/dashboard | GET | Server status |
| /api/admin/news | GET | Cached news list |
| /api/admin/news/draft | POST | Draft news items |
| /api/admin/publish/news | POST | Publish manual news |
| /api/admin/publish/photo | POST | Publish manual photo |
| /api/admin/override | DELETE | Clear admin override |
| /api/admin/publish-history | GET | Publication history |
| /api/admin/rollback | POST | Rollback publication |
| /api/admin/photos | GET | Photo library overview |
| /api/admin/library | GET | List library assets (query: libraryType) |
| /api/admin/publish/one-shot | POST | Publish one-shot with source selection |

### One-Shot Publish Body
```json
{
  "contentType": "photo",
  "libraryType": "learning",
  "assetId": "film-shot-001"
}
```

### Focus Lock
```json
{
  "libraryType": "learning",
  "theme": "dialogue"
}
```

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
