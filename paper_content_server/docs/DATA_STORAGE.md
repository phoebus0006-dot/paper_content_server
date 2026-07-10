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
