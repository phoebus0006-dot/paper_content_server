# ADR-0004: Translation Fidelity Before Display Compression

**Status:** Accepted  
**Date:** 2026-07-10

## Context
Foreign news requires translation before display. Options: direct LLM → short text, or faithful translation → verification → compression.

## Decision
Translation is split into three stages: (1) faithful literal translation, (2) fidelity verification, (3) Chinese display compression. LLM must never produce final display text directly.

## Consequences
- Higher translation quality.
- Verification catches errors before they reach the device.
- More processing steps, but critical for accuracy.
- Cache key includes prompt version to invalidate old translations.
