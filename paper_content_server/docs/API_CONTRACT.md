# HTTP API 契约

## 1. 当前 API 与目标 API

文档必须区分：

- CURRENT LEGACY API
- TARGET API

实现迁移期间可兼容 legacy，但目标行为必须以 TARGET API 为准。

## 2. Device API

### GET /api/state.json

返回：

```json
{
  "mode": "photo|news|analysis|comparison|sequence",
  "frameId": "string",
  "snapshotId": "string",
  "operatingMode": "AUTO|ONE_SHOT_OVERRIDE|FOCUS_LOCK"
}
```

### GET /api/frame.bin

要求：

- Content-Length=192010
- `X-Frame-Id == state.frameId`
- 使用 snapshot pinning
- route 不重新计算业务内容

## 3. One Shot

### POST /api/admin/publish/one-shot

> Status: `IMPLEMENTED` — 在 server.js 实现(Phase 3)。pin 当前 schedule 内容到下一个 HH:00 或 HH:30 边界。

示例：

```json
{
  "contentType": "photo",
  "libraryType": "learning",
  "assetId": "film-shot-001"
}
```

或：

```json
{
  "contentType": "photo",
  "libraryType": "custom",
  "assetId": "my-photo-008"
}
```

expiresAt：

下一个 HH:00 或 HH:30(由 `computeNextSwitchAt` 计算)。

## 4. Focus Lock

### PUT /api/admin/focus-lock

> Status: `IMPLEMENTED` — 在 server.js 实现(Phase 4)。锁定 photo snapshot 直到显式 DELETE。

示例：

```json
{
  "libraryType": "learning",
  "theme": "dialogue"
}
```

或：

```json
{
  "libraryType": "custom",
  "albumId": "my-study"
}
```

### DELETE /api/admin/focus-lock

> Status: `IMPLEMENTED` — 在 server.js 实现(Phase 4)。

行为：

- 关闭锁定；
- 立即恢复当前 AUTO snapshot；
- active snapshot ready 后发送 MQTT refresh(reason=`schedule_restore`)。

## 5. Library

> Status: `IMPLEMENTED` — GET / PATCH / DELETE / POST upload 均已实现。POST upload 通过 `customLibraryService` 走完整 safety gate 链路(quarantine → decode → NSFW safety gate → dedup → persist)。

### GET /api/admin/library?libraryType=learning

> Status: `IMPLEMENTED` — 走 `assetRepository.list({libraryType:'LEARNING'})`。

### GET /api/admin/library?libraryType=custom

> Status: `IMPLEMENTED` — 走 `assetRepository.list({libraryType:'CUSTOM'})`。

### POST /api/admin/library/custom/upload

> Status: `IMPLEMENTED` — 通过 `customLibraryService.processUpload` 走完整 safety gate 链路(quarantine → decode → NSFW safety gate → dedup → persist)。接受 JSON body `{ originalName, mimeType, fileSize, width, height, filePath }`。返回 202 ACCEPTED / 400 REJECTED / 409 DUPLICATE / 500 ERROR。

### PATCH /api/admin/library/:id

> Status: `IMPLEMENTED` — 走 `assetRepository.update(id, {metadata: patch})`。路由把 `/api/admin/library/:id` 中 `:id` 之后整段作为 assetId(URL-decoded);仅 metadata 可 patch,GUARDED_FIELDS(assetId/schemaVersion/createdAt/libraryType)由 repository 强制保护,metadata 字段会合并而非覆盖。

### DELETE /api/admin/library/:id

> Status: `IMPLEMENTED` — 走 `assetRepository.markTombstoned(id, 'admin delete via Library API')` + 清理 `cachedFrames` 中引用此 asset 的项。

## 6. Legacy API (Current Admin Routes)

server.js 当前实际暴露的 admin 路由:

| Method | Path | 用途 | 兼容期去向 |
|--------|------|------|-----------|
| GET | /api/admin/access-mode | 返回当前 ADMIN_ACCESS_MODE | 长期保留 |
| GET | /api/admin/dashboard | 仪表盘(mode/frame/uptime) | 长期保留 |
| GET | /api/admin/news | 当前新闻选片预览 | 长期保留 |
| POST | /api/admin/news/draft | 保存 6 条新闻草稿 | 长期保留 |
| POST | /api/admin/publish/news | 手动发布新闻 | 由 ONE_SHOT 取代 |
| POST | /api/admin/publish/photo | 手动发布照片 | 由 ONE_SHOT 取代 |
| POST | /api/admin/rollback | 回滚到指定 snapshot | 长期保留 |
| GET | /api/admin/publish-history | 发布历史 | 长期保留 |
| GET | /api/admin/photos | 照片库索引(admin 视图) | 由 Library API 取代 |
| DELETE | /api/admin/override | 清除 override 并重新发布 | 由 FOCUS_LOCK 取代 |

并在代码阶段明确兼容期和弃用策略。

> Status: `CURRENT_COMPATIBILITY` — 上述路由当前作为兼容期处理保留。`/api/admin/publish/news`、`/api/admin/publish/photo`、`/api/admin/override` 计划在 ONE_SHOT / FOCUS_LOCK 落地后由目标 API 取代(见 §3、§4)。
