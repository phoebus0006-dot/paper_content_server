# 项目治理与变更纪律

## 1. 文档优先

需求变化先改：

1. PRD；
2. Acceptance；
3. Architecture/Domain/Contracts；
4. Traceability；
5. 再改代码。

## 2. 禁止行为

- force push；
- amend；
- rebase 改写公开历史；
- empty commit；
- commit message 冒充实现；
- 手工修改生产 JSON 伪造成功；
- mock 冒充 production evidence；
- queued/created 冒充 completed；
- bulk delete 生产数据；
- 清空 queue；
- 无约束大规模 crawler；
- 输出 secrets；
- 修改已稳定 ESP32 pins；
- 修改 60 秒 polling；
- 修改 panel 49；
- 修改 EPF1；
- code4 输出。

## 3. 每阶段交付

必须包含：

- 实际 commit；
- diff stat；
- 测试；
- 未完成项；
- NOT VERIFIED 项；
- 无数据污染证明。
