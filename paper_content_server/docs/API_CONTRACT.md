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

> Status: `IMPLEMENTED` — 路由使用 `assetSelectionService.selectForOneShot(libraryType, assetId)` 验证并选择显式资产(strict:不回退)。当 `assetId` 提供时,用选中资产生成 snapshot;选择失败返回 400。pin 到下一个 HH:00 或 HH:30 边界。override 通过 `overridePersistence.saveOverride()` 持久化;重启时 `validateOverrideAsync()` 重新校验资产仍 SAFE + SELECTABLE + 文件存在,无效则清除 override(不静默换资产)。

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

> Status: `IMPLEMENTED` — 路由使用 `assetSelectionService.selectForFocusLock({libraryType, theme, albumId})` 查询匹配资产(strict:无匹配返回 404,不回退 schedule)。锁定 photo snapshot 直到显式 DELETE。override 通过 `overridePersistence.saveOverride()` 持久化;重启时通过 `validateOverrideAsync()` 重新校验,无效则清除(不静默换资产)。

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

> Status: `IMPLEMENTED` — 在 server.js 实现(Phase 4)。关闭 FOCUS_LOCK 并恢复 AUTO schedule。

行为：

- 关闭锁定；
- 立即恢复当前 AUTO snapshot；
- active snapshot ready 后发送 MQTT refresh(reason=`schedule_restore`)。

## 5. Library

> Status: `IMPLEMENTED` — GET / PATCH / DELETE / POST upload 路由均已挂载。POST upload 接受 `application/octet-stream` (流式上传),走完整安全链路(quarantine write stream → sharp stream decode → MIME mismatch → SHA256 → safety gate → dedup → atomic move),gated by `customLibraryEnabled` + classifierReady。DELETE 走完整原子 AssetDeleteService(markBlocked → tombstone → cleanup → audit → markTombstoned,reason enum),gated by `deletePipelineEnabled`,无 legacy 回退。

### GET /api/admin/library?libraryType=learning

> Status: `IMPLEMENTED` — 走 `assetRepository.list({libraryType:'LEARNING'})`。

### GET /api/admin/library?libraryType=custom

> Status: `IMPLEMENTED` — 走 `assetRepository.list({libraryType:'CUSTOM'})`。

### POST /api/admin/library/custom/upload

> Status: `IMPLEMENTED` (streaming, fail-closed classifier) — 通过 `customLibraryService.processUploadStream(req, metadata, options)` 处理,走完整流式安全链路:createQuarantineWriteStream (O_EXCL) → 实时 bytesWritten 累计 + maxUploadBytes 中止 → sharp streamDecode → MIME mismatch check → NSFW safety gate (fail-closed: classifier 未 ready 时返回 REJECTED CLASSIFIER_UNAVAILABLE) → streamSha256 → dedup → atomic move → audit → repository。

接受 `Content-Type: application/octet-stream`,metadata 通过 headers 传入:
```
X-Original-Name: filename.jpg
X-Mime-Type: image/jpeg
Content-Length: 12345
```

不接受 JSON body 中的 `fileBuffer`/`base64`(已移除旧逻辑)。不接受 `filePath`。不返回 `finalPath`(避免泄露内部路径)。gated by `customLibraryEnabled` flag(flag=false 时返回 503 FEATURE_DISABLED)。当 classifier 未 ready(无真实 NSFW 模型)时返回 503 (CLASSIFIER_UNAVAILABLE, fail-closed)。返回 202 ACCEPTED (返回 assetId) / 400 REJECTED (TOO_LARGE / DECODE_FAILED / MIME_MISMATCH / NSFW) / 409 DUPLICATE / 415 UNSUPPORTED_MEDIA_TYPE / 500 ERROR。

### PATCH /api/admin/library/:id

> Status: `IMPLEMENTED` — 走 `assetRepository.update(id, {metadata: patch})`。路由把 `/api/admin/library/:id` 中 `:id` 之后整段作为 assetId(URL-decoded);仅 metadata 可 patch,GUARDED_FIELDS(assetId/schemaVersion/createdAt/libraryType)由 repository 强制保护,metadata 字段会合并而非覆盖。

### DELETE /api/admin/library/:id

> Status: `IMPLEMENTED` (atomic pipeline, reason enum) — 当 `deletePipelineEnabled=true` 时走完整 `assetDeleteService.deleteAsset(id, reason)` 原子链路:markBlocked → tombstone → cleanup → audit → markTombstoned (fail-closed:每步失败即 reject,不静默)。reason 必须是 enum `UNSAFE` / `SUSPICIOUS` / `POLICY_BLOCKED` 之一(从 body `{"reason":"..."}` 或 query `?reason=...` 获取)。flag=false 时返回 503 FEATURE_DISABLED(不再回退 legacy markTombstoned)。返回 200 OK / 400 INVALID_REASON / 404 ASSET_NOT_FOUND / 409 CONFLICT (有引用) / 500 ERROR。

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
