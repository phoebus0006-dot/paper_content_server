# DEVICE_REGISTRY_FINAL_REVIEW.md

## 1. 职责单一性审计 (Single Responsibility Verification)

经过严格代码审计，`DeviceRegistryService` (**`src/devices/device-registry-service.js`**) 仅负责以下核心能力：
- Device Identity (设备身份管理、token 认证与 Hash 存储)
- Heartbeat (设备心跳刷新与属性增量更新)
- Status (基于 `now - lastSeenAt < 5min` 的动态在线状态判定)
- Metadata Persistence (基于 `JsonStore` 架构的 schema v1 持久化存储)

**静态代码扫描确认**：
- 包含 `publish`: **`false`**
- 包含 `command`: **`false`**
- 包含 `mqtt`: **`false`**
- 包含 `scheduler`: **`false`**
- 包含 `rendering`: **`false`**

---

## 2. 依赖方向审计 (Dependency Direction Audit)

检查新增及修改模块依赖：

```text
[HTTP Router (server.js)] ───► [DeviceRegistryService]
[AppFactory (app-factory.js)] ───► [DeviceRegistryService]
```

**依赖判定结果**：
- **允许的依赖**：
  - `server.js` (API) ──► `DeviceRegistryService` (合规)
  - `app-factory.js` (AppFactory) ──► `DeviceRegistryService` (合规)
  - `load-config.js` (Config) ──► `deviceProvisioning` 配置声明 (合规)
- **禁止的依赖**：
  - `DeviceRegistryService` ──► `server.js` (**无依赖**)
  - `DeviceRegistryService` ──► `PublicationService` (**无依赖**)
  - `DeviceRegistryService` ──► `TaskScheduler` / `Scheduler` (**无依赖**)

---

## 3. 测试覆盖验证 (Test Coverage Verification)

在 `test/devices/device-registry-test.js` 中补齐并验证以下关键测试套件：

### A. 跨设备 Token 隔离测试 (Cross-Device Token Isolation)
- **场景**：Device A 成功注册并获取 `deviceTokenA`；Device B 成功注册并获取 `deviceTokenB`。
- **操作**：使用 `deviceTokenA` 访问 `POST /api/v2/devices/Device_B/heartbeat`。
- **断言**：返回 **HTTP 401 UNAUTHORIZED** (`error: "UNAUTHORIZED"`), 防止跨设备越权篡改。

### B. 并发心跳压力测试 (Concurrent Heartbeat Stress Test)
- **场景**：注册 10 台并发设备，并发发起 100 个心跳请求（每台设备 10 个并发心跳包）。
- **断言**：
  - 全部 Promise 顺利 resolve。
  - `devices.json` 磁盘数据结构合法，解析为标准 JSON。
  - `schemaVersion` 严格等于 `1`。
  - `devices.length === 10`，**零设备丢失 (Zero lost devices)**，**零数据损坏 (Zero file corruption)**。

---

## 4. `devices.json` 持久化 Schema 校验

`JsonStore` 持久化模板严格遵循如下 Schema 结构：

```json
{
  "schemaVersion": 1,
  "devices": [
    {
      "deviceId": "dev-01",
      "name": "dev-01",
      "type": "esp32-epaper",
      "firmwareVersion": "1.0.0",
      "observedIp": "127.0.0.1",
      "deviceReportedIp": "192.168.1.105",
      "rssi": -65,
      "battery": 90,
      "lastSeenAt": "2026-07-22T20:56:00.000Z",
      "createdAt": "2026-07-22T20:50:00.000Z",
      "updatedAt": "2026-07-22T20:56:00.000Z",
      "capabilities": {},
      "currentFrameId": null,
      "currentFrameSha256": null,
      "contentMode": "unknown",
      "credentialHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
  ]
}
```

---

## 5. 客户端字段规范 (Client Field Standardisation)

- **`deviceReportedIp`**：代表客户端上报的 IP 地址字段（客户端 Payload 白名单中保留 `deviceReportedIp` 及其兼容别名 `reportedIp`）。
- **`observedIp`**：代表服务端从 Socket 连接 (`req.socket.remoteAddress`) 提取的真实来源 IP，作为服务端生成字段单独录入。

---

## 6. GitHub PR & Actions 验证结果

- **PR Branch**: `fix/device-registry-security-review` ──► `master`
- **PR URL**: [https://github.com/phoebus0006-dot/paper_content_server/pull/9](https://github.com/phoebus0006-dot/paper_content_server/pull/9)
- **CI Run ID**: `29957228393`
- **CI Status**: `SUCCESS` (Test Job: PASS 2m55s / Docker Job: PASS 31s)

---

## 7. 最终审查结论 (Final Review Decision)

**APPROVED_FOR_MERGE**
