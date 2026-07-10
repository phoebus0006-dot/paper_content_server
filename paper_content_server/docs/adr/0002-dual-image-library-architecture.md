# ADR-0002：双图库架构

## Status
Accepted

## Decision

系统同时保留：

1. Learning Library：自动定向抓取影视镜头与分镜学习素材；
2. Custom Library：用户上传和管理。

AUTO 图片时段默认 Learning Library。

手动发布和 FOCUS_LOCK 可以显式选择 Learning 或 Custom。

禁止 silent cross-library fallback。
