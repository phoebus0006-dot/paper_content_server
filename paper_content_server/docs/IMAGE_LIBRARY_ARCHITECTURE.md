# Image Library Architecture

## Overview

The system maintains two independent image libraries:

```
┌─────────────────────────────────────────────────────────────┐
│                    IMAGE SYSTEM                              │
├─────────────────────────┬───────────────────────────────────┤
│    LEARNING LIBRARY     │         CUSTOM LIBRARY            │
│    (Auto Acquisition)   │       (User Uploads)              │
├─────────────────────────┼───────────────────────────────────┤
│ Curated film sources    │ User-uploaded images              │
│ Storyboard categories   │ Personal study materials          │
│ Film frame sequences    │ Reference photos                  │
│ Public domain films     │ Custom collections                │
├─────────────────────────┼───────────────────────────────────┤
│ Safety Gate → Relevance → Quality → Rotation                │
│                         │                                   │
│ Display Source Selection (explicit user choice)             │
└─────────────────────────────────────────────────────────────┘
```

## 1. Learning Library — Automatic Acquisition

### Objective
Continuously collect film and storyboard learning materials with real educational value.

### Target Content
- Excellent real film shots (film_still)
- Original storyboard drawings (storyboard)
- Storyboard sequences (sequence_frame)
- Film frame sequences (sequence_frame)
- Storyboard-to-final-shot pairs

### Learning Topics
- Shot scale and framing
- Composition (rule of thirds, leading lines, depth)
- Character blocking and dialogue coverage (over-shoulder, two-shot, OTS)
- Negative space and foreground blocking
- Depth composition
- Silhouette and backlight
- Low-key lighting
- Ensemble blocking
- Color contrast
- Motion continuity and action matching

### Source Architecture
```
Source Adapter
  → Candidate Discovery
  → Source Metadata Validation
  → Rights Metadata Validation
  → Temporary Download
  → Decode Validation
  → NSFW Safety Gate (ZERO TOLERANCE)
  → Learning Relevance Gate
  → Technical Quality Check
  → Metadata Normalization
  → Learning Library Candidate
  → Production Eligibility
  → Rotation
```

### Relevance Gate
| Status | Action |
|--------|--------|
| pass | Enter Learning Library pipeline |
| reject | Excluded |
| uncertain | Excluded (never enters production) |

Relevance is determined by evaluating actual content and metadata — not by
assuming that a category name like "film" guarantees learning value.

### Update Policy
- Incremental fetch, small batches
- Dedup before download (URL, hash)
- Bounded storage
- Source rate limit respected
- Theme coverage balanced
- No broad crawler behavior

## 2. Custom Library — User Uploads

### Flow
```
User Upload
  → Decode Validation
  → NSFW Safety Gate (ZERO TOLERANCE)
  → safe → Custom Library Metadata → User Edit → Available for Display
  → unsafe/suspicious/uncertain → Immediate deletion
```

### Rules
- Same NSFW gate applies as Learning Library.
- Uploads do NOT bypass content safety.
- User edits metadata after safety clearance.
- Deletion removes all artifacts (renders, cache, history rollback).

## 3. Display Source Selection

Users must explicitly choose the source when publishing:

| Mode | Photo Source |
|------|-------------|
| AUTO (default) | Learning Library |
| ONE_SHOT_OVERRIDE | User-selected (learning or custom) |
| FOCUS_LOCK | User-specified source + optional filter |

### PHOTO_SOURCE_MODE
At minimum:
- `LEARNING_LIBRARY` — Only Learning Library assets
- `CUSTOM_LIBRARY` — Only Custom Library assets

No silent cross-library fallback.

## 4. Display Modes (shared by both libraries)

### SINGLE
One image fills the display.

### ANALYSIS_CARD
Image with overlay showing:
- Theme, shot type, composition notes
- Blocking, lighting, lesson tags
- Analysis note

### COMPARISON_PAIR
Side-by-side display:
- Left: Storyboard
- Right: Final shot
- Linked by studySetId + pairRole

### SEQUENCE_2X2
Four consecutive frames in a 2x2 grid:
- Ordered by sequenceIndex (1, 2, 3, 4)
- All from the same sequenceId
- Deterministic sort order

## 5. Safety — ZERO TOLERANCE (Both Libraries)

| Classification | Action |
|---------------|--------|
| Safe | Continue |
| Suspicious | Delete |
| Unsafe | Delete |
| Uncertain | Delete |

Deletion scope: raw, processed, thumbnail, temp download, derived render,
frame cache, snapshot cache, active publication reference, history rollback.

Retained: tombstone only (contentHash, source, decision, reasonCode, deletedAt).

## 6. Data Model

```javascript
{
  assetId: string,
  libraryType: 'learning' | 'custom',
  kind: 'film_still' | 'storyboard' | 'sequence_frame',
  sourceType: string,           // e.g. 'storyboard_category', 'film_still_category', 'user_upload'
  sourceName: string,
  sourceUrl: string,
  author: string,
  license: string,
  licenseUrl: string,
  rightsStatus: string,
  theme: string,
  lessonTags: string[],
  analysisNote: string,
  studySetId: string | null,
  pairRole: 'storyboard' | 'final_shot' | null,
  sequenceId: string | null,
  sequenceIndex: number | null,
  safetyStatus: 'safe' | 'unsafe' | 'suspicious' | 'uncertain',
  relevanceStatus: 'pass' | 'reject' | 'uncertain' | null,
  contentHash: string,
  processedPngPath: string,
  epfPath: string
}
```

## 7. Selection Strategy

### Learning Library
- Theme coverage balanced
- Recently-shown avoidance
- Sequence integrity preserved (never split a sequence)
- Study set integrity preserved
- Learning value score considered

### Custom Library
- User-controlled (specific asset, album, tag)
- Random within selected scope
- Safe-only enforced
- Deletion invalidates all references
