# ADR-0001：MQTT 仅做刷新通知，HTTP 为内容真相来源

## Status
Accepted

## Decision

MQTT 只发送 refresh signal，不发送 frame。

ESP32 收到通知后立即执行正常 HTTP state/frame 刷新。

60 秒 polling 永久保留。

## Consequences

优点：

- 保留已有 HTTP 一致性链路；
- broker 故障时仍可恢复；
- frame transport 不重复实现。

代价：

- 需要 MQTT 与 HTTP 双连接；
- 需要去重、合并和 reconnect 逻辑。
