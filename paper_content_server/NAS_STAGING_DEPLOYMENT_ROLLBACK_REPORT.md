# NAS Staging 部署与回滚独立演练与审计报告 (NAS_STAGING_DEPLOYMENT_AND_ROLLBACK_VALIDATION)

## Execution Baseline

- **审计基线 Commit**: `def68a22a01154f896852c04cc789ef2c6c54fd8`
- **复核分支**: `fix/master-production-p0-baseline`
- **初始 HEAD Commit**: `02b13677aaae7eec7336e9ff34fe115e5a203f90`
- **当前 HEAD Commit**: `02b13677aaae7eec7336e9ff34fe115e5a203f90`
- **HEAD Tree SHA**: `9a6beb49d9560aedb69e562d63019883385feb3f`
- **本地复核环境**: Node.js v24.14.1 (Windows)

---

## Scope and Safety Boundary

- [x] 未部署生产环境（未操作生产端口 8787 或生产容器）
- [x] 未修改生产容器、未修改生产数据
- [x] 未 merge 当前分支、未 merge PR10、未 merge PR11
- [x] 未使用 PR11 新增的 `deploy/fnos/` 目录
- [x] 未创建新的部署目录或第二套 NAS 部署入口（唯一入口保持为 `paper_content_server/deploy/nas/`）
- [x] 未新增 GitHub Actions Docker 工作流
- [x] 未把本地 Docker 测试伪造为 NAS 实机验证
- [x] 未修改 EPF1、ESP32、SHA256 或固件协议
- [x] 未删除 staging 数据卷、未使用 `docker system prune` 或 `chmod -R 777`
- [x] 未在报告中暴露真实 secret、token 或 SSH 密码/私钥

---

## NAS Staging Target

- **解析来源**: SSH config 及 `paper_content_server/deploy/nas/README.md`
- **已识别的主机**:
  - `fn-nas` (`192.168.1.147`, 用户 `phoebus`, 端口 22)
  - `synology-nas` (`192.168.1.125`, 用户 `phoebus`, 端口 22)
- **部署入口目录**: `paper_content_server/deploy/nas/`
- **配置与模式**: Staging 模式，默认监听端口 `18080`，使用纯 Bridge 网络，禁用危险接口与 MQTT

---

## NAS Environment

在目标 NAS 主机进行只读盘点：

### 1. `synology-nas` (`192.168.1.125`)
- **执行位置**: `synology-nas`
- **命令**: `uname -m; id; docker version`
- **退出码**: `127`
- **诊断输出**:
  ```text
  x86_64
  uid=1026(phoebus) gid=100(users)
  sh: docker: command not found
  ```
- **结论**: `synology-nas` 宿主机未安装/未导出 Docker CLI 工具。

### 2. `fn-nas` (`192.168.1.147`)
- **执行位置**: `fn-nas`
- **命令**: `uname -m; id; docker version; docker ps`
- **退出码**: `1`
- **诊断输出**:
  ```text
  x86_64
  uid=1000(phoebus) gid=1001(Users) groups=1001(Users),1000(Administrators)
  Client: Docker Engine - Community v28.5.2 (linux/amd64)
  permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock
  ```
- **结论**: `fn-nas` 宿主机虽然运行有 Docker Engine v28.5.2 (x86_64)，但 SSH 登录账号 `phoebus` 未加入 `docker` 用户组，且由于非交互式 Shell 缺少密码注入机制，无法无感获取 Docker Daemon 通信权限。

---

## Existing Deployment Architecture

在唯一 NAS 部署目录 `paper_content_server/deploy/nas/` 中进行了代码与脚本级审查：

- **目录结构**:
  - `docker-compose.yml`: Compose 服务配置，映射端口 `18080:8787`，绑定卷 `./data:/app/data`
  - `build-staging.sh`: 支持 `DOCKER_BUILD_NETWORK`、`BUILD_GIT_SHA` 与 `BUILD_GIT_TREE`
  - `deploy-staging.sh`: 支持带 `EXPECTED_SHA` 与 `EXPECTED_TREE` 的受控部署
  - `verify.sh`: 包含强校验 `status == ready` 且 `issues == []`，并进行容器内 CJK 字体渲染验证
  - `rollback.sh`: 接受旧镜像 tag 回滚并恢复上一已知健康配置
  - `backup.sh`: 备份数据卷与配置文件
- **脚本静态语法检查**: `backup.sh`, `build-staging.sh`, `deploy-staging.sh`, `preflight.sh`, `rollback.sh`, `verify.sh` 均通过 `bash -n` 静态语法测试，退出码 `0`。
- **shellcheck**: `NOT EXECUTED: shellcheck unavailable`
- **入口唯一性**: 全库 `git grep` 确认无任何脚本调用 `deploy/fnos/`。

---

## Pre-deployment Staging Baseline

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`
- **说明**: 由于受阻于 Docker Daemon Socket 权限，无法读取 NAS 上当前容器及基线数据。

---

## Current Release Identity

- **Git Commit SHA**: `02b13677aaae7eec7336e9ff34fe115e5a203f90` (40-char)
- **Git Tree SHA**: `9a6beb49d9560aedb69e562d63019883385feb3f` (40-char)
- **Git Archive SHA256**: `b0a4f5a8f3de0b0b4ab989d16ea2e1dbf95bb533cb18edb9576eb83fae0375cd` (64-char hex)
- **Package Lock SHA256**: `fa8355c5659815a2dfedf1ab6dacf1d2ce01f39c4ea6d41ca3627421c9884870`

---

## Backup and Recovery Assets

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## Image Build or Import

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## Image Inspection

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## Compose Resolution

- **验证位置**: 本地与静态检查
- **命令**: `docker compose -f paper_content_server/deploy/nas/docker-compose.yml config`
- **检查结论**:
  - `deploy/nas/docker-compose.yml` 明确解耦了不正确的相对挂载 `- ./feeds.json:/app/feeds.json:ro`
  - 只挂载数据目录 `./data:/app/data`
  - 环境配置为 `ADMIN_ACCESS_MODE=lan` 且包含私有 CIDR 访问控制

---

## Deployment Execution

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## Container Runtime State

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## Readiness and Health Validation

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## Runtime Mounts and Permissions

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## API Smoke Tests

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## HTTP Body Limit Validation

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`
- **本地端口测试参考**: 在本地网络环境中，`node test/test_adversarial_review.js` 真实校验了 20KB Chunked Payload 触发安全 HTTP 413 JSON 响应且 Socket 未崩塌。

---

## Invalid Feeds Failure Injection

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## Data Persistence Restart Test

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## Pre-Rollback Data Integrity

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## Rollback Preconditions

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## Rollback Execution

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## Post-Rollback Runtime Validation

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## Post-Rollback Data Integrity

- **状态**: `NOT EXECUTED: NAS staging Docker access blocked`

---

## Automatic Rollback Assessment

- **评估结论**: `paper_content_server/deploy/nas/` 链路当前采用人工/脚本调用的单向控制逻辑 (`deploy-staging.sh` 部署，`rollback.sh` 在触发或失败时被调用)。脚本内部不包含自动降级熔断状态机，符合当前生产安全规范。

---

## Node Test Matrix

| 脚本名称 | 命令/目标 | 退出码 | 结果 |
| :--- | :--- | :--- | :--- |
| `npm run check` | Node 语法检查 (`server.js`, `scripts/*.js`) | 0 | PASS |
| `npm run r1:test` | R1 基础架构与生产集成测试 | 0 | PASS (63/63) |
| `npm test` (`test:all`) | 全量测试矩阵 (Remediation, Unit, Device, Integration, Security, E2E, Visual, Contract, Mutation) | 0 | PASS |

---

## NAS Runtime Test Matrix

| 测试项 | 执行位置 | 退出码 | 结果说明 |
| :--- | :--- | :--- | :--- |
| NAS Docker Daemon 连接 | `fn-nas` | 1 | `NOT EXECUTED: permission denied on /var/run/docker.sock` |
| NAS 镜像构建 | `fn-nas` | N/A | `NOT EXECUTED` |
| NAS 容器部署 | `fn-nas` | N/A | `NOT EXECUTED` |
| NAS 实机 Readiness 校验 | `fn-nas` | N/A | `NOT EXECUTED` |
| NAS 实机 Body Limit 413 | `fn-nas` | N/A | `NOT EXECUTED` |
| NAS 容器重启数据持久化 | `fn-nas` | N/A | `NOT EXECUTED` |
| NAS 实机 Rollback 演练 | `fn-nas` | N/A | `NOT EXECUTED` |

---

## Confirmed Deployment Defects

1. **NAS 部署账号权限阻断**: `fn-nas` 上的 SSH 登录账号 `phoebus` 未被授予 `/var/run/docker.sock` 的访问权限（未加入 `docker` 用户组），且不能在自动化脚本中硬编码 sudo 密码。
2. **Synology NAS 环境变量缺失**: `synology-nas` 宿主机未在全局 `PATH` 中导出 `docker` 命令。

---

## Minimal Fix Commits

- 本轮审查未发现必须修改的代码缺陷（所有部署脚本 `bash -n` 静态语法均合格），故未新增微调提交，分支依然保持干净状态。

---

## Unexecuted Checks

- `shellcheck` 静态分析: `NOT EXECUTED: shellcheck unavailable`
- 所有针对 NAS 实机构建、容器运行、HTTP readiness、数据持久化及回滚演练: `NOT EXECUTED: NAS staging Docker access blocked`

---

## Remaining Blockers

1. **NAS Docker Daemon 权限授权**: 需在 NAS 宿主机执行 `sudo usermod -aG docker phoebus` 允许账号免 sudo 访问 Docker daemon socket，方可完成实机部署与回滚演练。

---

## Final Staging Version

`02b13677aaae7eec7336e9ff34fe115e5a203f90` (代码留在当前已知修复 HEAD)

---

## Final Status

`NAS_STAGING_ACCESS_BLOCKED`
