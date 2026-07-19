# Photo Pipeline Design

## OVERVIEW

The photo content pipeline in Paper Content Server consists of two completely independent asynchronous scripts:

1. **fetch-images.js** (Ingestion Phase)
2. **process-images.js** (Processing Phase)

### SOURCE
The new content ONLY originates from `fetch-images.js`.
- By default, it reads configured sources from `config/photo_sources.json`.
- Valid source types include: `wikimedia_commons`, `custom_api`, `local_import`.
- `process-images.js` **DOES NOT** create new source content. It strictly processes raw files that were already fetched.

### TRIGGER
- **Automated**: External Cron jobs or the `server.js` `warmRefreshLoop` (if configured).
- **Manual**: User clicks "立即同步图片" in the Admin Dashboard, which explicitly triggers POST `/api/admin/content-sync/photos`.

### INPUT_DIR / OUTPUT_DIR
- `fetch-images.js` outputs to: `data/raw_images` (and logs to `raw_index.json`).
- `process-images.js` reads from `raw_index.json` + `data/raw_images`, outputs to `data/processed_images`, and writes to `data/image_index.json`.

### INDEX_FILE
- **Raw Index**: `data/raw_index.json` (Maintained by fetch-images).
- **Final Index**: `data/image_index.json` (Maintained by process-images, read by `server.js` for serving content).

### ID_GENERATION
- IDs are generated via SHA1 hashes of the original file URL or custom unique identifiers from the remote API.

### DEDUP_RULE
- Files are deduplicated based on their `hash` / `id`. If a record with the same ID already exists in `raw_index.json` or `image_index.json`, it is skipped.

### SCHEDULE
- Managed independently from news. Typically driven by external commands or hourly/daily triggers.

### MANUAL_TRIGGER
- Admin Panel (`/api/admin/content-sync/photos`) initiates the process asynchronously. It MUST call `runFetchImages` followed by `runProcessImages`.

### FAILURE_BEHAVIOR
- If fetch fails, the old `raw_index.json` is completely preserved.
- If a downloaded image fails the `sharp` metadata check (corrupt), it is marked as `failed` in the status log and skipped without halting the batch.
- The UI status endpoint reflects the error and does not erase the existing pool.
