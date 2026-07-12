# R11.2 NAS Staging Deployment — Admin LAN Mode

## Prerequisites

- Docker on NAS or target host
- Final immutable image tag (12-char commit SHA)
- `.env` file (copy from `.env.example`)

## Quick Start

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env: set IMAGE_TAG, TRANSLATION_PROVIDER, etc.
# ADMIN_TOKEN is NOT required in LAN mode

# 2. Run preflight check
bash preflight.sh <IMAGE_TAG>

# 3. Deploy staging
bash deploy-staging.sh <IMAGE_TAG>

# 4. Verify
bash verify.sh

# 5. Rollback if needed
bash rollback.sh <PREVIOUS_IMAGE_TAG>
```

## Admin LAN Access

The staging deployment uses **Admin LAN mode** (`ADMIN_ACCESS_MODE=lan`):

- **No login required** — open `http://<NAS_IP>:18080/admin` directly
- **No ADMIN_TOKEN needed** — token config is optional in LAN mode
- **LAN-only** — only private IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) are allowed
- **No CORS wildcard** — cross-origin write requests are denied
- **Proxy headers not trusted** — uses TCP `remoteAddress` directly

### NAS Firewall Requirements

- Port `18080` (staging) must only accept connections from LAN IP ranges
- Disable port forwarding on router for port 18080
- Disable reverse proxy exposure to public internet
- Disable UPnP auto-open for this port

### Access

```text
URL: http://<NAS_LAN_IP>:18080/admin
Auth: None (LAN only)
Scope: LAN_ONLY
```

To find the NAS LAN IP, use `ip addr show` or `ifconfig` on the NAS host.

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
