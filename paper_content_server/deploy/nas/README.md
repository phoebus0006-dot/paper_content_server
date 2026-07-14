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
bash deploy-staging.sh <IMAGE_TAG_12_CHAR>

# 4. Verify
bash verify.sh

# 5. Rollback if needed
bash rollback.sh <PREVIOUS_IMAGE_TAG>
```

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
via `docker inspect <image> --format '{{range .Config.Env}}{{println .}}{{end}}'`
showing `BUILD_GIT_SHA=<sha>`. This is documented and NOT a deployment failure.

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
