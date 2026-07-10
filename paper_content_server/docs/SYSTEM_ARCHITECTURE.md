# System Architecture

## Target Module Structure

```
src/
  app/            — Application bootstrap (createApp, routes)
  config/         — Centralized configuration (load-config.js)
  infra/          — Infrastructure (clock, json-store, http-client, logger)
  schedule/       — Display mode schedule resolver
  mqtt/           — MQTT notification client
  snapshot/       — Snapshot service (state, pinning, frame dispatch)
  news/           — News pipeline (fetch, parse, translate, verify, select)
  library/        — Custom image library repository and rotation
  safety/         — NSFW/content safety scanner
  render/         — Renderers (news-layout, news-render, photo-render, quantizer)
  epaper/         — Frame format (EPF1 encoder/decoder, palette, validator)
  publication/    — Publication service (override, history, rollback)
  admin/          — Admin routes and service

server.js          — Final: load config → create dependencies → create app → start
                     Target: < 250 LOC
```

## Current vs Target

| Concern | Current (server.js) | Target |
|---------|-------------------|--------|
| LOC | ~2900 | < 250 |
| Global state | Single `runtime` object | Domain-specific stores |
| Config | 30+ process.env scattered | src/config/load-config.js |
| Persistence | ad-hoc writeJson, .tmp collision | JsonStore with unique temp + rename |
| Time control | runtime.nowProvider (global) | Injectable Clock interface |
| HTTP client | Inline fetch() | src/infra/http-client.js |
| News pipeline | 500+ LOC inline | Domain modules |
| Frame cache | In-memory Map | Dedicated frame cache with eviction |
