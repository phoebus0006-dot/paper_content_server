# MQTT 契约

## 1. 角色

MQTT 只做 refresh notification。

HTTP 是内容真相来源。

## 2. Topic

实现于 `src/mqtt/mqtt-topic.js` (`publicationTopic`):

```text
epaper/<deviceId>/publication
```

其中 `<deviceId>` 由配置(`MQTT_DEVICE_ID`)注入,例如 `epaper/device01/publication`。同一 deviceId 下还保留 `command` / `status` / `availability` 三个辅助 topic。

## 3. Payload

实现于 `src/mqtt/mqtt-message.js` (`createPublicationMessage`):

```json
{
  "schemaVersion": 2,
  "deviceId": "string",
  "snapshotId": "string",
  "frameId": "string",
  "frameSha256": "string",
  "publishedAt": "ISO-8601",
  "reason": "manual_publish|manual_news|manual_photo|one_shot|focus_change|scheduled_boundary|rollback|schedule|schedule_restore"
}
```

- `schemaVersion=2` 由 `SCHEMA_VERSION` 常量保证;`validateMessage` 同时接受 `schemaVersion=1` 的旧消息(向后兼容,ESP32 固件升级期间不丢消息);
- `schemaVersion` 在 payload 中为 JSON 数字 (`2`),非字符串。ESP32 固件通过 `extractJsonInt()` 解析数字值,同时容忍字符串 `"1"`/`"2"` 形式以提升兼容性;拒绝 `0`、`3`、缺失或非数字值;
- `frameSha256` 是 frame 内容 SHA-256(非 frame bytes,符合 ADR-0001)。**服务端 `validateMessage` 不校验 SHA 长度/格式,仅检查非空**;SHA 格式校验(`isValidShaHex`)由 ESP32 固件在 callback 中执行;
- `reason` 字段为可选;若存在必须落在 `VALID_REASONS` 白名单内,否则视为非法消息。该字段从 `createSnapshot(..., { publishReason })` → `snapshot.publishReason` → `publication-service.publish` → `mqtt-notification-adapter` → `mqtt-publisher` → `mqtt-message` 全链路贯穿;
- ESP32 收到通知后只把 `frameId` / `snapshotId` 作为 refresh signal,立即执行正常 HTTP state/frame 刷新(见 §5)。`reason` 仅供设备侧日志/统计,不影响刷新行为。**ESP32 固件不校验 `reason` 白名单**,该责任由服务端承担。

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
