# 数据与持久化

## 1. 原则

源码与生产运行数据分离。

生产状态不得污染 Git worktree。

## 2. 建议结构

```text
runtime/
  news/
    cache/
    last-good/
    translation/
  library/
    learning/
      originals/
      processed/
      metadata/
    custom/
      originals/
      processed/
      metadata/
    tombstones/
  publication/
    snapshots/
    history/
    active/
  frame-cache/
```

## 3. JsonStore

统一：

- read；
- writeAtomic；
- unique temp file；
- schemaVersion；
- validation；
- corrupt backup；
- explicit errors。

区分：

- ENOENT；
- JSON_CORRUPT；
- SCHEMA_INVALID；
- IO_ERROR。

禁止 catch-all 后静默返回空数组。

## 4. Publication

原子顺序：

```text
build
→ validate
→ persist
→ activate
→ mqtt notify
```

## 5. Device Registry (`devices.json`)

管理电子纸终端设备的注册与实时心跳状态。持久化存储于 `data/devices.json`，遵循 JsonStore 原子写入规范。

### 数据字段 (Fields)
- `deviceId`: 设备唯一标识符 (如 MAC 地址 `ESP32_A0B1C2` 或 ID)。
- `name`: 设备可读名称 (默认 `"Device <deviceId>"` 或自定义名称)。
- `type`: 设备硬件类型 (默认 `"esp32-epaper"`)。
- `firmware`: 固件版本号 (如 `"v0.9.0-core"`)。
- `ip`: 设备局域网 IP 地址 (如 `"192.168.1.105"`)。
- `lastSeen`: 最后一次成功心跳的时间戳 (ISO 8601 格式)。
- `status`: 在线状态 (`"online"` / `"offline"`)，根据 `now - lastSeen < 5分钟` 动态计算。
- `capabilities`: 硬件能力描述对象。
- `currentFrame`: 电子纸当前展示的 Frame ID。
- `contentMode`: 电子纸当前显示的内容模式 (`"news"` / `"photo"`)。

### 设备生命周期 (Lifecycle)
1. **Register (注册)**：设备首次发送心跳包时自动写入注册表。
2. **Heartbeat (心跳)**：设备定期上报最新 `lastSeen`、`ip`、`firmware` 与 `currentFrame`，维持 `online` 状态。
3. **Offline Detection (离线判定)**：若 `now - lastSeen >= 5分钟 (300,000 ms)`，系统动态标记该设备状态为 `offline`。

