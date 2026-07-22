# NEXT_PHASE_IMPLEMENTATION_PLAN.md — 下一阶段功能推进与开发计划

> **项目**：电子纸内容生产与发布平台 (E-Paper Content Platform)  
> **基线版本**：v0.9.0-core-stable  
> **当前状态**：PR #8 已合并，Admin UI 第一版重构完成，FnOS NAS Preview 部署验证成功  
> **重要声明**：**暂停 UI 视觉优化。不修改 admin.css 样式、页面布局、导航结构和卡片设计。本计划专注于核心 Backend 功能闭环与架构推进。**

---

## 1. 当前完成度评估 (Current Completion Status)

截至目前，系统已成功达成以下核心里程碑：

| 模块 / 维度 | 审查结论 | 完成细节 |
| :--- | :---: | :--- |
| **基础代码与稳定度** | ✅ 100% 达标 | 代码通过 Node.js `--check`，全套自动化测试 100% 通过（191+ 单元测试与 25 浏览器 Playwright 测试 PASS） |
| **新闻发布闭环** | ✅ 100% 闭环 | 支持新闻 `Draft` → `Review` → `Approve` → `Publish` 完整流转，带严格审签门控与原子事务回滚 |
| **图片/写真发布闭环** | ✅ 100% 闭环 | 支持素材上传、 Sharp 图像处理、Floyd-Steinberg 7色抖动与标准 192,010 字节 EPF1 帧合成与发布 |
| **Admin UI 访问控制** | ✅ 100% 达标 | 完成 LAN 局域网直接访问模式与 Token 校验模式兼容重构，去除了多余登录阻碍 |
| **FnOS NAS 容器部署** | ✅ 100% 验证 | 在飞牛 NAS (FnOS) Docker 环境部署成功，静态资源与预览能力正常 |

---

## 2. 缺失功能与优先级矩阵 (Missing Features & Priority Matrix)

经过全面审查，总结当前存在的缺失功能及其优先级安排：

### P0 — 核心功能闭环与设备管理基础 (Highest Priority)
1. **ESP32 设备注册与心跳 API**：
   - 缺失 `device_id` 注册表、心跳接收端点 (`/api/devices/:id/heartbeat`)、在线/离线状态监控与最后连接时间。
2. **写真素材状态与审核闭环**：
   - 写真流程缺少显性的审签/驳回状态流转，需补充写真素材库的状态标识与审核接口。

### P1 — 自动化与多设备架构 (Medium Priority)
3. **多设备通道与路由隔离**：
   - 评估当前单播 `/api/frame.bin` 架构，扩展 `DeviceRegistryService`，支持设备 A/B/C 分别绑定独立内容频道 (`/api/v2/devices/:id/frame.bin`)。
4. **自动化定时轮播引擎 (`TaskScheduler`)**：
   - 支持 RSS 定时抓取、定时发布时刻表 (Schedule Slots) 与写真自动轮播任务。

### P2 — NAS 存储治理与高级灾备 (Lower Priority)
5. **NAS 自动化打包备份与恢复**：
   - 落地 `/data` 目录规范，实现每日定时 zip/tar 数据备份与一键恢复脚本 `scripts/restore-data.js`。

---

## 3. 下一阶段开发顺序 (Next Phase Development Roadmap)

```text
  Phase 2.1: 设备管理与心跳 API
  (DeviceRegistryService + Heartbeat Endpoints)
              │
              ▼
  Phase 2.2: 自动化任务引擎与定时轮播
  (TaskScheduler + RSS Auto Fetch + Auto Rotation)
              │
              ▼
  Phase 2.3: 飞牛 NAS 持久化与灾难恢复机制
  (Data Backup Script + Restore Tooling)
              │
              ▼
  Phase 2.4: 多设备通道路由与分发
  (Multi-Device API v2 + Isolated Topics)
              │
              ▼
  Phase 3.0: 功能完整后的统一 UI 视效精细化优化 (Deferred)
```

---

## 4. 各阶段具体推进计划

### 阶段 2.1：设备管理与心跳 API 实施 (Phase 2.1)
- **目标**：不改 UI 视觉前提下，建立 Backend 设备注册与健康监测能力。
- **交付物**：
  - `src/devices/device-registry-service.js` (数据持久化至 `data/devices.json`)。
  - `POST /api/v2/devices/:deviceId/heartbeat` 接口。
  - `GET /api/admin/devices` 接口（提供设备在线状态、IP、固件版本、当前帧 ID 数据）。

### 阶段 2.2：自动化定时轮播引擎 (Phase 2.2)
- **目标**：实现无人值守的定时新闻拉取与写真自动切换。
- **交付物**：
  - `src/features/automation/task-scheduler.js` 引擎。
  - RSS 自动抓取与定时发布槽 (Schedule Slots) 配置。

### 阶段 2.3：NAS 存储持久化与灾备 (Phase 2.3)
- **目标**：实现飞牛 NAS 环境下的完整持久化与备份恢复闭环。
- **交付物**：
  - `scripts/backup-data.js` 每日定时打包。
  - `scripts/restore-data.js` 一键灾难恢复工具。
  - 详细交付文档 [NAS_STORAGE_PLAN.md](file:///d:/vibecoding/epaper-content-platform/epaper-content-workspace/paper_content_server/docs/NAS_STORAGE_PLAN.md)。

### 阶段 2.4：多设备支持扩展 (Phase 2.4)
- **目标**：支持设备 A (客厅)、设备 B (书房) 的独立帧分发。
- **交付物**：
  - `/api/v2/devices/:deviceId/state.json` 与 `/api/v2/devices/:deviceId/frame.bin`。
  - 详细设计文档 [DEVICE_ARCHITECTURE_PLAN.md](file:///d:/vibecoding/epaper-content-platform/epaper-content-workspace/paper_content_server/docs/DEVICE_ARCHITECTURE_PLAN.md)。

---

## 5. UI 视觉与布局优化声明

- **承诺**：在 Phase 2 核心 Backend 功能、设备管理、自动化与多设备支持完全闭环之前，**严格保持 UI 视觉与样式不动**。
- **UI 优化窗口**：将在 Backend 功能闭环并验证通过后，统一安排专门的 UI 视觉迭代。
