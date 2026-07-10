# 阶段门禁标准

每个重构 Phase 必须满足同一套 Gate，防止一次性大改无法审查。

## Gate 0：Scope

- 明确本 Phase 允许修改的模块；
- 明确禁止修改的稳定模块；
- 明确验收条目。

## Gate 1：Diff

- 有真实代码 diff；
- 无空 commit；
- 无无关范围扩张；
- 无 runtime state；
- 无 secret。

## Gate 2：Tests

- 新测试走真实生产路径；
- 老回归测试不减少；
- 所有 exit code 明确；
- 失败不得标记为 pre-existing 后忽略。

## Gate 3：Contracts

对照：

- ACCEPTANCE_CRITERIA
- BASELINE_INVARIANTS
- TRACEABILITY_MATRIX

逐项证明。

## Gate 4：Production

需要部署的阶段必须：

- HEAD==origin/master；
- NAS version match；
- HTTP smoke；
- MQTT smoke（相关阶段）；
- frame validation。

## Gate 5：Device

涉及显示体验或刷新行为的阶段：

- ESP32 serial evidence；
- 用户视觉确认。

否则状态：

NOT VERIFIED。

## Gate 6：Reviewer Verdict

只有独立 reviewer：

APPROVE

后才进入下一 Phase。
