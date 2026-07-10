# ADR-0001: MQTT Notification Only, HTTP Source of Truth

**Status:** Accepted  
**Date:** 2026-07-10

## Context
The device needs to refresh when new content is published. Options: MQTT-only, HTTP-only, or hybrid.

## Decision
MQTT is used exclusively for notification signals. HTTP is the sole source of truth for state and frame data.

## Consequences
- MQTT failure never affects publication success.
- 60-second polling is the permanent fallback.
- MQTT payload is lightweight (frameId + snapshotId only).
- ESP32 must always verify against HTTP after receiving MQTT.
