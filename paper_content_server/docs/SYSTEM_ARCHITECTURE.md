# 系统架构

## 1. 总体原则

ESP32 是轻客户端；NAS 是内容、调度、翻译、图库、安全、渲染、快照和发布中心。

## 2. 目标模块结构

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
