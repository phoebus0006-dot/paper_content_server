# Product Requirements

## 1. Product Identity

A 7.3-inch 6-color e-paper personal study and information screen.

**Core use cases:**
1. Study of excellent real-world film shots
2. Original storyboard study
3. Storyboard-to-final-shot relationship learning
4. Global high-quality news reading in Chinese
5. Admin manual control

## 2. Hardware

| Component | Specification |
|-----------|--------------|
| MCU | ESP32-S3 |
| Display | 7.3" Spectra 6 |
| Resolution | 800 x 480 |
| Panel index | 49 |
| Refresh | 60-second polling (permanent) + MQTT-triggered immediate refresh |

## 3. Frame Protocol (EPF1)

| Field | Size | Description |
|-------|------|-------------|
| Magic | 4 bytes | "EPF1" |
| Width | 2 bytes | uint16 LE (800) |
| Height | 2 bytes | uint16 LE (480) |
| Panel | 1 byte | 49 |
| Type | 1 byte | 1 (full frame) |
| Payload | 192000 bytes | Palette-encoded pixel pairs |
| **Total** | **192010 bytes** | |

**Palette:**
| Code | Color |
|------|-------|
| 0 | Black |
| 1 | White |
| 2 | Yellow |
| 3 | Red |
| 5 | Blue |
| 6 | Green |

Code 4 is unsupported and must not appear.

Each byte encodes two pixels: high nibble = left pixel, low nibble = right pixel.

## 4. Schedule

| Time | Mode |
|------|------|
| 10:00–10:29 | Photo |
| 10:30–10:59 | News |
| 11:00–11:29 | Photo |
| 11:30–11:59 | News |
| ... (repeating) | |
| 18:00–18:29 | Photo |
| 18:30–18:59 | News |
| 19:00–09:59 | Photo (night hold, same image) |

## 5. Operating Modes

| Mode | Description |
|------|-------------|
| AUTO | Follow schedule |
| ONE_SHOT_OVERRIDE | Manual content shown immediately, auto-revert at next HH:00 or HH:30 |
| FOCUS_LOCK | Manual content locked until released, schedule paused |

## 6. Image Library

Custom user upload only. No automatic crawling from NASA, Wikimedia, or external sources.

**Data types:** `film_still`, `storyboard`, `sequence_frame`

**Relations:** studySetId, pairRole (storyboard/final_shot), sequenceId + sequenceIndex

**Display modes:** Single frame, analysis card, storyboard vs final comparison, 2x2 sequence grid

## 7. NSFW Policy — ZERO TOLERANCE

| Classification | Action |
|---------------|--------|
| Safe | Keep |
| Suspicious | Delete (image bytes removed) |
| Unsafe | Delete |
| Uncertain | Delete |

Only tombstone metadata retained: contentHash, decision, reasonCode, deletedAt.

## 8. News

6 high-quality, independent, readable items per cycle.

**Requirements:**
- Canonical URL unique: 6/6
- Article identity unique: 6/6
- Final Chinese title unique: 6/6
- Duplicate article count: 0
- Placeholder count: 0

**Sources:** Global high-quality sources (Chinese, English, French, etc.)
**Final output:** Accurate, natural, concise, faithful Simplified Chinese.

## 9. Translation Pipeline

1. Faithful translation (literal)
2. Fidelity verification (subject, action, negation, numbers, currency, percentage, time, location, person, organization, unsupported claims)
3. Chinese display editing (concise, e-paper-optimized)
4. Layout fitting (title=1 line, summary=2-3 lines, no overflow)

Prohibited: LLM producing final short text directly without verification, padding with fabricated content, mechanical slicing.

## 10. Last-Good News

Overwritten only when:
- 6 valid items
- No duplicates
- No placeholders
- Translation passes verification

On live failure, invalid/duplicate/incomplete feed: use last-good.
Cold start without last-good: show system status page (not fake placeholders).
