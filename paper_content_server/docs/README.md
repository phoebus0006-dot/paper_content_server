# Paper Content Server — Documentation

## Navigation

### 1. Product Requirements
[PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md)
Complete product specification: hardware, schedule, operating modes, news,
image library, safety, and translation requirements.

### 2. Acceptance Criteria
[ACCEPTANCE_CRITERIA.md](./ACCEPTANCE_CRITERIA.md)
Verifiable checklists for every requirement. Used for QA and release gate.

### 3. System Architecture
[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)
Target module structure, current vs target architecture comparison.

### 4. Domain Model
[DOMAIN_MODEL.md](./DOMAIN_MODEL.md)
Data types and production eligibility rules for all entities.

### 5. API & MQTT Contracts
[API_AND_MQTT_CONTRACT.md](./API_AND_MQTT_CONTRACT.md)
Current (legacy) and target REST API contracts. MQTT behavior rules.

### 6. Image Library Architecture
[IMAGE_LIBRARY_ARCHITECTURE.md](./IMAGE_LIBRARY_ARCHITECTURE.md)
Dual-library design: Learning Library (auto acquisition) and Custom Library (user uploads).
Display source selection, safety, display modes, and data model.

### 7. Storyboard Library
[STORYBOARD_LIBRARY.md](./STORYBOARD_LIBRARY.md)
Storyboard as a content type within the Learning Library. Comparison pairs and sequences.

### 8. Content Safety
[CONTENT_SAFETY.md](./CONTENT_SAFETY.md)
Zero-tolerance NSFW policy covering both libraries. Deletion scope and tombstone retention.

### 9. News Pipeline
[NEWS_PIPELINE.md](./NEWS_PIPELINE.md)
End-to-end news flow: fetch → parse → translate → verify → edit → select 6.

### 10. Rendering & EPF1
[RENDERING_AND_EPF1.md](./RENDERING_AND_EPF1.md)
Frame rendering pipeline, EPF1 format specification, palette, quantization.

### 11. Data Storage
[DATA_STORAGE.md](./DATA_STORAGE.md)
Runtime state files, persistence rules, schema versioning.

### 12. Test Strategy
[TEST_STRATEGY.md](./TEST_STRATEGY.md)
Test levels, runner, rules for mocks and production-path testing.

### 13. Deployment Runbook
[DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md)
NAS deployment procedure, bind mount mapping, verification steps.

### 14. Refactor Roadmap
[REFACTOR_ROADMAP.md](./REFACTOR_ROADMAP.md)
Phased architecture refactoring plan from current server.js to modular src/.

### 15. Traceability Matrix
[TRACEABILITY_MATRIX.md](./TRACEABILITY_MATRIX.md)
Full requirements-to-module-to-test mapping with verification status.

### 16. Architecture Decision Records
[adr/0001-mqtt-notification-http-source-of-truth.md](./adr/0001-mqtt-notification-http-source-of-truth.md)
[adr/0002-custom-library-only.md](./adr/0002-custom-library-only.md) — **Superseded** by ADR-0006
[adr/0003-strict-nsfw-deletion.md](./adr/0003-strict-nsfw-deletion.md)
[adr/0004-news-fidelity-before-compression.md](./adr/0004-news-fidelity-before-compression.md)
[adr/0005-operating-modes.md](./adr/0005-operating-modes.md)
[adr/0006-dual-image-library-architecture.md](./adr/0006-dual-image-library-architecture.md) — **Active**

## Recommended Reading Order

1. PRODUCT_REQUIREMENTS.md → 2. ACCEPTANCE_CRITERIA.md
3. SYSTEM_ARCHITECTURE.md → 4. DOMAIN_MODEL.md
5. API_AND_MQTT_CONTRACT.md
6. IMAGE_LIBRARY_ARCHITECTURE.md → STORYBOARD_LIBRARY.md → CONTENT_SAFETY.md
7. NEWS_PIPELINE.md → RENDERING_AND_EPF1.md
8. DATA_STORAGE.md → TEST_STRATEGY.md → DEPLOYMENT_RUNBOOK.md
9. REFACTOR_ROADMAP.md → TRACEABILITY_MATRIX.md
