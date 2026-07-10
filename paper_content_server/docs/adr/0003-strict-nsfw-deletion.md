# ADR-0003：色情/NSFW 严格删除策略

## Status
Accepted

## Decision

任何 unsafe、suspicious 或 uncertain 图片：

- 删除图片字节；
- 清除所有派生文件；
- 清除 active/cache/snapshot references；
- 禁止 rollback；
- 只保留 tombstone metadata。

## Rationale

用户要求宁可错杀，不可漏放。
