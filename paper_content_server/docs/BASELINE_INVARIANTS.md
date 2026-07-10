# 不可破坏基线（Invariants）

任何重构、功能开发和部署都必须保持以下不变量。

## Hardware

- ESP32-S3；
- panel 49；
- 800×480；
- 现有 pins 不变。

## Device Refresh

- 60 秒 polling 永久保留；
- MQTT 只能增加即时性，不能替代 HTTP；
- MQTT failure 不阻塞正常 polling。

## Schedule

- 00–29 photo；
- 30–59 news；
- 19:00–次日10:00 夜间同图保持。

## Operating Modes

- ONE_SHOT 到下一半小时边界恢复；
- FOCUS_LOCK 必须显式关闭才恢复 AUTO。

## Frame

- EPF1 header=10；
- payload=192000；
- total=192010；
- high nibble left；
- low nibble right；
- allowed codes=0,1,2,3,5,6；
- code4=0。

## News

- final count=6；
- placeholder=0；
- duplicate=0；
- untranslated foreign=0；
- title 1 行；
- summary 2–3 行；
- 不编造。

## Libraries

- Learning Library 自动定向获取学习素材；
- Custom Library 用户上传；
- source isolation；
- no silent cross-library fallback。

## Safety

- suspicious/unsafe/uncertain 不可进入生产；
- 用户要求严格删除；
- 不保留 unsafe image bytes。

## Evidence

- 没有 NAS 证据不得写 production verified；
- 没有 ESP32 日志不得写 device PASS。
