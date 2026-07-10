# 当前状态基线

> 本文件用于记录“当前真实状态”，不是目标架构。每个阶段完成后更新一次。

## 1. 状态标签

只允许：

- IMPLEMENTED_AND_VERIFIED
- IMPLEMENTED_NOT_PRODUCTION_VERIFIED
- PARTIAL
- NOT_IMPLEMENTED
- BLOCKED
- UNKNOWN

## 2. 当前项目硬约束

- ESP32-S3；
- 7.3-inch Spectra 6；
- 800×480；
- panel 49；
- 现有 SPI pins 不变；
- 60 秒 HTTP polling 保留；
- EPF1 total=192010；
- palette codes=0,1,2,3,5,6；
- code4 禁止。

## 3. 当前功能状态表

审查者必须根据最新 Git、NAS 和真机证据填写，禁止从目标文档推断。

| Capability | Status | Evidence Commit | Test Evidence | NAS Evidence | ESP32 Evidence |
|---|---|---|---|---|---|
| Schedule | UNKNOWN | | | | |
| State/frame coherence | UNKNOWN | | | | |
| ESP32 frame validation | UNKNOWN | | | | |
| News live fetch | UNKNOWN | | | | |
| News translation fidelity | UNKNOWN | | | | |
| News final dedupe | UNKNOWN | | | | |
| News layout | UNKNOWN | | | | |
| Last-good | UNKNOWN | | | | |
| Learning Library auto-fetch | UNKNOWN | | | | |
| Learning relevance gate | UNKNOWN | | | | |
| Custom Library | UNKNOWN | | | | |
| Strict NSFW deletion | UNKNOWN | | | | |
| Analysis Card | UNKNOWN | | | | |
| Comparison Pair | UNKNOWN | | | | |
| Sequence 2×2 | UNKNOWN | | | | |
| ONE_SHOT_OVERRIDE | UNKNOWN | | | | |
| FOCUS_LOCK | UNKNOWN | | | | |
| MQTT immediate refresh | UNKNOWN | | | | |
| Admin production-path publication | UNKNOWN | | | | |

## 4. 更新规则

每次状态变化必须同时记录：

- commit SHA；
- 测试名称与 exit code；
- NAS 版本 SHA；
- HTTP 实际结果；
- ESP32 状态，若没有真机证据必须写 NOT TESTED。

禁止写：

“全部完成”

而没有逐项证据。
