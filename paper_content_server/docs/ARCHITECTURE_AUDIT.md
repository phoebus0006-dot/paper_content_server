# Architecture Audit — paper_content_server

**Date**: 2026-07-10
**Branch**: refactor/system-architecture
**Baseline**: a5ae032 (master)

## 1. Server Metrics

| Metric | Value |
|--------|-------|
| Total LOC | 3196 |
| Total chars | 127,526 |
| Top-level functions | 112 |
| Module-level declarations | ~250 |
| API routes | 40 |
| JSON state files | 15 |
| Environment variables | 24 |
| Test scripts | 20 |

## 2. Top-Level Functions by Domain

### Infrastructure (23 functions)
`loadDotEnv`, `main`, `parseArgs`, `loadAppConfig`, `resolveConfiguredPath`,
`getLocalIPs`, `ensureDir`, `readJson`, `writeJson`, `readLines`, `sha1`,
`normalizeText`, `decodeEntities`, `stripHtml`, `truncateText`, `truncateByWidth`,
`fitTextWidth`, `escapeXml`, `parseDate`, `extractAttribute`, `formatDateParts`,
`formatDateTime`, `formatIsoLocal`, `formatDateKey`, `formatDateTimeWithSeconds`,
`formatLocalTimeLabel`, `getWallTime`, `getTimeZoneOffsetMinutes`, `dateFromWallTime`,
`canonicalUrl`, `bigramDice`, `classifyCategory`, `categoryPriority`, `escapeRegex`

### Feed Pipeline (9 functions)
`extractTag`, `extractLink`, `extractItems`, `parseFeedXml`, `parseJsonFeed`,
`fetchText`, `loadFeeds`, `refreshFeeds`, `loadNewsCandidates`

### News (16 functions)
`categoryForRotation`, `titleHash`, `isRecentlyShown`, `filterByRotation`,
`selectNewsItems`, `recordShownItems`, `normalizeEntitiesAndAcronyms`,
`isTextSemanticallyComplete`, `rewriteNewsTitle`, `rewriteNewsSummary`,
`translationCacheKey`, `translateArticle`, `translateWithProvider`,
`parseJsonObject`, `evaluateNewsItemQuality`, `buildNewsSnapshot`

### Photo (18 functions)
`loadImageIndex`, `generateFallbackStudySvg`, `ensureFallbackStudyFrames`,
`selectableImages`, `studySelectableImages`, `reloadImageIndexIfNeeded`,
`isImageReady`, `isImageApproved`, `isStudySelectable`, `getImageKind`,
`groupImagesByKindAndTheme`, `groupImagesByKind`, `themePoolFromKind`,
`groupImagesByTheme`, `themePoolFromIndex`, `nextThemeFromState`,
`filterRecentImages`, `sortByLastShown`, `updateLibraryStateForPhoto`,
`selectPhotoSnapshot`, `computeNextSwitchAt`, `selectStudyPhoto`,
`buildPhotoSnapshot`

### Render (10 functions)
`createSvgHeader`, `wrapText`, `categoryStyle`, `layoutNewsCard`,
`renderNewsSvg`, `renderPhotoFrame`, `renderPlaceholderFrame`,
`renderNewsFrame`, `nearestPaletteCode`, `imageToFrameBuffer`,
`distributeError`, `clampColor`, `buildFrameBuffer`, `hexPreview`

### HTTP/App (12 functions)
`computeSnapshot`, `getContentForNow`, `warmRefreshLoop`, `refreshAhead`,
`nowForRequest`, `wallTimeForRequest`, `clientKey`, `ensureCachedFrame`,
`getPinnedSnapshot`, `setPinnedSnapshot`, `readBody`, `respondJson`,
`failJson`, `adminAuth`, `serveAdminFile`, `readPubHistory`,
`handleRequest`, `renderIndexHtml`

## 3. Global Mutable State

The single `runtime` object holds ALL mutable state:

```js
const runtime = {
  feeds: null,                  // Feed config array
  feedsLoadedAt: 0,             // Timestamp
  newsCache: { version, updatedAt, translations: {} },
  newsRotation: { version, updatedAt, shown: [] },
  libraryState: { /* photo rotation state */ },
  imageIndex: [],               // Approved image index
  fullImageIndex: null,         // Full index including pending
  lastGoodNews: null,           // Last successful news
  cachedSnapshots: new Map(),   // In-memory news cache
  cachedFrames: new Map(),      // In-memory frame cache (EPF1)
  pinnedSnapshots: new Map(),   // Client pin store
  lastNewsRefreshAt: 0,         // Timestamp
  renderCount: 0,               // Counter
  serverStartTime: 0,           // Timestamp
  nowProvider: null,            // Clock override (test hook)
  pinNowProvider: null,         // Clock override (test hook)
};
```

**Risks**:
- All state in one untyped object — no isolation between domains
- `nowProvider`/`pinNowProvider` are global test overrides, not injectable dependencies
- `cachedFrames` and `cachedSnapshots` are unbounded Maps
- `fullImageIndex` and `imageIndex` dual representation — easy to use wrong one
- No schema validation on load; corrupt JSON silently returns fallback

## 4. Environment Variables (24 total)

| Variable | Location | Default | Notes |
|----------|----------|---------|-------|
| `PORT` | L144 | 8787 | |
| `TZ` | L145 | system | |
| `TRANSLATION_PROVIDER` | L133 | 'none' | |
| `OPENAI_API_KEY` | L134 | '' | |
| `OPENAI_MODEL` | L135 | 'gpt-4o-mini' | |
| `OPENAI_BASE_URL` | L136 | 'https://api.openai.com/v1' | |
| `DEEPL_API_KEY` | L137 | '' | |
| `DEEPL_API_URL` | L138 | 'https://api-free.deepl.com/v2/translate' | |
| `GEMINI_API_KEY` | L139 | '' | |
| `GEMINI_API_BASE` | L140 | '' | |
| `GEMINI_MODEL` | L141 | 'gemini-2.5-flash' | |
| `PHOTO_QUANT_MODE` | L142 | 'clean' | |
| `DITHERING` | L143 | depends on PHOTO_QUANT_MODE | |
| `ENABLE_DEBUG_ROUTES` | L146 | '' | |
| `ADMIN_TOKEN` | L147 | '' | |
| `DATA_DIR` | L149 | 'data' | |
| `IMAGE_ROOT` | L150 | 'images' | |
| `FEEDS_FILE` | L151 | 'feeds.json' | |
| `CONFIG_FILE` | L264 | 'config.json' | |
| `TEST_INSTANCE_ID` | (L2974) | '' | |

**Risk**: Config is read ad-hoc via `process.env.X` scattered across 30+ lines.
No central validation. Missing OpenAI key with `TRANSLATION_PROVIDER=openai`
silently produces `missing-key` status instead of failing on startup.

## 5. JSON State Files

| File | Write Location | Write Guard | Risk |
|------|---------------|-------------|------|
| `data/news_cache.json` | L1194 | `.catch()` swallows | Silent write failure |
| `data/news_rotation_state.json` | L885 | `.catch()` swallows | Silent write failure |
| `data/library_state.json` | L2032 | `.catch()` swallows | Silent write failure |
| `data/image_index.json` | L2040 | `.catch()` swallows | Silent write failure |
| `data/last_good_news.json` | L1542 | `.catch()` swallows | Silent write failure |
| `data/publish_history.json` | L3052, L3070 | Sync write, no catch | Crash on write failure |
| `data/admin_news_draft.json` | L3039 | Sync write, no catch | Crash on write failure |
| `data/admin_override.json` | L3048, L3066 | Sync write, no catch | Crash on write failure |

**Risk**: ALL production state is in `data/` inside the repo directory.
`writeJson` uses a fixed `.tmp` path — concurrent writes corrupt.

## 6. API Routes (40 total)

### Public
- `/api/state.json` — current snapshot
- `/api/frame.bin` — current frame
- `/api/news.json` — latest news
- `/api/review.json` — review info
- `/api/library.json` — image library stats
- `/api/health.json` — server health

### Admin
- `/admin`, `/admin/admin.css`, `/admin/admin.js` — UI
- `/api/admin/dashboard` — admin status
- `/api/admin/news` — list cached news
- `/api/admin/news/draft` — draft news publication
- `/api/admin/publish/news` — publish manual news
- `/api/admin/publish/photo` — publish manual photo
- `/api/admin/override` — clear admin override
- `/api/admin/publish-history` — publication history
- `/api/admin/rollback` — rollback publication
- `/api/admin/photos` — photo library overview

### Debug (protected by `ENABLE_DEBUG_ROUTES`)
- `/debug/clock`, `/debug/config`, `/debug/test-instance`
- `/debug/news.svg`, `/debug/news.png`, `/debug/news-review-6.png`
- `/debug/photo.png`, `/debug/photo-before-after.png`
- `/debug/photo-info.json`, `/debug/photo-palette.json`, `/debug/photo-review.png`
- `/debug/pin-state.json`, `/debug/news-layout`

### Test (protected by `ENABLE_DEBUG_ROUTES`)
- `/test/frame-ok`, `/test/frame-500`, `/test/frame-id-missing`
- `/test/frame-id-mismatch`, `/test/frame-short`, `/test/frame-bad-magic`
- `/test/frame-bad-size`, `/test/frame-bad-panel`, `/test/frame-short-read`

## 7. Coupling Risks

### HIGH: State-Frame Coherence
`GET /api/state.json` and `GET /api/frame.bin` each independently call
`computeSnapshot()` or `getContentForNow()`. There is no guarantee they
return the same snapshot. Pinning is handled by `getPinnedSnapshot()` but
only for frame.bin — state.json does not check pins.

### HIGH: News Cache + Frame Cache In-Memory
`runtime.cachedSnapshots` and `runtime.cachedFrames` are in-memory Maps
keyed by time slot. On restart, the first request triggers a full pipeline
rebuild. Translation cache (`news_cache.json`) persists but lacks versioning.

### MEDIUM: Translation Provider Silence
`TRANSLATION_PROVIDER=openai` with missing `OPENAI_API_KEY` produces
`translationStatus: 'missing-key'`, which in `buildNewsSnapshot` causes
`isTranslated=false` and the item is skipped. This is silent — no startup
error or log warning about the missing key.

### MEDIUM: Admin Routes Modify Production State Directly
Admin publication routes (`/api/admin/publish/news`, `/api/admin/publish/photo`)
directly write `admin_override.json` and `publish_history.json` using
raw `fs.writeFileSync`, bypassing any service layer. FrameId generation
is inline (`Date.now().toString(36)`).

### LOW: Fallback Images in `data/`
`FALLBACK_STUDY_DIR` defaults to `data/fallback_study/`. This mixes
runtime state with generated fallback assets.

## 8. Test Risks

| Test | Type | Uses Production Module | Notes |
|------|------|----------------------|-------|
| `schedule-test.js` | Unit | No (standalone) | Tests `resolveDisplayMode` from lib |
| `frame-selftest.js` | Unit | `imageToFrameBuffer` | Tests palette encoding |
| `coherence-test.js` | Integration | Server via HTTP | Valid state/frame pinning |
| `restart-test.js` | Integration | Server via HTTP | Validates recovery |
| `admin-test.js` | Integration | Server via HTTP | Full admin workflow |
| `photo-safety-test.js` | Unit | `selectStudyPhoto` etc | Selector safety |
| `storyboard-source-test.js` | Unit | Shared lib functions | Source processing |
| `rotation-test.js` | Integration | Server via HTTP | News + rotation |
| `translation-quality-test.js` | Unit | Exported functions | Semantic/rewrite checks |
| `news-render-readability-test.js` | Integration | Server via HTTP | Layout validation |

**Risk**: No unified test runner. Tests use ad-hoc `console.log` + `exitCode`.
No `before`/`after` hooks. No `node:test` or standard framework.
Port conflicts possible when running tests concurrently.

## 9. Deployment Risks

- Runtime state files in `data/` inside git repo — must not be tracked
- `.env` file in repo directory — credentials could leak
- Docker bind mounts override most files at runtime — updates require scp + restart
- No container health check endpoint in compose
- Translation cache is not invalidated on prompt change — stale translations persist
- No startup validation of required config

## 10. Dependency Graph

```
HTTP Request
  ├─ /api/state.json → computeSnapshot()
  │   ├─ selectPhotoSnapshot() → schedule + photo rotation
  │   └─ buildNewsSnapshot() → feeds → parse → dedup → translate → select
  ├─ /api/frame.bin  → getContentForNow()
  │   ├─ computeSnapshot() (again)
  │   └─ renderNewsFrame() or renderPhotoFrame()
  │       └─ sharp(SVG) → imageToFrameBuffer() → buildFrameBuffer()
  │           └─ quantize (nearestPaletteCode + optional FS dither)
  │               └─ pack two pixels per byte (EPF1)
  └─ /api/news.json  → buildNewsSnapshot()
      └─ loadNewsCandidates() → feeds → fetchText → parseFeedXml/parseJsonFeed
          → dedup → translateArticle → rewrite → semantic check → select → final
```

## 11. Refactor Plan

See [REFACTOR_PLAN.md](./REFACTOR_PLAN.md) for detailed phase breakdown.

## 12. Next Steps

1. Create `test/contracts/` with characterization tests (Phase 1)
2. Extract config, clock, JSON store, HTTP client infrastructure (Phase 2)
3. Continue with remaining phases on refactor branch
