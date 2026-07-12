# 测试策略

## 1. 层次

- unit
- integration
- contract
- production smoke
- ESP32 real-device validation

## 2. 允许 mock

- external HTTP transport；
- translation provider transport；
- clock；
- filesystem root；
- MQTT broker transport。

## 3. 禁止 mock

- production pipeline；
- news selector；
- library selector；
- layout algorithm；
- renderer；
- quantizer；
- EPF1 encoder。

## 4. 核心合同

### Schedule

时间边界。

### Operating Mode

AUTO / ONE_SHOT / FOCUS_LOCK。

### MQTT

immediate trigger / coalesce / reconnect / poll fallback。

### News

6 unique high-quality items / translation fidelity / last-good。

### Layout

title 1 line / summary 2–3 lines。

### Learning Library

auto fetch / rights / relevance / technical quality / rotation。

### Custom Library

upload / safety / explicit selection / source isolation。

### Safety

unsafe/suspicious/uncertain 必删且不可恢复。

### Render Modes

single / analysis / comparison / 2×2 sequence。

### Frame

192010 / code4=0 / state-frame coherence.

### Lifecycle

`lifecycle:test` (`node test/app/graceful-shutdown-test.js`) — SIGINT / SIGTERM / MQTT / concurrent-shutdown / timeout。

### Admin Config

`admin-config-validation-test.js` — lan / token / trust-proxy validation failures。

## 5. 测试纪律

禁止：

- `test(..., true)`；
- `ok(true)`；
- `every(() => true)`；
- `return true` 冒充断言；
- 测试复制生产算法；
- toy SVG 冒充生产 renderer；
- placeholder 6 条冒充新闻恢复；
- JS simulation 冒充 ESP32 runtime。
