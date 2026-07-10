# ADR-0005: AUTO / ONE_SHOT / FOCUS_LOCK Operating Modes

**Status:** Accepted  
**Date:** 2026-07-10

## Context
The device needs to support both automated schedule and manual content control.

## Decision
Three modes: AUTO (follow schedule), ONE_SHOT_OVERRIDE (manual content shown immediately, auto-revert at next half-hour boundary), FOCUS_LOCK (manual content locked until released).

## Consequences
- Clear separation between temporary and permanent overrides.
- ONE_SHOT provides immediate feedback without persistent override risk.
- FOCUS_LOCK enables study mode where a single image is analyzed in depth.
- ESP32 identifies mode from state.json.
