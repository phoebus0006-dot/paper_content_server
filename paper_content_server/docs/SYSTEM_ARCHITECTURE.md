# 系统架构

## 1. 总体原则

ESP32 是轻客户端；NAS 是内容、调度、翻译、图库、安全、渲染、快照和发布中心。

## 2. 目标模块结构

> **NOTE — 目标 vs 当前实际**:下方目录树是 R7 重构目标的端态结构。当前 `src/` 树处于迁移中,部分文件尚未创建(例如 `src/app/routes.js`、`src/snapshot/snapshot-service.js`、`src/library/...`、`src/admin/routes.js`)。已落地的关键模块:`src/publication/operating-mode-service.js`(AUTO/LEGACY_ADMIN_OVERRIDE/ONE_SHOT_OVERRIDE/FOCUS_LOCK 状态机 + BOUNDARY_EXPIRY)、`src/admin/admin-query-service.js` + `src/admin/feature-flag-view.js`(只读查询服务 + 动态 feature flag view)、`src/assets/asset-repository.js`(GUARDED_FIELDS 保护 + metadata merge)、`src/mqtt/mqtt-message.js` + `mqtt-publisher.js` + `mqtt-notification-adapter.js`(schemaVersion=2 + reason 字段贯穿)。HTTP 路由层仍由 `server.js` 单文件承担(见 [CURRENT_IMPLEMENTATION_MAP.md](CURRENT_IMPLEMENTATION_MAP.md) §1 完整 Route Map)。当前实际 admin HTTP 路由见 [API_CONTRACT.md](API_CONTRACT.md) §3-§6。

```text
src/
  app/
    create-app.js
    routes.js

  config/
    load-config.js
    validate-config.js
    paths.js

  infra/
    http-client.js
    json-store.js
    atomic-file.js
    logger.js
    clock.js

  schedule/
    resolver.js

  mqtt/
    notifier.js
    reconnect.js

  snapshot/
    snapshot-service.js
    pin-store.js
    snapshot-cache.js

  news/
    feed-fetcher.js
    feed-parser.js
    normalizer.js
    canonical-url.js
    pre-dedupe.js
    final-dedupe.js
    translation/
      index.js
      provider-openai.js
      provider-gemini.js
      cache.js
      fidelity.js
    editor.js
    layout-fit.js
    quality-gate.js
    selector.js
    last-good.js
    news-service.js

  library/
    learning/
      source-adapters/
      candidate-service.js
      rights-gate.js
      relevance-gate.js
      technical-quality.js
      learning-repository.js
      learning-selector.js
      rotation.js

    custom/
      upload-service.js
      custom-repository.js
      album-service.js
      custom-selector.js

    shared/
      asset-model.js
      source-selector.js
      study-set.js
      sequence.js

  safety/
    safety-service.js
    delete-unsafe.js
    tombstone-store.js

  render/
    news-layout.js
    news-renderer.js
    single-renderer.js
    analysis-card-renderer.js
    comparison-renderer.js
    sequence-grid-renderer.js
    quantizer.js

  epaper/
    palette.js
    epf1.js
    frame-validator.js
    frame-cache.js

  publication/
    publication-service.js
    publication-store.js
    operating-mode-service.js
    history-store.js

  admin/
    routes.js
    admin-service.js
```

## 3. 核心数据流

### 自动调度

```text
Clock
→ ScheduleResolver
→ OperatingModeService
→ ContentService
→ SnapshotService
→ Renderer
→ Quantizer
→ EPF1
→ FrameValidator
→ SnapshotCache
→ HTTP
```

### 发布

```text
Admin
→ PublicationService
→ build
→ render
→ validate
→ persist
→ atomic activate
→ MQTT notify
→ ESP32 immediate HTTP refresh
```

### 新闻

```text
Fetch
→ Parse
→ Normalize
→ Canonicalize
→ Pre-Dedup
→ Faithful Translation
→ Fidelity Verify
→ Chinese Editing
→ Layout Fit
→ Final Dedup
→ Quality Gate
→ Select 6
→ Last-Good
→ Snapshot
```

### Learning Library

```text
Source Adapter
→ Candidate Discovery
→ Rights Gate
→ Temporary Download
→ Decode
→ NSFW Safety Gate
→ Relevance Gate
→ Technical Quality
→ Metadata Normalize
→ Learning Repository
→ Rotation
```

### Custom Library

```text
User Upload
→ Decode
→ NSFW Safety Gate
→ Safe Asset
→ Metadata Edit
→ Album/Tag
→ Custom Repository
→ Explicit Selector
```

## 4. 运行模式

统一由 `OperatingModeService` 管理：

- AUTO
- ONE_SHOT_OVERRIDE
- FOCUS_LOCK

任何 HTTP route 不得直接写 override JSON 绕过 service。

## 5. MQTT

MQTT 只做通知；HTTP state/frame 是唯一真相来源。

## 6. 依赖注入

核心服务不得直接依赖全局 mutable runtime。

```text
createApp({
  config,
  clock,
  stores,
  httpClient,
  translator,
  mqttNotifier,
  renderers,
  repositories
})
```

> HTTP 生命周期（signal handling、process exit、graceful shutdown）由 `src/app/bootstrap.js`（shutdown tasks）与 `server.js`（signal handlers 调用 `boot.shutdown`）负责；Admin 配置集中在 `src/config/load-config.js`（`APP_CONFIG.admin`）。
