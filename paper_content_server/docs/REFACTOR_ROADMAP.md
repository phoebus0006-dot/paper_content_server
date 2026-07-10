# 受控大修路线

## Phase 0：文档基线

- PRD
- Acceptance
- Architecture
- Domain
- API/MQTT
- Pipelines
- Safety
- Tests
- Review
- Deployment
- ADR

不改业务代码。

## Phase 1：Characterization Contracts

冻结当前正确行为：

- schedule；
- state/frame；
- EPF1；
- news；
- library；
- safety；
- operating modes；
- admin publication。

## Phase 2：基础设施

- config；
- clock；
- JsonStore；
- HTTP client；
- logger。

## Phase 3：Frame Core

- palette；
- quantizer；
- EPF1；
- validator。

## Phase 4：Snapshot 与 Operating Modes

- snapshot service；
- pin store；
- AUTO；
- ONE_SHOT；
- FOCUS_LOCK。

## Phase 5：MQTT

- notification-only；
- immediate refresh；
- polling fallback；
- reconnect。

## Phase 6：News Pipeline

- staged model；
- faithful translation；
- fidelity verification；
- dual dedupe；
- last-good；
- shared layout。

## Phase 7：Learning Library

- source adapters；
- rights gate；
- safety gate；
- relevance gate；
- technical quality；
- repository；
- rotation。

## Phase 8：Custom Library

- upload；
- safety；
- metadata；
- album/tag；
- explicit selector。

## Phase 9：Render Modes

- single；
- analysis card；
- comparison pair；
- 2×2 sequence。

## Phase 10：Admin

所有 Admin 动作接真实 services，不允许旁路。

## Phase 11：CI / NAS / Device

统一测试、部署、真机验收。
