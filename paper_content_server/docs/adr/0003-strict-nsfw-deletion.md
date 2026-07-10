# ADR-0003: Strict NSFW Deletion — No Quarantine Recovery

**Status:** Accepted  
**Date:** 2026-07-10

## Context
When NSFW content is detected, options: quarantine with review, or immediate deletion.

## Decision
Any image classified as suspicious, unsafe, or uncertain is immediately deleted. Only tombstone metadata is retained.

## Consequences
- Zero tolerance policy enforced.
- No recovery from quarantine.
- All derived artifacts (renders, cache entries) are also deleted.
- Tombstone prevents re-upload of the same content.
