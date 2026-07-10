# 产品需求文档（PRD）

## 1. 产品定位

NewsPhoto 是一个运行在 7.3 英寸六色电子纸上的个人信息与影视镜头学习终端。

核心用途：

1. 自动展示具有学习价值的实际电影镜头与原始分镜；
2. 帮助观察“分镜设计 → 最终镜头”的关系；
3. 展示全球优质新闻，并以准确、自然、简洁的简体中文呈现；
4. 支持用户自定义图库；
5. 支持手动一次性发布和长期锁定显示模式；
6. 内容变化时通过 MQTT 立即触发设备检查，而不是等待下一次 60 秒轮询。

## 2. 硬件与通信硬约束

- ESP32-S3；
- Waveshare 7.3inch E-Paper HAT(E)；
- 分辨率 800×480；
- panel index 49；
- 保持现有 SPI 引脚；
- 保持现有 BUSY/RST/DC/CS/MOSI/SCLK 配置；
- 60 秒 HTTP polling 保留；
- MQTT 不能替代 HTTP frame 获取；
- ESP32 保持轻客户端。

## 3. 自动调度

### 白天

10:00 ≤ time < 19:00：

- `HH:00`–`HH:29`：图片学习模式；
- `HH:30`–`HH:59`：新闻模式。

### 夜间

19:00–次日 10:00：

- 保持同一张图片；
- 不按小时自动切换；
- 一次性手动发布到下一半小时边界后回到夜间保持图；
- FOCUS_LOCK 开启时继续保持用户指定内容。

## 4. 三种运行模式

### AUTO

按时间调度自动切换。

### ONE_SHOT_OVERRIDE

用户手动发布一次内容：

- 立即生成并激活正式 snapshot；
- MQTT 立即通知 ESP32；
- ESP32 立即走 HTTP state/frame 刷新；
- 内容保持到下一个半小时边界；
- 自动恢复 AUTO。

示例：

- 10:12 发布 → 10:30 恢复；
- 10:42 发布 → 11:00 恢复；
- 21:12 发布 → 21:30 回到夜间保持图。

### FOCUS_LOCK

用户通过后台开关进入锁定模式：

- 暂停 schedule；
- 只显示指定内容或指定图库范围；
- 可指定 Learning Library、Custom Library、主题、相册、具体 asset、study set 或 sequence；
- 关闭后立即恢复当前 AUTO 内容。

## 5. MQTT 即时刷新

流程：

```text
Publication ready
→ Snapshot atomically activated
→ MQTT refresh notification
→ ESP32 callback sets refreshRequested
→ Main loop immediately performs HTTP refreshOnce
→ GET state.json
→ GET frame.bin
→ validate
→ display
```

要求：

- MQTT 仅做通知；
- HTTP 是 state/frame 唯一真相来源；
- MQTT callback 不执行 HTTP、下载或显示；
- MQTT 失败不能回滚 publication；
- 60 秒 polling 作为 fallback；
- 重复 frameId 去重；
- burst notification 合并；
- 显示期间收到通知，显示完成后再检查一次 state；
- reconnect 后 resubscribe 并立即检查 state。

## 6. 图片系统：双图库架构

系统必须同时存在：

### Learning Library

自动定向抓取真正有学习价值的素材：

- 优秀实际电影镜头；
- 电影静帧；
- 原始 storyboard；
- storyboard sequence；
- film frame sequence；
- 分镜稿与最终镜头对应素材；
- 正反打；
- two-shot；
- OTS；
- negative space；
- foreground blocking；
- depth composition；
- silhouette；
- backlight；
- low-key；
- ensemble blocking；
- color contrast；
- motion continuity；
- action matching。

原则：

> 学习价值优先，不固定 70/30 比例。

不允许把 NASA、普通风景、普通建筑、酒店、城市天际线、普通群体肖像等当作学习图库主要来源。

### Custom Library

用户自己上传和管理：

- 电影镜头；
- 分镜稿；
- 参考图；
- 用户自己的学习素材；
- 用户想展示的任意安全图片。

用户手动指定图片时，可以明确选择：

- Learning Library
- Custom Library

不得 silent cross-library fallback。

## 7. 图片展示模式

至少支持：

1. `SINGLE`：单张优秀镜头；
2. `ANALYSIS_CARD`：画面 + 少量分析信息；
3. `COMPARISON_PAIR`：Storyboard vs Final Shot；
4. `SEQUENCE_2X2`：四帧连续镜头网格。

## 8. 图片内容安全

色情/NSFW 零容忍。

安全状态：

- safe
- suspicious
- unsafe
- uncertain

规则：

- safe：允许继续；
- suspicious：删除；
- unsafe：删除；
- uncertain：删除。

删除范围：

- raw image；
- processed image；
- thumbnail；
- temporary download；
- derived render；
- frame cache；
- snapshot cache；
- active publication reference；
- history rollback ability。

只允许保留最小 tombstone：

- contentHash；
- source；
- decision；
- reasonCode；
- deletedAt。

不得保留 unsafe image bytes。

## 9. 新闻需求

目标不是“凑够 6 条”，而是：

> 6 条高质量、独立、可读新闻。

必须满足：

- canonical URL unique；
- article identity unique；
- normalized final title unique；
- duplicate article count=0；
- placeholder count=0；
- foreign untranslated count=0；
- 语义完整；
- 翻译忠实；
- 中文自然；
- 标题简洁；
- 正文可读。

## 10. 新闻来源与翻译

允许全球优质来源混合。

最终显示必须是：

- 准确；
- 自然；
- 简洁；
- 忠实；

的简体中文。

翻译顺序：

```text
Original Article
→ Faithful Translation
→ Fidelity Verification
→ Chinese Display Editing
→ Layout Fitting
→ Final Dedup
→ Quality Gate
→ Select 6
```

必须验证：

- subject；
- action；
- negation；
- numbers；
- currency；
- percentage；
- time；
- location；
- person；
- organization；
- unsupported claims；
- missing facts。

## 11. 新闻排版

每张新闻卡：

- 标题：严格精简为 1 行；
- 正文：2 或 3 行；
- 不允许机械 slice；
- 不允许为凑行数编造内容；
- 不允许添加“值得关注”“后续仍需观察”等原文不存在套话；
- overflow=false。

## 12. Last-Good

只有满足以下条件才允许覆盖 last-good：

- 6 条；
- 无重复；
- placeholder=0；
- 翻译通过；
- 质量通过；
- 所有 productionEligible=true。

live 失败、结果重复、翻译失败、数量不足时：

- 使用 last-good；
- 不覆盖 last-good。

冷启动且无 last-good：

- 显示明确系统状态页；
- 不伪造 6 条新闻。

## 13. Admin

后台是电子纸内容控制台，不是大型 CMS。

核心能力：

- 新闻审核；
- 查看原文、忠实译文、最终中文；
- 编辑最终中文；
- Learning Library 浏览与审核；
- Custom Library 上传与管理；
- 图片标注；
- 安全状态；
- 分析卡编辑；
- comparison pair 管理；
- sequence 管理；
- 六色预览；
- ONE_SHOT 发布；
- FOCUS_LOCK；
- 发布历史；
- health 状态。

## 14. 成功标准

系统成功必须同时满足：

- MQTT 触发后立即检查，不等待 60 秒；
- 60 秒 polling fallback 正常；
- 夜间保持同一图片；
- ONE_SHOT 到下一半小时边界恢复；
- FOCUS_LOCK 真正暂停 schedule；
- NSFW 不能出现；
- 学习图库自动抓取内容真正有学习价值；
- Custom Library 可独立使用；
- Learning/Custom source selection 隔离正确；
- 6 条新闻高质量、独立、可读；
- 翻译忠实；
- 标题 1 行；
- 正文 2–3 行；
- 真机可读。
