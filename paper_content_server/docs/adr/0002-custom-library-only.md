# ADR-0002: Custom Library Only — No Automatic External Crawling

**Status:** Superseded by ADR-0006  
**Date:** 2026-07-10

## Context
The system needs images for study. Options: automatic crawl from Wikimedia/NASA/etc., or custom user uploads.

## Decision
Only custom user uploads enter the production library. No automatic external crawling.

## Supersession
This ADR is superseded by ADR-0006 (Dual Image Library Architecture).
The system now maintains both a Learning Library (targeted auto-acquisition)
and a Custom Library (user uploads), rather than custom-only.

## Consequences
- Higher quality control.
- No risk of inappropriate content from external sources.
- Requires user effort to populate library.
- Existing Wikimedia integration sources (photo_sources.json) are reviewed for removal or isolation.
