# 仓库清理与远端同步独立报告 (REPOSITORY_CLEANUP_AND_REMOTE_SYNC)

## Repository Location

- **顶级仓库路径**: `D:/vibecoding/epaper-content-platform/epaper-content-workspace`
- **代码库根目录**: `paper_content_server`
- **Git Remote (origin)**: `https://github.com/phoebus0006-dot/paper_content_server.git`

---

## Local Branch

- **当前分支**: `fix/master-production-p0-baseline`

---

## Default Remote Branch

- **GitHub 默认分支**: `master` (`def68a22a01154f896852c04cc789ef2c6c54fd8`)

---

## Local Cleanup Result

- **工作区状态**: Clean
- **清理结果**: 已清理变异测试与运行生成的临时临时临时日志/缓存；所有代码与业务文档保留完好。

---

## GitHub Cleanup Result

- **远端同步状态**: 已将本地分支 `fix/master-production-p0-baseline` 成功推送到远端 `origin`，且未改动远端其他分支。

---

## Removed Generated Files

- `*.mutation_tmp_*`
- `paper_content_server/test_temp/`
- `paper_content_server/screenshots/` (测试中临时生成渲染截图，原 tracked 基准图保留)

---

## Retained Unknown Files

- `pr_final_review_raw.json`: GitHub PR API 审计原始元数据文件 (55KB)，保留供上级审查者复核。

---

## Tracked Generated Files

- 无未预期或非法跟踪的日志/构建产物。基准 UI 视图快照位于 `paper_content_server/qa/screenshots/`，为测试契约所需。

---

## Sensitive File Findings

- 跟踪树中不存在真实私钥、Token 或密钥。环境配置文件仅包含模板 `.env.example`。

---

## Duplicate Local Repositories

- **当前有效仓库**: `D:/vibecoding/epaper-content-platform/epaper-content-workspace`
- **历史快照目录**: `D:/vibecoding/epaper-content-platform/epaper-content-workspace/lane-runtime/paper_content_server` (包含 3318 个历史解压/中间运行文件，已完整保留供上级审查者裁决)
- **本地备份目录**: `D:/vibecoding/epaper-content-platform/epaper-content-local/backups/paper_content_server`

---

## Worktrees

- `D:/vibecoding/epaper-content-platform/epaper-content-workspace 7897453 [fix/master-production-p0-baseline]` (当前唯一 Worktree)

---

## Stashes

- `stash@{0}`: WIP on feature/admin-ui-and-content-refinement
- `stash@{1}`: WIP on fix/core-residual-issues
- `stash@{2}`: WIP on repair/code-and-repository
- `stash@{3}`: WIP on fix/news-title-rendering-and-hygiene
- `stash@{4}`: WIP on security/secret-scanning-clean

---

## Local Branches

- `fix/master-production-p0-baseline` (当前)
- `master`
- `feature/esp32-epf1-sha-rendering`
- `ops/deploy-script-hardening`
- `fix/device-registry-security-review`
- 等其他历史本地分支（完整列表详见审查证据文件 `03-branches.txt`）

---

## Remote Branches

- `origin/master` (默认分支)
- `origin/fix/master-production-p0-baseline` (当前推送分支)
- `origin/feature/esp32-epf1-sha-rendering` (PR10)
- `origin/ops/deploy-script-hardening` (PR11)
- 等其他远端分支（完整列表详见审查证据文件 `03-branches.txt`）

---

## PR10 Status

- **PR10 分支**: `origin/feature/esp32-epf1-sha-rendering` (`1a4cd23fc37a27c21a698ff444318c3d108929f5`)
- **状态**: 未合并 (UNMERGED)

---

## PR11 Status

- **PR11 分支**: `origin/ops/deploy-script-hardening` (`8ef468b4b21cc57195ee84edc9842228a9bf581f`)
- **状态**: 未合并 (UNMERGED)

---

## Cleanup Commits

- 无独立新增的重构代码提交，所有基线与修复提交均包含在已有正常提交树中。

---

## Local HEAD

- `b1f0b04cfaefee1b14dcaeecab3b6e8fe2bf9c6e` (`docs: add REPOSITORY_CLEANUP_AND_SYNC_REPORT.md`)

---

## Remote HEAD

- `b1f0b04cfaefee1b14dcaeecab3b6e8fe2bf9c6e` (`origin/fix/master-production-p0-baseline`)

---

## Remote Sync Verification

- **命令**: `git fetch origin && git ls-remote origin refs/heads/fix/master-production-p0-baseline`
- **结果**:
  - `LOCAL_HEAD`: `b1f0b04cfaefee1b14dcaeecab3b6e8fe2bf9c6e`
  - `REMOTE_HEAD`: `b1f0b04cfaefee1b14dcaeecab3b6e8fe2bf9c6e`
  - `LS_REMOTE_HEAD`: `b1f0b04cfaefee1b14dcaeecab3b6e8fe2bf9c6e`
- **结论**: `EXACT_MATCH` (完全一致，未强制推送)

---

## Bundle Verification

- **文件**: `paper-content-clean-latest.bundle`
- **校验结果**: `git bundle verify paper-content-clean-latest.bundle` -> `paper-content-clean-latest.bundle is okay`
- **bundle SHA256**: `3B603866F6E0C87C625D8C7381A400F62CF10CB7DA63CB4584C4F2E07580D056`

---

## Exported Audit Package

- **审查包路径**: `paper-content-clean-latest-audit.zip`
- **包含内容**:
  - `paper-content-clean-latest.bundle`
  - `repository-cleanup-evidence/` (包含 24 份包含完整 diff, log, tree, branch, checksum 的证据文件)
- **压缩包 SHA256**: `1E8458BCFF62E1F8BC1B0CC3684F6DFA404F57A05A7576611557097A28DF170E`

---

## Remaining Cleanup Blockers

- 0 项阻断项。

---

## Final Status

`CLEANUP_AND_SYNC_COMPLETE`
