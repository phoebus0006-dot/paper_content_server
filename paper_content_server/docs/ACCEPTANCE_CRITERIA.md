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

## Photo
- [ ] Approved + poolType=study_frames only selectable
- [ ] 1000 iterations: nonApproved=0, decorative=0, missingStatus=0
- [ ] Fallback study frames when no approved images
- [ ] At least 2 unique image IDs across 6 time slots

## Image Library — Dual Architecture
- [ ] LEARNING_LIBRARY_AUTO_FETCH: Sources produce real learning candidates
- [ ] LEARNING_RELEVANCE: Landscape/architecture/NASA excluded as learning content
- [ ] CUSTOM_LIBRARY_UPLOAD: User upload succeeds
- [ ] SOURCE_SELECTION_LEARNING: Learning selected → only learning images shown
- [ ] SOURCE_SELECTION_CUSTOM: Custom selected → only custom images shown
- [ ] NSFW_STRICT_DELETE_BOTH: Both libraries enforce zero-tolerance deletion
- [ ] LEARNING_ROTATION: Multiple time slots produce different learning images
- [ ] COMPARISON_PAIR: Storyboard/final shot pair displays both sides
- [ ] SEQUENCE_2x2: Sequence frames in correct order

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
