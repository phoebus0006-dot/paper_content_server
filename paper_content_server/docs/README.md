# NewsPhoto E-Paper 项目文档总索引

本目录是项目的正式需求、架构、技术、测试、审核、部署与重构基线。

## 文档优先级

1. `PRODUCT_REQUIREMENTS.md`：真实产品需求，最高优先级。
2. `ACCEPTANCE_CRITERIA.md`：可验收行为。
3. `SYSTEM_ARCHITECTURE.md`：目标系统架构。
4. `DOMAIN_MODEL.md`：领域模型与状态机。
5. `API_CONTRACT.md` 与 `MQTT_CONTRACT.md`：对外协议。
6. `NEWS_PIPELINE.md`：新闻抓取、翻译、去重、排版。
7. `IMAGE_LIBRARY_ARCHITECTURE.md`：双图库体系。
8. `CONTENT_SAFETY.md`：图片内容安全。
9. `RENDERING_AND_EPF1.md`：渲染与帧协议。
10. `DATA_STORAGE.md`：运行数据和持久化。
11. `TEST_STRATEGY.md`：测试体系。
12. `REVIEW_GUIDE.md`：独立审核方法。
13. `DEPLOYMENT_RUNBOOK.md`：NAS 部署。
14. `REFACTOR_ROADMAP.md`：分阶段大修计划。
15. `TRACEABILITY_MATRIX.md`：需求—代码—测试追踪矩阵。
16. `adr/`：关键架构决策。

## 项目核心原则

- 用户需求高于历史代码行为。
- MQTT 负责立即触发，HTTP state/frame 仍是唯一内容真相来源。
- 60 秒 polling 永久保留作为 fallback。
- 图片采用双图库：自动学习图库 + 用户自定义图库。
- 色情/NSFW 采取零容忍、fail-closed、删除策略。
- 新闻目标是 6 条高质量、独立、可读新闻，不允许 placeholder 凑数。
- 翻译先忠实，再验证，再中文编辑，再适配电子纸布局。
- 自动化测试通过不等于用户体验通过。
- 所有 Admin 发布必须走正式生产渲染、快照和帧链路。
