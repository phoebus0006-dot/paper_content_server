# AUTOMATION_PLAN.md — 自动化任务与定时轮播规划

> **状态**：完成  
> **日期**：2026-07-22  
> **目标**：规划定时新闻抓取、自动轮播与定时发布引擎  

---

## 1. 自动化核心需求场景

根据电子纸使用场景，需支持以下 3 大类自动化任务：

1. **定时新闻抓取与排版 (Scheduled News Refresh)**:
   - 定时从配置的 RSS 源抓取最新新闻，经过 AI/规则清洗、翻译与模块排版，生成新闻草稿或自动发布版面。
   - 触发周期：可配置（如每 2 小时、每天早晨 07:00）。
2. **定时自动发布 (Scheduled Publication Slots)**:
   - 支持设置发布时刻表（如 07:30 自动发布晨报，12:00 发布午间简报，20:00 自动切换至晚间写真）。
3. **写真图库自动轮播 (Photo Carousel & Auto Rotation)**:
   - 在写真模式 (Photo Mode) 或自动模式 (Auto Mode) 下，按照预设间隔时间（如 30 分钟 / 1 小时）循环挑选图库素材，自动渲染并更新电子纸画面。

---

## 2. 自动化任务引擎设计 (`TaskScheduler`)

系统将新增服务端后台调度引擎 `src/features/automation/task-scheduler.js`：

```text
                     +---------------------------------------+
                     |         TaskScheduler Engine          |
                     +-------------------+-------------------+
                                         |
             +---------------------------+---------------------------+
             |                           |                           |
             v                           v                           v
  +--------------------+      +--------------------+      +--------------------+
  | NewsFetchJob       |      | RotationJob        |      | PublishSlotJob     |
  | - Fetch RSS        |      | - Pick Next Photo  |      | - Time-based Switch|
  | - Clean & Format   |      | - Render EPF1      |      | - Auto Trigger     |
  | - Build Layout     |      | - Trigger Publish  |      |   Publication      |
  +---------+----------+      +---------+----------+      +---------+----------+
            |                           |                           |
            +---------------------------+---------------------------+
                                        |
                                        v
                          +---------------------------+
                          |   OperatingModeService    |
                          |   (AUTO / ONE_SHOT)       |
                          +---------------------------+
```

### 2.1 任务调度规则配置 (`config/automation.json`)
```json
{
  "enabled": true,
  "newsFetch": {
    "enabled": true,
    "cron": "0 */2 * * *",
    "autoApprove": false
  },
  "photoRotation": {
    "enabled": true,
    "intervalMinutes": 60,
    "selectionPolicy": "RANDOM_UNSEEN",
    "targetLibrary": "custom"
  },
  "scheduleSlots": [
    {
      "time": "07:30",
      "mode": "news",
      "action": "PUBLISH_MORNING_NEWS"
    },
    {
      "time": "20:00",
      "mode": "photo",
      "action": "ENTER_PHOTO_ROTATION"
    }
  ]
}
```

---

## 3. 审签拦截与自动化融合逻辑

自动化任务与上一阶段建立的**内容审签门控 (Review Gate)** 融合方式如下：

1. **严格审核模式 (`autoApprove: false`)**：
   - 自动化新闻抓取任务生成 6 条新闻草稿后，发送通知至管理端，触发状态为 `PENDING_REVIEW`。
   - 需人工在 Admin UI 进行审核通过后才触发最终 `PublicationService` 发布。
2. **免审核自动更新模式 (`autoApprove: true`)**：
   - 系统自动对抓取内容进行安全过滤 (Safety Filter) 与排版质量校验，校验通过后直接调用 `PublicationService` 自动化原子发布。

---

## 4. 容错与优雅降级机制 (Fault Tolerance)

1. **RSS 抓取失败处理**：
   - 抓取超时或网络中断时，自动尝试备用源；若全失败，退回使用 `news/last_good_news.json`，确保服务不产生空版面。
2. **并发排他锁 (Mutex Lock)**：
   - 所有自动化发布任务均通过 `publication-lock.js` 获取 `LOCK_KEY_PUBLISH`，防止手动发布与自动轮播产生竞争条件。
3. **优雅停机 (Graceful Shutdown)**：
   - 收到 `SIGTERM/SIGINT` 信号时，`TaskScheduler` 停止排队中的定时任务，等待当前正在渲染的 EPF1 任务完成后安全退出。
