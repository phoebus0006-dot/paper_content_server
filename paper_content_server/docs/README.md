# NewsPhoto E-Paper 项目文档总索引

## START HERE

新审阅者请从 [INDEPENDENT_AUDIT_HANDOFF.md](INDEPENDENT_AUDIT_HANDOFF.md) 开始。

## 推荐阅读顺序

1. [INDEPENDENT_AUDIT_HANDOFF.md](INDEPENDENT_AUDIT_HANDOFF.md) — 项目概况与审查入口
2. [DOCUMENT_CONTROL.md](DOCUMENT_CONTROL.md) — 文档类型与优先级
3. [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) — 产品需求
4. [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 验收标准
5. [CURRENT_STATE_BASELINE.md](CURRENT_STATE_BASELINE.md) — 当前状态基线
6. [CURRENT_IMPLEMENTATION_MAP.md](CURRENT_IMPLEMENTATION_MAP.md) — 当前实现映射
7. [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) — 目标系统架构
8. [DOMAIN_MODEL.md](DOMAIN_MODEL.md) — 领域模型
9. [API_CONTRACT.md](API_CONTRACT.md) — HTTP API 契约
10. [MQTT_CONTRACT.md](MQTT_CONTRACT.md) — MQTT 契约
11. [NEWS_PIPELINE.md](NEWS_PIPELINE.md) — 新闻流水线
12. [IMAGE_LIBRARY_ARCHITECTURE.md](IMAGE_LIBRARY_ARCHITECTURE.md) — 双图库架构
13. [CONTENT_SAFETY.md](CONTENT_SAFETY.md) — 内容安全
14. [TEST_STRATEGY.md](TEST_STRATEGY.md) — 测试策略
15. [AUDIT_PROTOCOL.md](AUDIT_PROTOCOL.md) — 独立审查协议
16. [KNOWN_INCIDENTS_AND_LESSONS.md](KNOWN_INCIDENTS_AND_LESSONS.md) — 已知事故与教训
17. [BASELINE_INVARIANTS.md](BASELINE_INVARIANTS.md) — 不可破坏基线
18. [PHASE_GATE_STANDARD.md](PHASE_GATE_STANDARD.md) — 阶段门禁标准
19. [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) — 部署指南
20. [REFACTOR_ROADMAP.md](REFACTOR_ROADMAP.md) — 重构路线
21. [TRACEABILITY_MATRIX.md](TRACEABILITY_MATRIX.md) — 需求追踪矩阵

## 项目核心原则

- 用户需求高于历史代码行为。
- MQTT 负责立即触发，HTTP state/frame 仍是唯一内容真相来源。
- 60 秒 polling 永久保留作为 fallback。
- 图片采用双图库：自动学习图库 + 用户自定义图库。
- 色情/NSFW 采取零容忍、fail-closed、删除策略。
- 新闻目标是 6 条高质量、独立、可读新闻。
- 不允许 placeholder 凑数。
- 翻译先忠实，再验证，再中文编辑，再适配电子纸布局。
- 双图库 source selection 隔离，禁止 silent cross-library fallback。
- 自动化测试通过不等于用户体验通过。
