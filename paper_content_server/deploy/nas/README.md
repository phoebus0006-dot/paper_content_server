# R11.2 NAS Staging Deployment — Reproducible Clean Build

## Prerequisites

- Docker on Synology NAS (verified on fn-nas 192.168.1.49)
- Git SHA and tree SHA of the target commit
- `.env` file (copy from `.env.example`)

## Build & Deploy

```bash
# 1. Configure environment (minimal, no production secrets)
cp .env.example .env
# Edit .env if needed (defaults are staging-safe)

# 2. Build clean image (requires git SHA + tree SHA)
bash build-staging.sh <GIT_SHA_12_OR_40> <GIT_TREE_SHA_40>
# Example: bash build-staging.sh 145c7c35e349 62c51b70923faf9dc8b487f127048772f85ed7e3

# 3. Deploy staging (port 18080 only — production 8787 untouched)
#    Pass EXPECTED_SHA and EXPECTED_TREE for exact SHA verification
EXPECTED_SHA=<GIT_SHA_40> EXPECTED_TREE=<GIT_TREE_40> \
bash deploy-staging.sh <IMAGE_TAG_12_CHAR>

# 4. Verify (standalone — requires EXPECTED_SHA/EXPECTED_TREE env vars)
EXPECTED_SHA=<GIT_SHA_40> EXPECTED_TREE=<GIT_TREE_40> bash verify.sh

# 5. Rollback if needed
bash rollback.sh <PREVIOUS_IMAGE_TAG>
```

## Path Configuration

All scripts read `STAGING_ROOT` (default: `/home/phoebus/staging`) and derive
`DATA_DIR`, `IMAGE_DIR`, `BACKUP_DIR` from it. Override for non-default layouts:

```bash
STAGING_ROOT=/volume1/docker/paper-content-staging \
bash deploy-staging.sh <TAG>
```

## Host Requirements

The NAS host only needs: `docker`, `curl`, `od`, `tar`.
Node.js/npm is NOT required on the host — all Node work runs inside the
staging container via `docker exec`.

## Clean Docker Build

The Dockerfile performs a clean install from the official `node:20-slim` image:

- `npm ci --omit=dev --no-audit --no-fund` — no host node_modules copied
- Fail-fast sharp verification in the npm ci RUN layer (BEFORE `COPY . .`):
  - `node -e "require('sharp')"` — sharp must load
- `node --check server.js` runs in a SEPARATE RUN layer AFTER `COPY . .`
  (server.js does not exist before the source copy)
- Multi-stage build: builder (npm ci) → runtime (fonts-noto-cjk, non-root)
- `Dockerfile.reuse` is NOT a sanctioned approach — only the clean Dockerfile is supported

### Build Context Exclusions

`.dockerignore` excludes from the Docker build context:
`node_modules/`, `data/`, `.env`, `config.h`, models (`*.tflite`, `*.onnx`),
fonts (`*.ttf`, `*.otf`), temp files (`*.log`, `*.tmp`), `.git/`.
Host `node_modules` is never copied into the image.

### NAS Network Mode

`build-staging.sh` defaults to Docker's standard bridge network.
On NAS where the shaper router intercepts bridge DNS (returning
`fn.phoebusstudio.com` TLS cert for `registry.npmjs.org`), set:

```bash
DOCKER_BUILD_NETWORK=host bash build-staging.sh <SHA> <TREE>
```

Allowed values: `default` (default) | `host`. Invalid values fail.
TLS verification is NEVER disabled.

## SHA Verification

```
HTTP_BUILD_ENDPOINT=NOT_IMPLEMENTED
SHA_VERIFIED_VIA_DOCKER_INSPECT=YES
```

The `/api/build` endpoint does not exist (returns 404). The build SHA is verified
via `docker inspect <container> --format '{{range .Config.Env}}{{println .}}{{end}}'`
showing `BUILD_GIT_SHA=<sha>`.

`verify.sh` performs **exact match** verification (not just non-empty):
- `ACTUAL_SHA == EXPECTED_SHA` (env var, 40-char)
- `ACTUAL_TREE == EXPECTED_TREE` (env var, 40-char)
- `ACTUAL_DIRTY == false`

Pass `EXPECTED_SHA` and `EXPECTED_TREE` env vars to `verify.sh` or `deploy-staging.sh`.

## CJK Dynamic Render

`verify.sh` does not just count font files — it renders the Chinese text
"新闻图片测试" using sharp inside the container and verifies that dark pixels
are produced (font is actually usable, not just present).

## Admin LAN Access

- `ADMIN_ACCESS_MODE=lan` — no login required, LAN-only
- `ADMIN_ALLOWED_CIDRS` — private IP ranges only
- `TRUST_PROXY=false` — uses TCP remoteAddress directly
- No CORS wildcard — cross-origin writes denied

## Default Flags (staging baseline)

- `DELETE_PIPELINE_ENABLED=false`
- `MQTT_ENABLED=false`
- `LEARNING_LIBRARY_ENABLED=false`
- `CUSTOM_LIBRARY_ENABLED=false`
- `R9_ADVANCED_RENDER_ENABLED=false`
- `R9_RENDER_SHADOW_ENABLED=false`

## Production Switch

Before switching to production port 8787:
1. CI must pass (root workflow)
2. All staging verification must pass
3. Backup verified
4. Rollback tested
5. Explicit approval required — `production_replaced=NO` until then
