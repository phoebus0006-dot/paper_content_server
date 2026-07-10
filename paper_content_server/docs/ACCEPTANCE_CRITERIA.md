# Acceptance Criteria

## Schedule
- [ ] 09:59 → photo mode
- [ ] 10:00 → photo mode with new slot
- [ ] 10:30 → news mode
- [ ] 10:59 → news mode
- [ ] 11:00 → photo mode with new slot
- [ ] 18:59 → news mode
- [ ] 19:00 → photo (night hold)
- [ ] 19:30 → photo (night hold, same image)
- [ ] 23:30 → photo (night hold, same image)

## EPF1 Frame
- [ ] Header = 10 bytes: "EPF1" + width(2) + height(2) + panel(1) + type(1)
- [ ] Payload = 192000 bytes
- [ ] Total = 192010 bytes
- [ ] High nibble = left pixel code, low nibble = right pixel code
- [ ] Allowed codes: 0, 1, 2, 3, 5, 6
- [ ] Code 4 count = 0

## State-Frame Coherence
- [ ] GET /api/state.json → frameId = A
- [ ] GET /api/frame.bin → X-Frame-Id = A
- [ ] Cross-slot pinning: state from old slot → slot boundary → frame request = same snapshot
- [ ] TTL: 29s = hit, 31s = miss

## ESP32 HTTP Contract
- [ ] Valid frame: accepted and displayed
- [ ] Short frame: rejected
- [ ] Oversize frame: rejected
- [ ] Wrong frame ID: rejected
- [ ] Missing X-Frame-Id: rejected
- [ ] Invalid palette code: rejected
- [ ] HTTP 500: rejected
- [ ] Busy timeout: reset
- [ ] Sleep timeout: wake and refresh

## News
- [ ] Count = 6
- [ ] Canonical URL unique = 6
- [ ] Normalized original title unique = 6
- [ ] Normalized final Chinese title unique = 6
- [ ] Duplicate article count = 0
- [ ] Placeholder count = 0
- [ ] Translation provider = none → foreign not eligible
- [ ] Translation verified → eligible
- [ ] Translation fails → rejected

## News Render
- [ ] 6 cards present
- [ ] Title ≤ 1 line
- [ ] Summary = 2 or 3 lines
- [ ] Summary font ≥ 18px
- [ ] Overflow = false
- [ ] Frame = 192010 bytes
- [ ] Code 4 = 0

## Image Library — Dual Architecture

### A. Learning Library
- [ ] LEARNING_AUTO_FETCH: Automatic source produces real learning candidates
- [ ] LEARNING_SAFETY: safetyStatus=safe required for production
- [ ] LEARNING_RELEVANCE: relevanceStatus=pass required
- [ ] LEARNING_QUALITY: technicalQualityStatus=pass required
- [ ] LEARNING_ELIGIBLE: Only fully eligible assets (safe + pass + pass) selectable
- [ ] LEARNING_RELEVANCE_REJECT: Broad NASA/landscape/architecture decorative content not admitted
- [ ] LEARNING_ROTATION: Multiple time slots produce different learning assets

### B. Custom Library
- [ ] CUSTOM_UPLOAD: User upload succeeds
- [ ] CUSTOM_SAFETY: Safety gate mandatory — unsafe/suspicious/uncertain deleted
- [ ] CUSTOM_SELECTABLE: Safe custom asset is selectable
- [ ] CUSTOM_ALBUM: Album/tag/specific asset selection works

### C. Source Isolation
- [ ] SOURCE_LEARNING: When source=learning, selectedCustomCount=0
- [ ] SOURCE_CUSTOM: When source=custom, selectedLearningCount=0
- [ ] NO_SILENT_FALLBACK: No silent cross-library fallback

### D. AUTO
- [ ] AUTO_SOURCE: AUTO photo source defaults to Learning Library

### E. ONE_SHOT
- [ ] ONESHOT_SOURCE: Explicit source (learning or custom)
- [ ] ONESHOT_EXPIRY: Expires automatically at next HH:00 or HH:30
  - 10:12 publish → expires 10:30
  - 10:42 publish → expires 11:00

### F. FOCUS_LOCK
- [ ] FOCUS_SOURCE: Explicit source or content scope
- [ ] FOCUS_SCHEDULE_PAUSED: Schedule paused until lock disabled
- [ ] FOCUS_CLOSE: Close restores current AUTO snapshot + MQTT refresh

## Admin Publication
- [ ] Manual news: draft → render → publish → state/frame same frameId
- [ ] Clear override: returns to schedule
- [ ] Rollback: restores previous publication
- [ ] Unknown ID: 404
- [ ] Not implemented: 501

## MQTT
- [ ] Publication → MQTT refresh signal → ESP32 checks HTTP → downloads frame
- [ ] MQTT failure → no impact on publication
- [ ] Burst: duplicate frameId debounced
- [ ] Reconnect: resubscribe + immediate state check
