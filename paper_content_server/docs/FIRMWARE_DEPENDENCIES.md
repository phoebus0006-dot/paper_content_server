# ESP32 Firmware Dependencies Specification

## 1. Overview
This document specifies the exact library dependencies, core versions, and build requirements for compiling production firmware (`NewsPhoto_esp32wf`).

> [!WARNING]
> Stub implementations (e.g. `PubSubClient.h` mocks) are strictly confined to `paper_content_server/test/fixtures/stubs/` and MUST NEVER be placed in production Arduino search paths (`libraries/`).

## 2. Production Libraries

| Library Name | Official Source | Locked Version | Purpose |
| :--- | :--- | :--- | :--- |
| **PubSubClient** | `knolleary/PubSubClient` (ID: 89) | `2.8` | MQTT client protocol handling |
| **ArduinoJson** | `bblanchon/ArduinoJson` (ID: 64) | `6.21.3` | JSON payload serialization / deserialization |
| **HTTPClient** | ESP32 Core Built-in | Included in Core `2.0.11+` | HTTP image and snapshot downloads |
| **WiFi** | ESP32 Core Built-in | Included in Core `2.0.11+` | WiFi network connectivity |

## 3. Core & Toolchain Requirements

- **ESP32 Arduino Core**: `2.0.11` (or ESP-IDF `v4.4.x` base)
- **Board Target**: `ESP32 Dev Module` / `ESP32-WROOM-32`
- **Partition Scheme**: `Huge APP (3MB No OTA / 1MB SPIFFS)`

## 4. Verification Status

- **Host Firmware Build Verification**: `NOT EXECUTED: Reproducible ESP32 toolchain / arduino-cli not installed in build container`
- **Dependency Manifest Gate**: Active. Build processes must resolve official `knolleary/PubSubClient@2.8`.
