# R11.2 NAS Staging Deployment

## Prerequisites

- Docker on NAS or target host
- Final immutable image tag (12-char commit SHA)
- `.env` file (copy from `.env.example`)

## Quick Start

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env: set ADMIN_TOKEN, IMAGE_TAG, TRANSLATION_PROVIDER, etc.

# 2. Run preflight check
bash preflight.sh <IMAGE_TAG>

# 3. Deploy staging
bash deploy-staging.sh <IMAGE_TAG>

# 4. Verify
bash verify.sh

# 5. Rollback if needed
bash rollback.sh <PREVIOUS_IMAGE_TAG>
```

## Default Flags

These features are disabled in staging:
- DELETE_PIPELINE_ENABLED=false
- MQTT_ENABLED=false
- LEARNING_LIBRARY_ENABLED=false
- CUSTOM_LIBRARY_ENABLED=false
- R9_ADVANCED_RENDER_ENABLED=false
- R9_RENDER_SHADOW_ENABLED=false

## Production Switch

Before switching to production port:
1. CI must pass (root workflow)
2. All staging verification must pass
3. Backup verified
4. Rollback tested
