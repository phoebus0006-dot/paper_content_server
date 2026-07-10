# 验收标准

## A. Schedule

必须通过：

- 10:00 photo
- 10:29 photo
- 10:30 news
- 10:59 news
- 11:00 photo
- 18:59 news
- 19:00 photo
- 23:00 与 02:00 返回同一夜间图片，除非发生合法手动发布或 FOCUS_LOCK。

## B. Operating Modes

### AUTO

按 schedule 正常切换。

### ONE_SHOT_OVERRIDE

- 10:12 发布 A；
- MQTT 触发立即检查；
- state/frame 切换为 A；
- 10:29 仍为 A；
- 10:30 自动恢复 news schedule。

### FOCUS_LOCK

- 开启后 schedule 不改变内容；
- 用户切换指定内容时 MQTT 立即触发；
- 关闭后恢复当前 schedule。

## C. MQTT

- 发布成功后立即通知；
- 设备不等待 60 秒；
- broker 故障时 60 秒 polling 可恢复；
- duplicate frameId 不重复刷新；
- burst 消息合并；
- reconnect 后 resubscribe + immediate state check。

## D. Learning Library

必须验证：

- 自动 source adapter 真实产生候选；
- safetyStatus=safe；
- relevanceStatus=pass；
- technicalQualityStatus=pass；
- productionEligible=true；
- broad decorative content 不可进入学习 production；
- 多 slot 可真实轮播；
- 同一图片近期不立即重复。

## E. Custom Library

必须验证：

- 用户上传成功；
- decode validation；
- safety gate；
- safe asset 可显示；
- album/tag/specific asset 选择有效；
- unsafe/suspicious/uncertain 文件已删除。

## F. Source Isolation

当 source=learning：

- selectedCustomCount=0。

当 source=custom：

- selectedLearningCount=0。

禁止 silent cross-library fallback。

## G. Content Safety

对两个图库均要求：

- unsafe selectable=0；
- suspicious selectable=0；
- uncertain selectable=0；
- unsafe file bytes removed；
- active unsafe reference=0；
- cache unsafe reference=0；
- snapshot unsafe reference=0；
- rollback unsafe reference=0。

## H. Image Render Modes

### SINGLE

正常渲染。

### ANALYSIS_CARD

显示画面与短分析，不遮挡主体。

### COMPARISON_PAIR

storyboard 与 final shot 配对完整。

### SEQUENCE_2X2

sequenceIndex 按 1,2,3,4 确定性排序。

## I. News

最终必须：

- FINAL_COUNT=6；
- UNIQUE_CANONICAL_URL_COUNT=6；
- UNIQUE_ARTICLE_ID_COUNT=6；
- UNIQUE_FINAL_TITLE_COUNT=6；
- DUPLICATE_ARTICLE_COUNT=0；
- PLACEHOLDER_COUNT=0；
- FOREIGN_UNTRANSLATED_COUNT=0。

## J. Translation Fidelity

必须验证：

- subject preserved；
- core action preserved；
- negation preserved；
- numbers preserved；
- entities preserved；
- no unsupported claims；
- no missing critical facts。

## K. News Layout

每卡：

- titleLines=1；
- summaryLines=2 或 3；
- overflow=false；
- 无机械截断；
- 无编造扩写。

## L. Last-Good

LIVE_VALID：
- 保存 A。

LIVE_FAIL：
- 使用 A。

LIVE_INVALID/DUPLICATED/INSUFFICIENT：
- 不覆盖 A。

## M. EPF1

- header=10；
- payload=192000；
- total=192010；
- high nibble=left；
- low nibble=right；
- allowed codes=0,1,2,3,5,6；
- code4Count=0。

## N. State/Frame

- state.frameId == X-Frame-Id；
- snapshot pinning 有效；
- 29s HIT；
- 31s MISS；
- frame route 不重新计算业务内容。

## O. ESP32 真机

必须人工确认：

- 中文笔画清晰；
- 标题可读；
- 摘要可读；
- MQTT 后立即刷新；
- 相同 frameId skip；
- 图片学习卡具有实际学习价值。
