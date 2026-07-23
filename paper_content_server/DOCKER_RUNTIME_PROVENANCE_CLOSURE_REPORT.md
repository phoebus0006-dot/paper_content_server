# Docker 运行时与发布源身份闭环验证报告 (DOCKER_RUNTIME_AND_RELEASE_PROVENANCE_CLOSURE)

## Execution Baseline

- **审计基线 Commit**: `def68a22a01154f896852c04cc789ef2c6c54fd8`
- **复核分支**: `fix/master-production-p0-baseline`
- **初始 HEAD Commit**: `10661814d696abd6f1af8bd8dd188aca0234d595`
- **当前 HEAD Commit**: `8968dfe`
- **复核环境**: Node.js v24.14.1 (Windows)

---

## Docker Environment

- **Docker CLI / Daemon**: `NOT EXECUTED: Docker daemon unavailable`
- **退出码**: `1`
- **诊断输出**:
  ```text
  docker: The term 'docker' is not recognized as a name of a cmdlet, function, script file, or executable program.
  ```
- **结论**: 宿主机环境缺失 Docker 服务，无法在本地机器上发起实机 `docker build` 与容器化部署运行测试。

---

## Image Build Result

- **状态**: `NOT EXECUTED: Docker daemon unavailable`
- **原因**: 依赖 Docker 守护进程，本地环境不满足。

---

## Image Content Inspection

- **状态**: `NOT EXECUTED: Docker daemon unavailable`
- **静态 Dockerfile 审查结论**:
  - `Dockerfile` 采用三阶段构建 (`base`, `build`, `production`)。
  - 生产阶段以非 root 用户 `node` (`USER node`) 运行。
  - 工作目录为 `/app`。
  - 不包含 `.git` 或宿主机 `node_modules` (已被 `.dockerignore` 排除)。
  - 不包含测试日志或临时数据文件。
  - 构建层注入 `/app/feeds.json`。

---

## Runtime User and Permissions

- **状态**: `NOT EXECUTED: Docker daemon unavailable`
- **期望配置**:
  - 运行用户: `node` (uid 1000 / 非 0)
  - `/app/feeds.json`: 只读或可读
  - `/app/data`: `node` 用户可写

---

## Normal Startup Validation

- **状态**: `NOT EXECUTED: Docker daemon unavailable`

---

## Readiness Validation

- **状态**: `NOT EXECUTED: Docker daemon unavailable`

---

## Invalid Feeds Failure Injection

- **状态**: `NOT EXECUTED: Docker daemon unavailable`

---

## HTTP Body Limit Runtime Validation

- **状态**: `NOT EXECUTED: Docker daemon unavailable`
- **单元/集成层面验证**: `node test/test_devices_body_limits_remediation.js` 与 `node test/test_adversarial_review.js` 均已在真实 TCP / HTTP 端口上验证通过（流式超限安全响应 413）。

---

## Graceful Shutdown Validation

- **状态**: `NOT EXECUTED: Docker daemon unavailable`
- **单元/集成层面验证**: `node test/test_bootstrap_remediation.js` 已验证 `SIGTERM` 信号捕获、Socket 解绑与资源释放。

---

## Docker Compose Resolution

- **文件位置**: `paper_content_server/deploy/nas/docker-compose.yml` & `paper_content_server/docker-compose.yml`
- **基准校验**:
  - `deploy/nas/docker-compose.yml` 已移除不存在的相对挂载 `- ./feeds.json:/app/feeds.json:ro`，避免在 NAS 挂载路径错位。
  - 根目录 `docker-compose.yml` 保持包含 `./feeds.json` 与 `./data` 绑定挂载。

---

## verify.sh Validation

- **shellcheck**: `NOT EXECUTED: shellcheck unavailable`
- **语法检查**: `bash -n paper_content_server/deploy/nas/verify.sh`
- **逻辑审查**: `verify.sh` 已完成脚本重构，断言 HTTP `/health/ready` 返回 200，JSON 解析 `status == ready` 且 `issues == []`；同时要求 `EXPECTED_SHA` 与 `EXPECTED_TREE` 必须与 `docker inspect` 环境变量 40 位 SHA 保持精确比对。

---

## Git Source Identity

- **Commit SHA**: `8968dfe10776b92a2a0954b41a54fd3eb1e0bc66` (40-char)
- **Tree SHA**: `6253c072c4ebf94f6f4c45a770380d9d068cbff0` (40-char)

---

## Git Archive SHA256

- **Git Archive SHA256**: `b0a4f5a8f3de0b0b4ab989d16ea2e1dbf95bb533cb18edb9576eb83fae0375cd` (64-char hex)
- **提取方式**: `git archive --format=tar HEAD`
- **确定性说明**: 为已批准 Commit 对应完整代码库原生、确定性归档 SHA256，不包含 `.git`、untracked 文件或变动数据。

---

## Docker Build Context Identity

- **Docker Context SHA256**: `unavailable` (因为未在真实 Docker 环境下执行 buildx)

---

## Image Identity

- **Image ID**: `unavailable`
- **Image Digest**: `LOCAL_IMAGE_DIGEST_NOT_AVAILABLE_UNTIL_REGISTRY_PUSH`

---

## Runtime Manifest Validation

- **生成脚本**: `paper_content_server/scripts/generate-build-manifest.js`
- **测试证据**: `node test/test_provenance_remediation.js` (PASS)
- **包含字段**:
  ```json
  {
    "schemaVersion": 1,
    "gitCommit": "8968dfe10776b92a2a0954b41a54fd3eb1e0bc66",
    "gitTree": "6253c072c4ebf94f6f4c45a770380d9d068cbff0",
    "gitArchiveSha256": "b0a4f5a8f3de0b0b4ab989d16ea2e1dbf95bb533cb18edb9576eb83fae0375cd",
    "lockfileSha256": "...",
    "dockerContextSha256": "unavailable",
    "imageDigest": "unavailable",
    "dirty": false,
    "nodeVersion": "v24.14.1",
    "builtAt": "..."
  }
  ```

---

## Provenance Adversarial Tests

- **测试文件**: `paper_content_server/test/test_provenance_remediation.js`
- **涵盖场景**:
  1. 传入 12 位短 SHA 拒绝并抛错（退出码 1）；
  2. 传入 40 位 SHA 成功生成并注入 `gitCommit` 与 `gitArchiveSha256`；
  3. Dirty 工作区拒绝生成 release 产物。

---

## Complete Test Matrix

通过运行全量测试套件 `npm test`（调用 `npm run test:all`）：

| 脚本名称 | 对应命令/目标 | 退出码 | 状态 |
| :--- | :--- | :--- | :--- |
| `npm run test:p0-remediation` | 6 大 Remediation 与 Adversarial 测试集 | 0 | PASS |
| `npm run test:unit` | QA 单元测试与 Device 注册测试 | 0 | PASS |
| `npm run test:integration` | 服务集成测试与并发隔离 | 0 | PASS |
| `npm run test:security` | 路径安全与 Secret 扫描 | 0 | PASS |
| `npm run test:e2e` | 27 项端到端工作流测试 | 0 | PASS |
| `npm run test:visual` | 渲染标题与视觉测试 | 0 | PASS |
| `npm run test:contract` | 静态契约与断言测试 | 0 | PASS |
| `npm run mutation:test` | 7 项关键变异测试 (Killed 100%) | 0 | PASS |

---

## Files Changed

```text
paper_content_server/scripts/generate-build-manifest.js
paper_content_server/test/test_provenance_remediation.js
paper_content_server/DOCKER_RUNTIME_PROVENANCE_CLOSURE_REPORT.md [新建]
```

---

## New Commits

```text
8968dfe fix(provenance): use deterministic Git archive identity for release source
```

---

## Remaining Blockers

- 具备 Docker Daemon 环境的真实 Docker 镜像构建、非 root 用户运行与 `verify.sh` 实机验证（标记为 `DOCKER_VALIDATION_BLOCKED`）。

---

## Final Status

`DOCKER_VALIDATION_BLOCKED`
