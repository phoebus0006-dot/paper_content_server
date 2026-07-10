# Data Storage

## Runtime State Files

All runtime state is in the configured `DATA_DIR` (outside the repo tree in production).

| File | Content | Schema Version |
|------|---------|---------------|
| news_cache.json | Translation cache (versioned by prompt) | 1 |
| news_rotation_state.json | News shown history | 1 |
| library_state.json | Photo rotation state | 1 |
| image_index.json | Image library index | 1 |
| last_good_news.json | Last successful news snapshot | 1 |
| publish_history.json | Publication history | 1 |
| admin_news_draft.json | Current manual news draft | 1 |
| admin_override.json | Admin override state | 1 |

## Repository State

Runtime state files are NOT committed to git in production.
The repo only contains example schemas and empty samples.

## Persistence Rules

- JSON writes use atomic temp file + rename pattern
- Temp files use unique suffixes (not a shared .tmp)
- Corrupt files are backed up as .corrupt.<timestamp>
- Schema version mismatch triggers migration or rejection
- ENOENT (first start) returns allowed fallback
