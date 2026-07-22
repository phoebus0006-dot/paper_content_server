# CONTENT_PIPELINE_AUDIT.md — 内容发布流程与设备管理审查报告

> **状态**：完成  
> **日期**：2026-07-22  
> **基线版本**：v0.9.0-core-stable  

---

## 1. 设备管理模块审查 (Device Management Module Audit)

### 1.1 现状检查结果
通过对 ESP32 固件代码 (`NewsPhoto_esp32wf.ino`) 及服务端核心架构 (`server.js`, `admin-state-service.js`) 的审计，当前设备通信机制与状态跟踪情况如下：

| 检查项 | 实现状态 | 当前实现方式 / 说明 |
| :--- | :---: | :--- |
| **ESP32 设备注册** | ❌ 缺失 | 设备无独立注册流程，固件直接请求全局 `/api/state.json` 与 `/api/frame.bin` |
| **在线状态** | ⚠️ 部分 | 仅能在 MQTT 客户端连接层感知到单个连接，无法判定具体的 ESP32 在线/离线状态 |
| **心跳机制 (Heartbeat)** | ❌ 缺失 | 固件未发送带 `device_id` 的心跳包；服务端无心跳接收与超时判定逻辑 |
| **最后连接时间** | ⚠️ 部分 | 全局 `mqttClient` 记录 `lastSeen`，但无针对具体设备 MAC/ID 的最后连接时间 |
| **当前 Frame 监控** | ✅ 已实现 | 服务端 `admin-state-service` 可记录当前全局激活的 `frameId` 与 `frameSha256` |
| **当前 ContentMode** | ✅ 已实现 | 服务端可准确跟踪全局 `contentMode` (`news` / `photo`) |

### 1.2 缺失功能需求清单 (Device Management Requirements List)
为实现多设备接入与设备健康诊断，需建立以下 Backend 需求（**不修改前端 UI 视觉**）：

1. **设备身份标识 (`device_id`)**：
   - 固件在 HTTP Request Header (如 `X-Device-Id: ESP32_A0B1C2`) 或 MQTT Client ID 中携带设备 MAC 地址/UUID。
2. **设备注册表与持久化 (Device Registry Service)**：
   - 服务端建立 `DeviceRegistryService`，存储至 `data/devices.json`。
3. **心跳 API 与在线判定 (Heartbeat & Status)**：
   - 提供 `POST /api/devices/:id/heartbeat` 接口，接收设备上报的心跳参数（IP 地址、固件版本、电池/信号强度、当前渲染的 `frameId`）。
   - 心跳超时（如 > 5 分钟未收到心跳）自动判定为 `OFFLINE`。
4. **管理端 API 支持**：
   - 提供 `GET /api/admin/devices` 返回设备列表、在线状态、最后连接时间与当前画面状态。

---

## 2. 内容发布流程审查 (Content Production Pipeline Audit)

### 2.1 新闻发布链路 (News Pipeline Audit)
链路：`Draft` (草稿) → `Review` (审核) → `Approve` (批准) → `Publish` (发布) → `frame.bin` (设备显示)

- **Draft 阶段**：`POST /api/admin/news/draft` 支持提交 6 条新闻项目，写入草稿缓存。
- **Review & Approve 阶段**：`POST /api/admin/news/review`（Action: `approve-all`）更新新闻条目为已审核状态。
- **审签拦截门控 (Review Gate)**：
  - 测试验证：未通过审核直接调用发布，服务端拦截并返回 HTTP 409 状态码及 `NEWS_REVIEW_REQUIRED` 错误。
  - 审核通过后调用发布，正常通过门控。
- **Publish 阶段**：`POST /api/admin/news/publish` 触发 `PublicationService` 的原子发布事务：
  - 保存快照 → 激活快照指针 → 校验回读 SHA256 → 追加历史记录 → MQTT 广播通知。
  - 产出标准 192,010 字节 EPF1 二进制帧。
- **结论**：新闻发布链路已形成严格闭环，包含审签门控与事务回滚保护。

### 2.2 图片/写真发布链路 (Photo Pipeline Audit)
链路：`Asset` (素材) → `Recipe` (裁剪/渲染算法) → `Preview` (预览) → `Publish` (发布) → `frame.bin` (设备显示)

- **Asset 阶段**：通过 `POST /api/admin/photos/upload` 上传本地图片，或从图库挑选素材，存入 `data/library_state.json`。
- **Recipe 阶段**：Sharp 图像处理引擎执行 800x480 缩放、7色抖动算法（Floyd-Steinberg）及 EPF1 编码。
- **Preview 阶段**：服务端支持渲染并返回图像预览，提供 Admin 界面展示。
- **Publish 阶段**：调用 `POST /api/admin/photos/publish` 将指定图片快照激活并发布至全局帧缓存。
- **结论**：图片发布链路可顺利从素材生成 `frame.bin` 并进行最终发布。

### 2.3 闭环确认与现状总结
- ✅ 从素材/新闻输入到生成标准 192,010 字节 EPF1 `frame.bin` 的**完整闭环已经跑通**。
- ⚠️ 待优化点：写真上传目前跳过了多人审签步骤，下一阶段可为写真引入与新闻类似的显性 `review / approve` 状态机制。

---

## 3. 审查结论
当前核心内容生产与发布管道逻辑完整、状态一致性高、单元/集成/突变测试 100% PASS。下一阶段重点在于推进**设备管理**与**多设备通道隔离**。
