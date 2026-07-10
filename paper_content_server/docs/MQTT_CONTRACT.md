# MQTT 契约

## 1. 角色

MQTT 只做 refresh notification。

HTTP 是内容真相来源。

## 2. Topic

建议：

```text
epaper/device01/refresh
```

允许通过配置覆盖。

## 3. Payload

```json
{
  "frameId": "string",
  "snapshotId": "string",
  "reason": "manual_publish|focus_change|scheduled_boundary|rollback",
  "publishedAt": "ISO-8601"
}
```

## 4. Server 顺序

```text
build
→ render
→ frame validate
→ persist snapshot
→ atomic activate
→ mqtt publish
```

禁止先 MQTT，再生成 frame。

## 5. ESP32 行为

callback：

- 解析 payload；
- 只设置 refreshRequested / pendingFrameId；
- 不执行 HTTP；
- 不下载；
- 不调用 display。

主循环：

- 看到 refreshRequested；
- 立即执行 refreshOnce；
- state/frameId 相同则 skip；
- 新 frameId 才下载 frame。

## 6. 异常

- MQTT publish failure：publication 保持成功；
- broker unavailable：60 秒 polling 最迟恢复；
- duplicate notification：不重复刷新；
- burst：合并；
- reconnect：resubscribe + immediate HTTP state check。
