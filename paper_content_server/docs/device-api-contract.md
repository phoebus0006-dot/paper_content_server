# Device API Contract (v2)

> **版本**：v2.0  
> **更新时间**：2026-07-22  
> **基线**：Phase 2.1 (Device Registry & Heartbeat Foundation)  

---

## 1. 接口概述 (Overview)

Device API (v2) 为 ESP32 电子纸终端与管理端提供设备管理能力，包括设备自动注册、定期心跳更新、在线状态监测以及多设备状态查询。

---

## 2. 接口列表 (Endpoints)

### 2.1 心跳与设备注册 (POST Heartbeat)

- **URL**: `POST /api/v2/devices/:deviceId/heartbeat`
- **说明**: ESP32 设备通过此接口上报心跳包。如设备未注册，将自动完成注册。
- **Content-Type**: `application/json`

#### Request Body Schema
```json
{
  "type": "object",
  "properties": {
    "firmwareVersion": { "type": "string", "description": "固件版本号" },
    "ip": { "type": "string", "description": "设备局域网 IP 地址" },
    "rssi": { "type": "integer", "description": "WiFi 信号强度 (dBm)" },
    "battery": { "type": "integer", "description": "电池剩余电量 (0-100)" },
    "currentFrame": { "type": "string", "description": "当前显示的 Frame ID" },
    "contentMode": { "type": "string", "enum": ["news", "photo"], "description": "当前内容模式" },
    "capabilities": { "type": "object", "description": "设备能力标识" }
  }
}
```

#### Request 示例
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

#### Response Body Schema (200 OK)
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

### 2.2 查询全量设备列表 (GET Devices)

- **URL**: `GET /api/v2/devices`
- **说明**: 返回当前注册表中所有设备的状态列表。`status` 会根据 `now - lastSeen < 5分钟` 动态计算。

#### Response Body Schema (200 OK)
```json
{
  "success": true,
  "devices": [
    {
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
  ]
}
```

---

### 2.3 查询单台设备详情 (GET Single Device)

- **URL**: `GET /api/v2/devices/:id`
- **说明**: 根据 `:id` (即 `deviceId`) 查询指定设备的详细信息。

#### Response Body Schema (200 OK)
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

## 3. 错误响应与错误码 (Error Handling & Error Codes)

系统出现异常或未匹配设备时返回如下统一 JSON 结构：

#### 错误响应格式
```json
{
  "success": false,
  "error": "<ERROR_CODE>",
  "message": "<Human-readable error explanation>"
}
```

#### 常见错误码表

| HTTP 状态码 | Error Code | 描述 |
| :---: | :--- | :--- |
| **400** | `INVALID_DEVICE_ID` | `deviceId` 参数缺失或包含非法字符 (如 path traversal 字符) |
| **404** | `DEVICE_NOT_FOUND` | 查询的设备 ID 未在注册表中找到 |
| **500** | `INTERNAL_ERROR` | 服务器内部处理或文件读写异常 |
| **503** | `SERVICE_UNAVAILABLE` | `DeviceRegistryService` 未在系统中初始化 |
