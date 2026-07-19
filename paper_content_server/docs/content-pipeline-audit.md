# 内容同步管道审计报告 (Content Pipeline Audit)

## 1. 架构总览
系统包含两个独立的内容同步链路：新闻同步与图片同步。两者均由 Admin 界面触发或定时任务触发。
当前审计结论：**内容抓取已与图片处理完全隔离，抓取动作仅由 `fetch-images.js` 执行。**

## 2. 图片同步链路 (Photo Sync)
- **触发入口**：`POST /api/admin/content-sync/photos`
- **抓取阶段 (Fetch)**：
  - 调用 `scripts/fetch-images.js`
  - 读取 `config/photo_sources.json` 获知图源配置（如 NASA APOD）。
  - 下载原图到临时目录或直接处理。
- **处理阶段 (Process)**：
  - 调用 `scripts/process-images.js`
  - 使用 `sharp` 库调整图片大小并生成适合电子纸的 800x480 分辨率、经过抖动算法处理的二进制数据。
  - 生成 `image_index.json` 作为元数据存储。
- **结论**：`PROCESS_IMAGES_DOES_NOT_FETCH_NEW_CONTENT = YES`。`process-images.js` 纯粹负责本地图片的处理，不会发起任何网络请求抓取新内容。这确保了在纯粹的环境中（比如只处理预置图片的测试环境），系统不会因为网络断开而失败。

## 3. 新闻同步链路 (News Sync)
- **触发入口**：`POST /api/admin/content-sync/news`
- **抓取处理**：
  - 调用 `scripts/fetch-news.js`
  - 读取 `config/feeds.json`，并发抓取多个 RSS 源。
  - 下载新闻，合并过滤重复项（通过 URL 和 Title）。
  - 保留预先选择数量的条目，生成 `news.json`。
- **结论**：新闻的同步是原子化的覆盖写操作，错误时自动回滚到上一次成功的 `news.json`。

## 4. 并发与隔离
- 系统对内容同步添加了内存锁（`runtime.syncLocks.news` / `runtime.syncLocks.photos`）。
- API 请求返回 409 Conflict 如果一个同步任务已经在运行。
- 测试证明，即使获取过程彻底崩溃，已有的内容（`news.json` / `image_index.json`）将受到完全保护。
