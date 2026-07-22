# DEVICE_REGISTRY_IMPLEMENTATION.md — Phase 2.1 设备注册与心跳系统实施报告

> **项目**：电子纸内容生产与发布平台 (E-Paper Content Platform)  
> **阶段**：Phase 2.1 Implementation (Device Registry & Heartbeat System)  
> **基线版本**：v0.9.0-core-stable  
> **分支**：`feature/admin-ui-and-content-refinement`  
> **状态**：完成，测试 100% 通过  

---

## 1. 架构设计 (Architecture)

Phase 2.1 在 Backend 成功实现了完整的设备注册与心跳监测基础服务：

```text
               +-------------------------------------------------------+
               |                  ESP32 / Client Device                |
               +---------------------------+---------------------------+
                                           |
                                           | HTTP POST /api/v2/devices/:id/heartbeat
                                           v
                       +---------------------------------------+
                       |           Express / HTTP              |
                       |         Request Handler               |
                       +-------------------+-------------------+
                                           |
                                           v
                       +---------------------------------------+
                       |        DeviceRegistryService          |
                       |  - Dynamic Status Calculation         |
                       |  - Heartbeat & Upsert Logic           |
                       +-------------------+-------------------+
                                           |
                                           v
                       +---------------------------------------+
                       |              JsonStore                |
                       |     Atomic Persistence via tmp/fsync  |
                       +-------------------+-------------------+
                                           |
                                           v
                       +---------------------------------------+
                       |           data/devices.json           |
                       +---------------------------------------+
```

---

## 2. 数据结构设计 (Data Structure & Storage Schema)

所有设备元数据持久化存储于 `data/devices.json` 中，由 `JsonStore` 提供原子写入与恢复支持。

### `data/devices.json` Schema 示例:
```json
{
  "schemaVersion": 1,
  "devices": [
    {
      "deviceId": "esp32-livingroom",
      "name": "Device esp32-livingroom",
      "type": "esp32-epaper",
      "firmware": "v0.9.0-core",
      "ip": "192.168.1.101",
      "lastSeen": "2026-07-22T21:45:00.000Z",
      "status": "online",
      "capabilities": {},
      "currentFrame": "manual-news-20260722-120000",
      "contentMode": "news",
      "rssi": -65,
      "battery": 98
    }
  ]
}
```

---

## 3. API 列表与行为规格 (API Specifications)

### 3.1 `POST /api/v2/devices/:deviceId/heartbeat`
- **说明**：接收 ESP32 心跳包。自动更新 `lastSeen` 时间戳、IP 地址、固件版本、`currentFrame` 及 `contentMode`。自动将设备置为 `online`。
- **响应**：`{ "success": true, "device": { ... } }`

### 3.2 `GET /api/v2/devices`
- **说明**：查询全部设备列表。服务端动态根据 `now - lastSeen < 5分钟` 计算并返回最新的 `status` (`online` / `offline`)。
- **响应**：`{ "success": true, "devices": [ ... ] }`

### 3.3 `GET /api/v2/devices/:id`
- **说明**：查询单个指定设备的详细信息。若设备不存在，返回 HTTP 404 状态码。
- **响应 (200 OK)**：`{ "success": true, "device": { ... } }`
- **响应 (404 Not Found)**：`{ "success": false, "error": "DEVICE_NOT_FOUND", "message": "..." }`

---

## 4. 在线状态判定规则 (Status Calculation Rule)

- **Online 判定**：`now - lastSeen < 5 分钟 (300,000 ms)`
- **Offline 判定**：`now - lastSeen >= 5 分钟`
- **特性**：状态在每次查询 (`GET`) 或上报 (`POST`) 时依据系统当前时刻动态计算，无需依赖客户端主动断开连接上报。

---

## 5. 测试结果 (Test Verification Summary)

针对设备管理服务与 API 接口新增了全面自动化测试套件：
- `test/devices/device-registry-test.js`
- `qa/tests/unit/device-registry-test.js`

### 5.1 单元与集成测试结果 (`node --test`)
```text
▶ DeviceRegistryService — Unit Tests
  ✔ initial list is empty (4.5ms)
  ✔ register and heartbeat new device (3.4ms)
  ✔ heartbeat updates existing device without overwriting unchanged values (2.1ms)
  ✔ multi-device isolation (3.0ms)
  ✔ online / offline status calculation (> 5 mins is offline) (3.0ms)
  ✔ data persistence across service instances (1.4ms)
✔ DeviceRegistryService — Unit Tests (18.9ms)
▶ Device Registry HTTP API — Integration Tests
  ✔ POST /api/v2/devices/:deviceId/heartbeat registers and updates device (36.8ms)
  ✔ GET /api/v2/devices lists all devices (3.8ms)
  ✔ GET /api/v2/devices/:id gets single device (2.1ms)
  ✔ GET /api/v2/devices/:id returns 404 for unknown device (2.3ms)
✔ Device Registry HTTP API — Integration Tests (132.2ms)
ℹ tests 12 | pass 12 | fail 0
```

### 5.2 全套 Admin 测试基线验证 (`npm run admin:test`)
- **结果**：✅ **61/61 PASS + 全套 CIDR / LAN / CSRF / Network Policy 测试全部 100% 通过**，既有功能基线零退化。
