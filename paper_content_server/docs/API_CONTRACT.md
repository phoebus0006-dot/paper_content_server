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

> Status: `TARGET_NOT_IMPLEMENTED` — 尚未在 server.js 实现（R4/R5 计划能力）。

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

下一个 HH:00 或 HH:30。

## 4. Focus Lock

### PUT /api/admin/focus-lock

> Status: `TARGET_NOT_IMPLEMENTED` — 尚未在 server.js 实现（R5/R6 计划能力）。

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

行为：

- 关闭锁定；
- 立即恢复当前 AUTO snapshot；
- active snapshot ready 后发送 MQTT refresh。

## 5. Library

> Status: `TARGET_NOT_IMPLEMENTED` — library 相关端点尚未在 server.js 实现（R4/R6 计划能力）。

### GET /api/admin/library?libraryType=learning

### GET /api/admin/library?libraryType=custom

### POST /api/admin/library/custom/upload

### PATCH /api/admin/library/:id/metadata

### DELETE /api/admin/library/:id

删除后必须失效相关 publication、cache、snapshot 和 rollback。

## 6. Legacy API

实现迁移前应列出：

- `/api/admin/publish/news`
- `/api/admin/publish/photo`
- `/api/admin/override`

并在代码阶段明确兼容期和弃用策略。

> Status: `CURRENT_COMPATIBILITY` — `/api/admin/publish/news`、`/api/admin/publish/photo`、`/api/admin/override` 当前作为兼容期处理保留。
