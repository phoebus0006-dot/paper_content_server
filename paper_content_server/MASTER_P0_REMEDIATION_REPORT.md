# MASTER 生产 P0 基线修复报告

## 执行基线

- **起止基线**: `def68a22a01154f896852c04cc789ef2c6c54fd8` (master 审计基线)
- **修复分支**: `fix/master-production-p0-baseline`
- **构建环境**: Node.js v24.14.1 (Windows)
- **PR10/PR11 状态**: 绝对未合并、未 cherry-pick

---

## 修改文件清单

1. `paper_content_server/src/infra/json-store.js`
2. `paper_content_server/server.js`
3. `paper_content_server/scripts/fetch-images.js`
4. `paper_content_server/scripts/process-images.js`
5. `paper_content_server/src/app/bootstrap.js`
6. `paper_content_server/src/app-factory.js`
7. `paper_content_server/Dockerfile`
8. `paper_content_server/docker-compose.yml`
9. `paper_content_server/deploy/nas/docker-compose.yml`
10. `paper_content_server/deploy/nas/verify.sh`
11. `paper_content_server/deploy/nas/build-staging.sh`
12. `paper_content_server/scripts/generate-build-manifest.js`
13. `.github/workflows/ci.yml`
14. `paper_content_server/package.json`
15. `paper_content_server/docs/FIRMWARE_DEPENDENCIES.md` [新建]
16. `paper_content_server/test/fixtures/stubs/PubSubClient.h` [新建/迁移]
17. `paper_content_server/test/test_json_store_remediation.js` [新建]
18. `paper_content_server/test/test_bootstrap_remediation.js` [新建]
19. `paper_content_server/test/test_readiness_remediation.js` [新建]
20. `paper_content_server/test/test_devices_body_limits_remediation.js` [新建]
21. `paper_content_server/test/test_provenance_remediation.js` [新建]
22. `libraries/PubSubClient/PubSubClient.h` [删除]

---

## P0-01 JSON 持久化修复

- **原问题**: `readJson()` 捕获所有异常并静默返回 fallback，将非法 JSON、权限错误与 I/O 错误误当成文件不存在，导致启动后以空状态运行并可能破坏性覆盖原损坏文件。
- **实际修改**:
  - `paper_content_server/src/infra/json-store.js`: 仅当错误为 `ENOENT` / `ERR_NOT_FOUND` 时允许返回默认值；当遇到 `INVALID_JSON` 时，保留原文件并复制备份为 `.corrupt-<timestamp>`，抛出 `ERR_INVALID_JSON` 异常；权限错误与 I/O 错误抛出 `ERR_IO`。
  - `paper_content_server/server.js`: 统一 `readJson(filePath, fallback)` 调用 `store.readOrDefault(fallback)`，不再吞掉 `INVALID_JSON` 和 `ERR_IO` 异常。
  - `scripts/fetch-images.js`, `scripts/process-images.js`: 统一使用 `JsonStore` 的错误语义。
- **测试证据**:
  - 测试文件: `test/test_json_store_remediation.js`
  - 命令: `node test/test_json_store_remediation.js`
  - 退出码: `0`
- **剩余风险**: 无。

---

## P0-02 Bootstrap 修复

- **原问题**: HTTP 服务器开启监听 (`server.listen`) 发生于数据加载、feeds 校验、DeviceRegistry 及 Snapshot 初始化之前，导致客户端可能访问半初始化应用。
- **实际修改**:
  - `paper_content_server/src/app/bootstrap.js`: 引入显式生命周期状态 (`starting`, `ready`, `failed`, `stopping`)；提供 `startListening()` 延迟监听能力；若初始化或监听失败，确保状态为 `failed` 且不残留监听端口。
  - `paper_content_server/server.js`: 初始化时传入 `listen: false`，待目录检查、JSON 数据加载、feeds 校验、DeviceRegistry 接线与快照预加载全部完成后，再调用 `await boot.startListening(PORT)`。
  - `paper_content_server/src/app-factory.js`: 消除与 `loadConfig` 不一致的独立接线。
- **测试证据**:
  - 测试文件: `test/test_bootstrap_remediation.js`
  - 命令: `node test/test_bootstrap_remediation.js`
  - 退出码: `0`
- **剩余风险**: 无。

---

## P0-03 Feeds/配置交付修复

- **原问题**: Docker 生产阶段未复制 `feeds.json`，缺失时服务静默降级为 `[]` 并假健康。
- **实际修改**:
  - `paper_content_server/Dockerfile`: 在 production 阶段添加 `COPY --from=build /app/feeds.json ./`。
  - `deploy/nas/docker-compose.yml`: 补充挂载 `- ./feeds.json:/app/feeds.json:ro`。
  - `paper_content_server/server.js`: 增加 `validateFeeds(feeds)`，强校验 feeds 存在、为合法 JSON 数组且至少包含 1 个启用的 feed。
- **测试证据**:
  - 测试文件: `test/test_bootstrap_remediation.js`, `test/test_readiness_remediation.js`
  - 命令: `node test/test_readiness_remediation.js`
  - 退出码: `0`
- **剩余风险**: 生产环境若外部只读挂载了全空的 `feeds.json` 将在启动时直接拒绝并返回 503，符合 fail-closed 原则。

---

## P0-04 Readiness 修复

- **原问题**: `/health/ready` 在阻断性依赖失效时仍返回 HTTP 200 `status: degraded`；`verify.sh` 仅检查 HTTP 200。
- **实际修改**:
  - `paper_content_server/server.js`: 当存在阻断依赖失效（Bootstrap未完成、SnapshotStore不可用、DeviceRegistry未初始化、Feeds配置非法）时，`/health/ready` 强行返回 **HTTP 503**，且 body 包含 `status: "not_ready"` 与结构化 `issues` 数组。`/api/health.json` 当有阻断问题时返回 `status: "not_ready"` 并标注 `deprecated: true`。
  - `deploy/nas/verify.sh`: 解析 `/health/ready` body JSON，断言 `status == ready` 且 `issues` 数组为空。
  - `.github/workflows/ci.yml`: 修改 Docker CI 步骤，等待 `/health/ready` 而非 legacy 接口。
- **测试证据**:
  - 测试文件: `test/test_readiness_remediation.js`
  - 命令: `node test/test_readiness_remediation.js`
  - 退出码: `0`
- **剩余风险**: 无。

---

## P0-05 DeviceRegistry 接线修复

- **原问题**: `load-config.js` 已解析 `deviceProvisioning.enabled/token`，但 `server.js` 实例化 `DeviceRegistryService` 时未传入；`app-factory.js` 另建接线逻辑。
- **实际修改**:
  - `paper_content_server/server.js`: 严格传入 `boot.config.deviceProvisioning.enabled` 和 `boot.config.deviceProvisioning.token` 给 `DeviceRegistryService`。
  - `paper_content_server/src/app-factory.js`: 统一使用 `loadConfig` 导出的配置。
- **测试证据**:
  - 测试文件: `test/test_devices_body_limits_remediation.js`
  - 命令: `node test/test_devices_body_limits_remediation.js`
  - 退出码: `0`
- **剩余风险**: 无。

---

## P0-06 Body 限制修复

- **原问题**: 先检查 Content-Length Header，随后无上限读取完整 body，最后才判断字节数，chunked 请求可无上限耗尽内存。
- **实际修改**:
  - `paper_content_server/server.js`: 重构 `readBody(req, limit)` 助手函数，在 `req.on('data')` 监听器中流式统计字节数。当超过 `limit`（设备注册与心跳接口为 `16384`）时，立即 `req.destroy()` 并抛出 `PAYLOAD_TOO_LARGE` 异常，响应 HTTP 413。JSON 解析错误返回 HTTP 400 (`INVALID_JSON`)。
- **测试证据**:
  - 测试文件: `test/test_devices_body_limits_remediation.js`
  - 命令: `node test/test_devices_body_limits_remediation.js`
  - 退出码: `0`
- **剩余风险**: 无。

---

## P0-07 PubSubClient Stub 处理

- **原问题**: 仓库中存在 `libraries/PubSubClient/PubSubClient.h` stub，Arduino 构建可能误选中此假实现。
- **实际修改**:
  - 从 `libraries/` 移除 `PubSubClient.h`；
  - 迁移至 `paper_content_server/test/fixtures/stubs/PubSubClient.h` 并添加禁止生产引用的警告头；
  - 新建 `paper_content_server/docs/FIRMWARE_DEPENDENCIES.md` 明确锁定 `knolleary/PubSubClient@2.8`。
- **测试证据**:
  - 文件检查: `git status` 确认 `libraries/PubSubClient` 已删除，新建测试 Fixture 与文档。
- **剩余风险**: 无。

---

## P0-08 Build Provenance 修复

- **原问题**: `build-staging.sh` 依赖调用方传入 arbitrary commit/tree SHA，并强行硬编码 `BUILD_DIRTY=false`。
- **实际修改**:
  - `deploy/nas/build-staging.sh`: 自动通过 `git rev-parse HEAD`、`git rev-parse HEAD^{tree}` 和 `git status --porcelain` 提取真实 Git commit、tree 与 dirty 状态。脏工作区默认直接构建失败，禁止伪造 `BUILD_DIRTY=false`。
  - `scripts/generate-build-manifest.js`: 校验 `BUILD_GIT_SHA` 必须为 40 位完整 SHA，计算并包含 `sourceSha256`。
- **测试证据**:
  - 测试文件: `test/test_provenance_remediation.js`
  - 命令: `node test/test_provenance_remediation.js`
  - 退出码: `0`
- **剩余风险**: 无。

---

## 测试执行结果

在当前工作区成功执行完整的 P0 修复测试集与核心集成测试：

```bash
npm test
```

输出日志：
```text
> paper-content-server@1.0.0 test
> npm run test:p0-remediation

> paper-content-server@1.0.0 test:p0-remediation
> node test/test_json_store_remediation.js && node test/test_bootstrap_remediation.js && node test/test_readiness_remediation.js && node test/test_devices_body_limits_remediation.js && node test/test_provenance_remediation.js

PASS: JsonStore remediation tests
[INFO] NewsPhoto content server listening on port 18787
PASS: Bootstrap remediation tests
[INFO] NewsPhoto content server listening on port 18789
PASS: Readiness remediation tests
[INFO] NewsPhoto content server listening on port 18790
PASS: Devices & Body Limits remediation tests
PASS: Provenance remediation tests
```

运行 `npm run check && npm run r1:test`：
- `check`: PASS
- `r1:test`: 41 passed, 0 failed

---

## 未执行的验证

- `NOT EXECUTED: Docker daemon unavailable` (当前 Windows宿主机环境未安装/启动 Docker 守护进程，无法直接运行 `docker build` / `docker run`。已完成 `Dockerfile` 与 shell 脚本的静态检查与逻辑验证)。
- `NOT EXECUTED: Reproducible ESP32 toolchain unavailable` (当前宿主环境无 `arduino-cli` 固件编译链，已按规程创建 `FIRMWARE_DEPENDENCIES.md` 依赖声明并移除歧义 Stub)。

---

## 失败测试

- 无。所有本地执行的测试均 100% 通过。

---

## 范围核对

- [x] 未 merge PR10
- [x] 未 merge PR11
- [x] 未 cherry-pick PR10/PR11 完整提交
- [x] 未新增 `deploy/fnos/`
- [x] 未创建第二套部署入口
- [x] 未引入 Express/Fastify/NestJS/ORM/MQ 框架
- [x] 未大规模重构 `server.js` 路由
- [x] 未创建第二套 composition root
- [x] 未吞掉 JSON 解析或权限异常
- [x] 未修改 EPF1 二进制协议与 ESP32 SHA 逻辑

---

## 未处理问题

- 无阻断性生产 P0 问题。后续优化事项（如管理后台全量路由拆分、真实 NAS 自动部署发布状态机）留待后续阶段推进。

---

## 提交列表

```text
7b54c84 test(production): cover bootstrap persistence readiness and provenance
e8e46c8 fix(provenance): derive release identity from clean Git source
1456549 fix(firmware-deps): remove production PubSubClient stub
a4be83d fix(devices): wire provisioning config and enforce streaming body limits
67158a6 fix(health): return strict readiness status and update verification
767ebff fix(config): validate and deliver required feeds configuration
e93a83d fix(bootstrap): initialize dependencies before opening HTTP listener
faa70b4 fix(storage): fail closed on corrupt and io-error JSON state
```

---

## 是否建议进入下一阶段

**READY_FOR_REVIEW**

master 生产 P0 基线 8 大核心问题已全部修复完成，补充了有效测试并保留了可复核证据。
