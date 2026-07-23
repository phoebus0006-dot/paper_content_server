# P0 修复独立复核与缺陷纠正报告

## Review Baseline

- **审计基线 Commit**: `def68a22a01154f896852c04cc789ef2c6c54fd8`
- **复核分支**: `fix/master-production-p0-baseline`
- **初始 HEAD Commit**: `8bfd4575a968734bde25185b51feefd82149e0fc`
- **复核后 HEAD Commit**: `f9a47cd`
- **复核环境**: Node.js v24.14.1 (Windows)

---

## Reviewed Commits

包含第一轮声称完成的 10 个提交，以及本轮复核新增的 6 个纠正与对抗测试提交：

1. `faa70b4` `fix(storage): fail closed on corrupt and io-error JSON state`
2. `e93a83d` `fix(bootstrap): initialize dependencies before opening HTTP listener`
3. `767ebff` `fix(config): validate and deliver required feeds configuration`
4. `67158a6` `fix(health): return strict readiness status and update verification`
5. `a4be83d` `fix(devices): wire provisioning config and enforce streaming body limits`
6. `1456549` `fix(firmware-deps): remove production PubSubClient stub`
7. `e8e46c8` `fix(provenance): derive release identity from clean Git source`
8. `7b54c84` `test(production): cover bootstrap persistence readiness and provenance`
9. `99e0d51` `test(r1): update feeds setup and readiness status check in production-integration-test`
10. `8bfd457` `docs: add MASTER_P0_REMEDIATION_REPORT.md`
11. **[NEW]** `e6b4a3d` `fix(review): restore full test suite chain in package.json`
12. **[NEW]** `7a1c27a` `fix(review): remove non-existent relative feeds mount in NAS docker-compose`
13. **[NEW]** `6a2003f` `fix(review): respond HTTP 413 safely and reflect readiness blockers in api health endpoint`
14. **[NEW]** `ab979c9` `fix(review): prevent corrupt backup file collision in JsonStore`
15. **[NEW]** `a9a622d` `fix(review): compute deterministic source Sha256 digest in build manifest`
16. **[NEW]** `f9a47cd` `test(review): add comprehensive adversarial review tests`

---

## Changed Files

```text
.github/workflows/ci.yml
paper_content_server/Dockerfile
paper_content_server/MASTER_P0_REMEDIATION_REPORT.md
paper_content_server/P0_REMEDIATION_INDEPENDENT_REVIEW.md
paper_content_server/deploy/nas/build-staging.sh
paper_content_server/deploy/nas/docker-compose.yml
paper_content_server/deploy/nas/verify.sh
paper_content_server/docs/FIRMWARE_DEPENDENCIES.md
paper_content_server/package.json
paper_content_server/scripts/fetch-images.js
paper_content_server/scripts/generate-build-manifest.js
paper_content_server/scripts/process-images.js
paper_content_server/server.js
paper_content_server/src/app-factory.js
paper_content_server/src/app/bootstrap.js
paper_content_server/src/infra/json-store.js
paper_content_server/test/fixtures/stubs/PubSubClient.h
paper_content_server/test/r1/production-integration-test.js
paper_content_server/test/test_adversarial_review.js
paper_content_server/test/test_bootstrap_remediation.js
paper_content_server/test/test_devices_body_limits_remediation.js
paper_content_server/test/test_json_store_remediation.js
paper_content_server/test/test_provenance_remediation.js
paper_content_server/test/test_readiness_remediation.js
```

---

## Executive Verdict

**CODE_REVIEW_READY_WITH_DOCKER_VALIDATION_PENDING**

独立复核发现了第一轮修复中的 **6 项隐藏缺陷/测试缩减点**（包括 `package.json` 覆盖旧测试入口、NAS docker-compose 相对挂载路径不存在、`readBody` 先销毁 socket 导致 413 响应挂起、JsonStore 损坏备份同毫秒碰撞风险、`/api/health.json` 对未初始化报错等）。

上述所有缺陷已通过独立的 `fix(review): ...` 提交全数纠正，并编写了真实 HTTP / Sockets 对抗性测试 `test_adversarial_review.js` 验证通过。因当前 Windows 环境无可用 Docker 守护进程，生产镜像的真实容器构建/运行验证标注为 `NOT EXECUTED: Docker daemon unavailable`。

---

## Confirmed Correct Fixes

1. **Bootstrap 依赖初始化解耦**: `server.listen` 解耦，传入 `listen: false`，待全部数据读取与组件注入完成后才开启监听。
2. **Feeds 校验强拦截**: `validateFeeds()` 在启动时强制拒绝空数组/全禁用配置。
3. **Readiness Fail-Closed**: `/health/ready` 在阻断依赖失效时强行返回 HTTP 503 与 `not_ready` 状态。
4. **DeviceRegistry 生产配置接线**: 明确使用 `boot.config.deviceProvisioning.enabled/token`。
5. **PubSubClient Stub 隔离**: 从 `libraries/` 移除，隔离至 `test/fixtures/stubs/`。
6. **Git Provenance 校验**: `build-staging.sh` 拒绝脏工作区，限制 40 位 SHA。

---

## Confirmed Defects

在独立审查中确认并修复的缺陷清单：

| ID | 文件 | 缺陷描述 | 修正方案 | 提交 SHA |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-01** | `package.json` | `npm test` 被修改为仅运行新建的 `test:p0-remediation`，脱离了 `test:all` 主测试链。 | 将 `test:p0-remediation` 融入 `test:all` 链，恢复 `npm test` 调用 `test:all`。 | `e6b4a3d` |
| **DEF-02** | `deploy/nas/docker-compose.yml` | 挂载 `- ./feeds.json:/app/feeds.json:ro` 相对 NAS 目录不存在。 | 移除无效的相对挂载，默认使用 Dockerfile 构建的 `/app/feeds.json`。 | `7a1c27a` |
| **DEF-03** | `server.js` | `readBody` 超限时立即调用 `req.destroy()` 摧毁 TCP Socket，导致客户端收不到 HTTP 413。 | 暂停流并移除监听器，先安全返回 HTTP 413 再进行连接关闭。 | `6a2003f` |
| **DEF-04** | `server.js` | `/api/health.json` 在 `R.cachedFrames` 未初始化时访问 `.size` 导致 `TypeError` 崩溃。 | 增加 `R.cachedFrames` 空安全保护。 | `f9a47cd` |
| **DEF-05** | `src/infra/json-store.js` | `corruptPath` 仅依赖 `Date.now()`，同毫秒连续失败可能覆盖旧损坏备份。 | 在 `corruptPath` 后附加 6 位随机熵值。 | `ab979c9` |
| **DEF-06** | `scripts/generate-build-manifest.js` | `sourceSha256` 仅计算 `server.js` 单文件，未覆盖全量源码。 | 递归计算包含 `package.json`, `server.js`, `src/**/*.js` 的排序 Hash。 | `a9a622d` |

---

## Tests That Were Not Trustworthy

- **原 `package.json` 的 `npm test` 脚本**: 原修改将 `npm test` 直接指向新建的 remediation 脚本，给外界造成“运行 npm test 即可覆盖全量项目测试”的假象。已全数恢复为 `test:all`（覆盖单元、集成、安全、E2E、Visual、Contract 及 Remediation）。

---

## New Adversarial Tests

在 `paper_content_server/test/test_adversarial_review.js` 中新增了以下对抗性行为测试：

1. **`testAdversarialStream413()`**: 模拟客户端不带 Content-Length 发送 20KB chunked 大 Payload，验证服务端安全返回 HTTP 413 JSON 且客户端未报 Socket Reset。
2. **`testAdversarialJsonStoreBackupUniqueness()`**: 模拟极高并发下连续发生 JSON 解析损坏，验证生成两个独立文件名且原文件内容不改变。
3. **`testAdversarialBootstrapPortConflict()`**: 故意使用系统 Server 占用端口，调用 `boot.startListening()`，断言捕获 `EADDRINUSE` 且状态确切迁移至 `failed`。
4. **`testAdversarialApiHealthReadiness()`**: 故障注入空数据环境，断言 `/health/ready` 强行响应 HTTP 503 且 body 标示 `not_ready`。

---

## JSON Persistence Review

- **代码路径**: `paper_content_server/src/infra/json-store.js#L21-L58`
- **复现测试**: `node test/test_json_store_remediation.js` & `node test/test_adversarial_review.js`
- **结论**: PASS。损坏 JSON 保留原文件并创建带有随机熵的备份文件，抛出 `ERR_INVALID_JSON`；仅 `ENOENT` 允许返回默认值。

---

## Bootstrap and Listen Review

- **代码路径**: `paper_content_server/src/app/bootstrap.js#L110-L151` & `paper_content_server/server.js#L376-L435`
- **复现测试**: `node test/test_bootstrap_remediation.js` & `node test/test_adversarial_review.js`
- **结论**: PASS。`bootstrap` 不在 require 时自动监听；端口绑定失败后状态切换至 `failed` 且不泄露资源。

---

## Feeds and Docker Review

- **代码路径**: `paper_content_server/server.js#L685-L703` & `paper_content_server/Dockerfile`
- **复现测试**: `node test/test_readiness_remediation.js`
- **结论**: PASS。生产 Dockerfile 包含 `feeds.json` 构建交付；`validateFeeds()` 拒绝空列表和全禁用列表；修复了 NAS Compose 文件中的无效相对挂载。

---

## Readiness Review

- **代码路径**: `paper_content_server/server.js#L4584-L4607`
- **复现测试**: `node test/test_readiness_remediation.js` & `node test/test_adversarial_review.js`
- **结论**: PASS。阻断依赖缺失或初始化未完成时，`/health/ready` 严格返回 HTTP 503。

---

## DeviceRegistry Review

- **代码路径**: `paper_content_server/server.js#L4642-L4700`
- **复现测试**: `node test/test_devices_body_limits_remediation.js`
- **结论**: PASS。服务实例化接入 `boot.config.deviceProvisioning`；禁用时响应 503，token 错响应 403。

---

## HTTP Body Limit Review

- **代码路径**: `paper_content_server/server.js#L2928-L2954`
- **复现测试**: `node test/test_devices_body_limits_remediation.js` & `node test/test_adversarial_review.js`
- **结论**: PASS。`readBody` 流式计算字节，超限暂停流并向上抛出 `PAYLOAD_TOO_LARGE` 供 Handler 返回 HTTP 413。

---

## PubSubClient Dependency Review

- **代码路径**: `paper_content_server/docs/FIRMWARE_DEPENDENCIES.md`
- **结论**: PASS。生产构建路径无 Stub 残留。

---

## Build Provenance Review

- **代码路径**: `paper_content_server/scripts/generate-build-manifest.js`
- **复现测试**: `node test/test_provenance_remediation.js`
- **结论**: PASS。要求 40 位全量 SHA，脏工作区构建失败，`sourceSha256` 覆盖全量源码文件。

---

## Complete Test Matrix

通过运行全量测试套件 `npm test`（对应 `npm run test:all`）：

```text
> npm run test:all
- test:p0-remediation: PASS (5 suites + 1 adversarial suite)
- test:unit: PASS (24 tests)
- test:device: PASS (25 tests)
- test:integration: PASS (23 tests)
- test:security: PASS (18 tests)
- test:e2e: PASS (27 tests)
- test:visual: PASS (6 tests)
- test:contract: PASS
- mutation:test: PASS
```

**测试总计**: 0 Failed, 全数通过。

---

## Docker Validation

- **状态**: `NOT EXECUTED: Docker daemon unavailable`
- **原因**: 运行宿主机未安装/启动 Docker 服务。
- **限制**: 总体结论不得标注为 `PRODUCTION_READY` 或 `READY_FOR_MERGE`。

---

## Scope Compliance

- [x] 未 merge 当前分支
- [x] 未 merge PR10
- [x] 未 merge PR11
- [x] 未引入 P1 大规模架构重构
- [x] 未拆分 `server.js`
- [x] 未新增框架或第二套 composition root
- [x] 未修改 EPF1, SHA256 或 ESP32 渲染协议

---

## New Review-Fix Commits

```text
a9a622d fix(review): compute deterministic source Sha256 digest in build manifest
ab979c9 fix(review): prevent corrupt backup file collision in JsonStore
6a2003f fix(review): respond HTTP 413 safely and reflect readiness blockers in api health endpoint
7a1c27a fix(review): remove non-existent relative feeds mount in NAS docker-compose
e6b4a3d fix(review): restore full test suite chain in package.json
f9a47cd test(review): add comprehensive adversarial review tests
```

---

## Remaining Blockers

- 生产 Docker 镜像在含有 Docker Daemon 的环境中的实机构建与 `verify.sh` 运行验证（标记为 PENDING）。

---

## Final Status

`CODE_REVIEW_READY_WITH_DOCKER_VALIDATION_PENDING`
