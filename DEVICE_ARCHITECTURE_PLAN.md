# DEVICE_ARCHITECTURE_PLAN.md — 多设备支持架构规划

> **状态**：完成  
> **日期**：2026-07-22  
> **目标**：评估并规划多电子纸设备（设备 A、设备 B、设备 C）并发管理架构  

---

## 1. 当前架构与多设备扩展评估

### 1.1 当前架构瓶颈
目前 v0.9.0-core-stable 为**单设备/全局单播模型**：
- 服务端仅维护一个全局 `activeSnapshot` 指针。
- 所有 ESP32 终端访问相同的 `/api/state.json` 与 `/api/frame.bin`。
- 无法满足“客厅显示新闻”、“书房显示写真”、“办公室显示日程”等多设备差异化内容推送需求。

### 1.2 扩展目标
支持多设备并发独立管理：
- **设备 A**（如 7.3 英寸客厅电子纸）：绑定新闻频道 (`news_channel`)。
- **设备 B**（如 7.3 英寸书房电子纸）：绑定写真频道 (`photo_channel`)。
- **设备 C**（如 5.65 英寸桌面电子纸）：绑定自定义频道或特定图库。

---

## 2. 设备注册与元数据设计 (Device Registry & Metadata Schema)

服务端将在 `/data/devices.json` 中维护设备注册表，支持以下核心数据字段：

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-07-22T21:40:00.000Z",
  "devices": {
    "ESP32_A0B1C2": {
      "deviceId": "ESP32_A0B1C2",
      "name": "Living Room Display",
      "macAddress": "A0:B1:C2:D3:E4:F5",
      "panelType": "7in3e",
      "resolution": "800x480",
      "group": "living_room",
      "assignedChannel": "news",
      "overrideSnapshotId": null,
      "lastSeenAt": "2026-07-22T21:39:50.000Z",
      "status": "ONLINE",
      "ipAddress": "192.168.1.105",
      "firmwareVersion": "v0.9.0-core",
      "activeFrameId": "manual-news-20260722-120000"
    },
    "ESP32_F5E4D3": {
      "deviceId": "ESP32_F5E4D3",
      "name": "Study Room Frame",
      "macAddress": "F5:E4:D3:C2:B1:A0",
      "panelType": "7in3e",
      "resolution": "800x480",
      "group": "study",
      "assignedChannel": "photo_gallery",
      "overrideSnapshotId": "snap-photo-20260722-150000",
      "lastSeenAt": "2026-07-22T21:38:12.000Z",
      "status": "ONLINE",
      "ipAddress": "192.168.1.108",
      "firmwareVersion": "v0.9.0-core",
      "activeFrameId": "photo-landscape-001"
    }
  }
}
```

---

## 3. 设备路由与 API 拓扑架构 (Routing & Protocol Architecture)

为保持向后兼容，API 设计分为**单设备兼容层**与**多设备路由层**：

```text
               +-------------------------------------------------------+
               |                  ESP32 Client Devices                 |
               +---------------------------+---------------------------+
                                           |
                       +-------------------+-------------------+
                       | HTTP GET / MQTT                       |
                       v                                       v
        +----------------------------+           +----------------------------+
        | Legacy Compatibility API   |           | Multi-Device API v2        |
        | /api/state.json            |           | /api/v2/devices/:id/state  |
        | /api/frame.bin             |           | /api/v2/devices/:id/frame  |
        +--------------+-------------+           +--------------+-------------+
                       |                                        |
                       +-------------------+--------------------+
                                           |
                                           v
                             +---------------------------+
                             |   DeviceRegistryService   |
                             +-------------+-------------+
                                           |
                                           v
                             +---------------------------+
                             |    PublicationService     |
                             |   (Channel & Multi-Frame) |
                             +---------------------------+
```

### 3.1 兼容层 API (Legacy Compatibility API)
- `GET /api/state.json` 与 `GET /api/frame.bin` 保持现有逻辑，指向系统默认设备组 (Default Group / Global Channel)。

### 3.2 多设备 API v2 (Multi-Device API)
- **设备心跳/状态更新**：`POST /api/v2/devices/:deviceId/heartbeat`
- **设备专属状态获取**：`GET /api/v2/devices/:deviceId/state.json`
- **设备专属帧数据获取**：`GET /api/v2/devices/:deviceId/frame.bin`
- **管理端设备绑定接口**：`POST /api/admin/devices/:deviceId/channel` (设定设备绑定的频道/快照)

### 3.3 MQTT Topic 隔离策略
- 广播 Topic（所有设备接收）：`epaper/broadcast/publication`
- 设备单播 Topic（仅指定设备接收）：`epaper/devices/{device_id}/publication`
- 设备心跳 Topic（设备上报）：`epaper/devices/{device_id}/heartbeat`

---

## 4. 实施阶段规划
- **Phase 2.1**：完成 `DeviceRegistryService` 数据存储与心跳 API（不改前端 UI 样式）。
- **Phase 2.4**：支持在后台绑定设备与频道，实现设备 A / B / C 独立帧渲染。
