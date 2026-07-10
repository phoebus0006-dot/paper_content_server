# 独立审查交接文档

## 1. 项目是什么

NewsPhoto 是 ESP32-S3 + 7.3 英寸六色电子纸项目。NAS 服务负责内容、翻译、图库、安全、渲染、快照和发布；ESP32 是轻客户端。

## 2. 关键用户需求

### 刷新

- MQTT 发布后立即触发设备检查；
- MQTT 只做通知；
- HTTP state/frame 是唯一真相来源；
- 60 秒 polling 永久保留。

### 调度

- 10:00–18:59；
- 每小时 00–29 图片；
- 30–59 新闻；
- 19:00–次日 10:00 保持同一张图片。

### 运行模式

- AUTO；
- ONE_SHOT_OVERRIDE：到下一个半小时边界自动恢复；
- FOCUS_LOCK：暂停 schedule，直到用户关闭。

### 图片

双图库：

1. Learning Library：自动定向抓取真正有学习价值的实际镜头、分镜、sequence、comparison 素材；
2. Custom Library：用户上传并独立选择。

禁止 silent cross-library fallback。

### 内容安全

色情/NSFW 零容忍：

- suspicious 删除；
- unsafe 删除；
- uncertain 删除；
- 清除所有派生、cache、snapshot、active 和 rollback reference；
- 仅保留 tombstone 元数据。

### 新闻

- 6 条高质量、独立、可读；
- 不允许重复；
- 不允许 placeholder 凑数；
- 可使用全球优质来源；
- 最终必须准确、自然、简洁、忠实中文。

### 翻译

- 忠实翻译；
- 忠实性验证；
- 中文编辑；
- 布局适配。

### 新闻布局

- 标题 1 行；
- 正文 2–3 行；
- 不编造；
- 不机械截断。

## 3. 审查顺序

1. 获取最新 remote master SHA；
2. 看最近 commits；
3. 看真实 diff；
4. 看生产代码；
5. 看测试代码；
6. 查是否 hardcoded PASS 或复制算法；
7. 查 runtime state 污染；
8. 对照 ACCEPTANCE_CRITERIA；
9. 必要时验证 NAS；
10. 没有 ESP32 日志就写 NOT TESTED。

## 4. Verdict

只使用：

- APPROVE
- REQUEST CHANGES
- BLOCKED

## 5. 绝不接受的证据

- commit message；
- 执行器摘要；
- HTTP 200 但 body 错误；
- toy SVG；
- 手工 fixture 代替生产链；
- placeholder 数量=6；
- JS simulation 冒充 ESP32 runtime；
- created/queued 冒充 completed；
- 空 commit。
