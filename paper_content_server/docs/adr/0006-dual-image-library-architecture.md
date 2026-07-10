# ADR-0006: Dual Image Library Architecture

**Status:** Accepted
**Date:** 2026-07-10

## Context

The system needs a steady supply of film-study learning materials while also
allowing users to control their own content. Two approaches exist: fully automatic
acquisition or fully manual uploads.

## Decision

Maintain two independent libraries:

1. **Learning Library** — Targeted automatic acquisition of film stills, storyboards,
   and sequence frames from curated sources. All candidates pass safety, relevance,
   and quality gates.
2. **Custom Library** — User-managed uploads. Same safety gate applies.

Users explicitly select which library to display from when publishing.
AUTO photo mode defaults to Learning Library.

## Consequences

- Learning Library provides continuous fresh study material.
- Custom Library gives users full control over personal content.
- Safety gate protects both libraries equally.
- Display source selection is explicit and auditable.
- More complex architecture, but necessary for both goals.
