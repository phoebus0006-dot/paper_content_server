# server.js 剩余职责分析 — Phase A3

## 概览

`server.js` 的 `handleRequest` 函数当前包含约 50 条路由。Phase A2 已将 5 条 P0 只读路由迁移到 `route-registry`，剩余约 45 条仍在内联 `if/else` 链中。

---

## 剩余路由分类

### 1. 只读业务接口（适合优先迁移）

| 路由 | 状态码 | 核心依赖 | 迁移建议 |
|---|---|---|---|
| `/api/news.json` | 200 | `buildNewsSnapshot` | 适合迁移到 news-service |
| `/api/library.json` | 200 | `R.imageIndex`, `selectPhotoSnapshot` | 适合迁移到 library-service |
| `/api/review.json` | 200 | `getContentForNow` | 适合迁移到 review-service |
| `/api/state.json` | 200 | 已由 P0 handler 覆盖 | handler 已使用 |
| `/api/frame.bin` | 200 | 已由 P0 handler 覆盖 | handler 已使用 |

### 2. 只读调试路由（适合后续迁移）

| 路由 | 条件 | 核心依赖 |
|---|---|---|
| `/debug/news.svg` | 无 | `buildNewsSnapshot`, `renderNewsSvg` |
| `/debug/news.png` | 无 | `buildNewsSnapshot`, `renderNewsSvg`, `sharp` |
| `/debug/photo-info.json` | 无 | `buildPhotoSnapshot` |
| `/debug/photo.png` | 无 | `buildPhotoSnapshot`, `sharp` |
| `/debug/news-review-6.png` | 无 | `buildNewsSnapshot`, `sharp` |
| `/debug/photo-review.png` | 无 | `buildPhotoSnapshot`, `sharp` |
| `/debug/photo-before-after.png` | 无 | `buildPhotoSnapshot`, `sharp`, palette |
| `/debug/photo-palette.json` | 无 | `buildPhotoSnapshot`, palette |
| `/debug/pin-state.json` | `ENABLE_DEBUG_ROUTES` | `R.pinStore` |
| `/debug/config` | `ENABLE_DEBUG_ROUTES` | `R.DATA_DIR` 等 |
| `/debug/clock` | `ENABLE_DEBUG_ROUTES` | `R.nowProvider` |
| `/test/frame-short-read` | `ENABLE_DEBUG_ROUTES` | 内联 |
| `/test/frame-ok` | `ENABLE_DEBUG_ROUTES` | `R.cachedFrames` |
| `/test/frame-500` | `ENABLE_DEBUG_ROUTES` | 内联 |
| `/test/frame-id-missing` | `ENABLE_DEBUG_ROUTES` | 内联 |
| `/test/frame-id-mismatch` | `ENABLE_DEBUG_ROUTES` | 内联 |
| `/test/frame-short` | `ENABLE_DEBUG_ROUTES` | 内联 |
| `/test/frame-bad-magic` | `ENABLE_DEBUG_ROUTES` | 内联 |
| `/test/frame-bad-size` | `ENABLE_DEBUG_ROUTES` | 内联 |
| `/test/frame-bad-panel` | `ENABLE_DEBUG_ROUTES` | 内联 |

### 3. Admin 业务接口

| 路由 | 方法 | 核心依赖 |
|---|---|---|
| `/admin`, `/admin/` | GET | `serveAdminFile` |
| `/api/admin/access-mode` | GET | `readAdminConfig` |
| `/admin/admin.css` | GET | `serveAdminFile` |
| `/admin/admin.js` | GET | `serveAdminFile` |
| `/api/admin/dashboard` | GET | `R.adminStateService`, `R.publicationService` |
| `/api/admin/news` | GET | `buildNewsSnapshot` |
| `/api/admin/news/draft` | POST | `readBody`, `adminAuth` |
| `/api/admin/news/draft/approve-all` | POST | `adminAuth` |
| `/api/admin/news/draft/reject-all` | POST | `adminAuth` |
| `/api/admin/publish/news` | POST | `adminAuth`, `readBody` |
| `/api/admin/publish/photo` | POST | `adminAuth`, `readBody` |
| `/api/admin/publish/one-shot` | POST | `adminAuth` |
| `/api/admin/focus-lock` | PUT/DELETE | `adminAuth` |
| `/api/admin/rollback` | POST | `adminAuth` |
| `/api/admin/publish-history` | GET | `adminAuth` |
| `/api/admin/photos` | GET | `adminAuth` |
| `/api/admin/photos/upload` | POST | `adminAuth` |
| `/api/admin/photo-preview` / `/api/admin/photo-eink-preview` | GET | `adminAuth` |
| `/api/admin/override` | DELETE | `adminAuth` |
| `/api/admin/system/status` | GET | `adminAuth` |
| `/api/admin/publications` | GET | `adminAuth` |
| `/api/admin/assets` | GET | `adminAuth` |
| `/api/admin/features` | GET | `adminAuth` |
| `/api/admin/library` | GET | `adminAuth` |
| `/api/admin/library/custom/upload` | POST | `adminAuth` |
| `/api/admin/learning/ingest` | POST | `adminAuth` |
| `/api/admin/learning/status` | GET | `adminAuth` |
| `/api/admin/state` | GET | `adminAuth` |

### 4. Device 业务接口

| 路由 | 方法 | 核心依赖 |
|---|---|---|
| `/api/v2/device-provisioning/register` | POST | `R.deviceRegistryService` |
| `/api/v2/devices/:id/heartbeat` | POST | `R.deviceRegistryService`, `readBody` |
| `/api/v2/devices` | GET | `adminAuth`, `R.deviceRegistryService` |
| `/api/v2/devices/:id` | GET | `adminAuth`, `R.deviceRegistryService` |

### 5. 已迁移但仍保留旧代码的路由（P0，不走这里）

| 路由 | 说明 |
|---|---|
| `/health/live` | Phase A2 已迁移，旧代码保留 |
| `/health/ready` | Phase A2 已迁移，旧代码保留 |
| `/api/health.json` | Phase A2 已迁移，旧代码保留 |
| `/api/state.json` | Phase A2 已迁移，旧代码保留 |
| `/api/frame.bin` | Phase A2 已迁移，旧代码保留 |

### 6. 根路由

| 路由 | 依赖 |
|---|---|
| `/` | `computeSnapshot`, `renderIndexHtml` |

---

## 核心依赖函数

| 函数 | 定义位置 | 调用方 | 迁移优先级 |
|---|---|---|---|
| `ensureActiveSnapshotForSchedule` | server.js:2703 | state/frame (旧), handlers (简化版) | **P0 — 本次** |
| `buildNewsSnapshot` | server.js | news.json, debug | 后续 |
| `buildPhotoSnapshot` | server.js | debug | 后续 |
| `getContentForNow` | server.js:2736 | review.json, ensureActiveSnapshot | 后续 |
| `selectPhotoSnapshot` | server.js | 多处 | 后续 |
| `computeSnapshot` | server.js:2681 | `/` | 后续 |
| `reloadImageIndexIfNeeded` | server.js | library.json | 后续 |
| `clientKey` | server.js:2820 | 多处 | **P0 — 本次** |
| `hexPreview` | server.js:2820 | frame handler | **P0 — 本次** |
| `respondJson` / `failJson` | server.js:2860 | 多处 | 后续 |
| `readBody` | server.js:2830 | admin routes | 后续 |

---

## 本次迁移范围（Phase A3）

严格限定:

1. **创建 `repositories/snapshot-repository.js`** — 封装 publicationService、pinStore、snapshotCache 数据访问
2. **创建 `services/snapshot-service.js`** — 封装 `ensureActiveSnapshot` 业务逻辑（override 处理 + 调度检查）
3. **更新 `state-handler.js`** 使用 service/repository
4. **更新 `frame-handler.js`** 使用 service/repository
5. **创建 `test/refactor/service-boundary-test.js`** 验证边界

不修改：
- NAS/ESP32
- HTTP 协议/API 返回结构
- server.js 现有代码（保留旧函数作为参考）
- EPF1 格式
