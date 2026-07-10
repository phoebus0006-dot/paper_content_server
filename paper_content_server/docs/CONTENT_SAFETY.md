# Content Safety

## NSFW Policy — ZERO TOLERANCE

| Classification | Action |
|---------------|--------|
| Safe | Keep |
| Suspicious | Delete |
| Unsafe | Delete |
| Uncertain | Delete |

User requirement: "Better to delete a false positive than miss an unsafe image."

## Deletion Scope

When an image is deleted for safety reasons:

| Artifact | Removed? |
|----------|----------|
| Raw upload | Yes |
| Processed PNG | Yes |
| Thumbnail | Yes |
| Derived render | Yes |
| Frame cache entry | Yes |
| Snapshot cache entry | Yes |
| Active reference | Yes |
| History rollback reference | Yes |

## Retained Metadata (Tombstone)

Only the following is kept:
- contentHash
- decision (suspicious/unsafe/uncertain)
- reasonCode
- deletedAt

No image bytes are retained after deletion.
