# 文档控制与优先级

## 1. 目的

本文件定义项目文档的权威性、变更顺序和“目标架构”与“当前实现”的区别，防止审查者把设计文档误认为已经实现的生产事实。

## 2. 文档类型

### Normative：规范性文档

用于定义“系统应该是什么”。

优先级从高到低：

1. PRODUCT_REQUIREMENTS.md
2. ACCEPTANCE_CRITERIA.md
3. DOMAIN_MODEL.md
4. API_CONTRACT.md
5. MQTT_CONTRACT.md
6. SYSTEM_ARCHITECTURE.md
7. 各 Pipeline / Safety / Rendering 文档
8. ADR

### Descriptive：描述性文档

用于记录“系统现在实际上是什么”。

包括：

- CURRENT_STATE_BASELINE.md
- CURRENT_IMPLEMENTATION_MAP.md
- KNOWN_INCIDENTS_AND_LESSONS.md
- Git commit history
- NAS production evidence
- ESP32 serial evidence

## 3. 冲突处理

当规范文档和当前代码冲突时：

- 不允许静默修改需求来迁就代码；
- 在 CURRENT_STATE_BASELINE.md 标记差距；
- 建立修复 Phase；
- 通过测试和审查后再更新状态。

## 4. 需求变更顺序

用户需求变化时，必须按顺序：

1. PRODUCT_REQUIREMENTS
2. ACCEPTANCE_CRITERIA
3. DOMAIN_MODEL / API / MQTT
4. SYSTEM_ARCHITECTURE / Pipeline
5. TRACEABILITY_MATRIX
6. 测试
7. 代码
8. NAS 部署
9. ESP32 真机验证

## 5. 审核纪律

任何文档中的“目标模块”“目标 API”“目标状态机”都不能被报告为已实现，除非：

- Git diff 显示真实实现；
- 自动化测试走真实生产路径；
- 必要时有 NAS 和 ESP32 证据。
