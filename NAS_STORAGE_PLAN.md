# NAS_STORAGE_PLAN.md — 飞牛 NAS 存储架构与持久化方案

> **状态**：完成  
> **日期**：2026-07-22  
> **基线环境**：FnOS NAS (Docker 部署)  

---

## 1. 飞牛 NAS 挂载路径规划 (FnOS Storage Layout)

在飞牛 NAS (FnOS) 部署环境中，保证**源码与生产运行数据完全隔离**。通过 Docker 卷挂载将宿主机持久化目录绑定至容器内 `/app/data`。

### 挂载映射配置 (Docker Compose / FnOS Application Management)
```yaml
volumes:
  - /vol1/1000/docker/epaper-content-platform/data:/app/data
```

### 规范目录结构 (`/data`)
```text
/data
├── assets/                  # 媒体素材目录
│   ├── custom/              # 用户手动上传图片 (raw 原图 & processed 800x480)
│   ├── learning/            # 精选/自动抓取的图库素材
│   └── tombstones/          # 已删除素材软归档
├── news/                    # 新闻数据与排版缓存
│   ├── rss_cache.json       # RSS 抓取原始响应缓存
│   ├── news_cache.json      # 新闻格式化条目缓存
│   └── last_good_news.json  # 最新可用新闻兜底快照
├── frames/                  # 二进制帧与快照归档
│   ├── active_pointer.json  # 当前激活快照指针 (snapshotId / frameId)
│   └── snapshots/           # 历史快照文件存储 (*.snapshot.json & *.bin)
├── history/                 # 核心发布日志与审计轨
│   └── publication_history.json # 统一发布历史记录
└── backups/                 # 自动/手动备份归档
    ├── daily/               # 每日定时自动备份 (.tar.gz)
    └── manual/              # 手动备份归档
```

---

## 2. 数据持久化与一致性保障 (Data Persistence Guarantees)

为避免 FnOS 容器重启或宿主机意外断电导致 JSON 数据损坏，系统严格遵守以下原则：

1. **JsonStore 原子写入 (Atomic File Write)**:
   - 所有 JSON 状态更新必须采用临时文件 + 同步落盘 + 原子重命名逻辑：
     `写临时文件 .tmp -> fs.fsync() -> fs.renameSync() -> 替换目标文件`。
2. **坏文件自我修复与回退 (Corruption Recovery)**:
   - 若出现 JSON 语法损坏，自动将坏文件更名为 `.corrupt.<timestamp>` 并触发告警。
   - 系统自动从上一次一致的快照 (`last_good_news.json` / `active_pointer.json`) 进行读取恢复，绝不因文件读写抛错导致服务崩溃。
3. **EPF1 二进制帧完整性校验**:
   - 二进制帧保存时计算 SHA256 散列值。
   - 读取与发布前验证魔数 `EPF1` 及帧大小（严格等于 192,010 字节）。

---

## 3. 备份与灾难恢复策略 (Backup & Disaster Recovery Plan)

### 3.1 自动化定时备份 (Scheduled Backup Script)
- **定时任务**：每日凌晨 03:00 触发 `scripts/backup-data.js`。
- **打包范围**：`/data/assets`, `/data/news`, `/data/history`, `/data/frames/active_pointer.json`。
- **归档格式**：`epaper-backup-YYYYMMDD-HHMMSS.tar.gz` 存储至 `/data/backups/daily/`。
- **保留策略 (Retention Policy)**：
  - 每日备份：保留最近 7 天。
  - 每周备份：保留最近 4 周。

### 3.2 灾难恢复流程 (Disaster Recovery Runbook)
当发生 NAS 磁盘损坏或数据丢失时：
1. 在 FnOS 中重新拉取并启动容器。
2. 运行一键恢复指令：
   ```bash
   node scripts/restore-data.js --archive=/data/backups/daily/epaper-backup-latest.tar.gz
   ```
3. 服务端重载 `JsonStore` 状态，`PublicationService` 校验激活指针，系统瞬间恢复正常运行。
