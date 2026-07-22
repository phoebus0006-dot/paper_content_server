# ESP32_HEARTBEAT_PROTOCOL.md — ESP32 心跳与状态上报协议

> **状态**：完成  
> **日期**：2026-07-22  
> **协议版本**：v2.0 (Phase 2.1)  
> **注意**：本文档定义 ESP32 与服务端通信的心跳规范，暂不修改 `NewsPhoto_esp32wf.ino` 固件。  

---

## 1. 协议概述 (Overview)

ESP32 电子纸终端通过 HTTP `POST` 方式定期向服务端发送心跳包，用于：
1. **自动设备注册**：未登记的新设备首次发送心跳时自动注册。
2. **在线状态判定**：服务端刷新设备的 `lastSeen` 时间戳，只要 `lastSeen` 在 5 分钟内即判定为 `online`。
3. **健康与诊断度量**：上报 IP 地址、固件版本、WiFi 信号强度 (RSSI)、电池电量及当前电子纸展示的 `currentFrame` / `contentMode`。

---

## 2. API 接口定义 (HTTP API Specification)

### 2.1 接口信息
- **接口路径**：`POST /api/v2/devices/:deviceId/heartbeat`
- **请求头 (Headers)**：
  - `Content-Type: application/json`
  - `Accept: application/json`
  - *(可选)* `X-Device-Id: ESP32_A0B1C2`

### 2.2 请求 Payload 字段 (Request Body)

| 字段名 | 类型 | 必填 | 示例值 | 说明 |
| :--- | :--- | :---: | :--- | :--- |
| `firmwareVersion` | String | 是 | `"v0.9.0-core"` | ESP32 固件版本 |
| `ip` | String | 是 | `"192.168.1.105"` | 设备当前局域网 IP |
| `rssi` | Number | 否 | `-65` | WiFi 信号强度 (dBm) |
| `battery` | Number | 否 | `95` | 电池电量百分比 (0-100)，供电模式可传 null |
| `currentFrame` | String | 否 | `"manual-news-20260722-120000"` | 电子纸当前显示的 Frame ID |
| `contentMode` | String | 否 | `"news"` / `"photo"` | 当前显示的内容模式 |
| `capabilities` | Object | 否 | `{"width":800,"height":480}` | 设备硬件能力标识 |

#### 请求 Body 示例 JSON:
```json
{
  "firmwareVersion": "v0.9.0-core",
  "ip": "192.168.1.105",
  "rssi": -65,
  "battery": 95,
  "currentFrame": "manual-news-20260722-120000",
  "contentMode": "news"
}
```

### 2.3 响应 Payload 结构 (Response Body - 200 OK)

```json
{
  "success": true,
  "device": {
    "deviceId": "ESP32_A0B1C2",
    "name": "Device ESP32_A0B1C2",
    "type": "esp32-epaper",
    "firmware": "v0.9.0-core",
    "ip": "192.168.1.105",
    "lastSeen": "2026-07-22T21:45:00.000Z",
    "status": "online",
    "capabilities": {},
    "currentFrame": "manual-news-20260722-120000",
    "contentMode": "news",
    "rssi": -65,
    "battery": 95
  }
}
```

---

## 3. ESP32 固件对接参考 (C++ Implementation Guide)

后续阶段（Phase 3）升级 ESP32 固件时，可在主循环 `loop()` 或轮询任务中按如下伪代码发送心跳：

```cpp
// 建议心跳间隔：60 秒 发送一次
static unsigned long lastHeartbeatMs = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 60000;

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String deviceId = WiFi.macAddress();
  deviceId.replace(":", "");
  String url = String(CONTENT_BASE_URL) + "/api/v2/devices/" + deviceId + "/heartbeat";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String json = "{";
  json += "\"firmwareVersion\":\"v0.9.0-core\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"currentFrame\":\"" + lastFrameId + "\",";
  json += "\"contentMode\":\"" + currentMode + "\"";
  json += "}";

  int httpCode = http.POST(json);
  if (httpCode == HTTP_CODE_OK) {
    Serial.println("Heartbeat SUCCESS");
  } else {
    Serial.printf("Heartbeat HTTP %d\n", httpCode);
  }
  http.end();
}
```
