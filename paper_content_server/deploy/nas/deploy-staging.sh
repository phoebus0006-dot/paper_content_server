#!/bin/bash
# deploy-staging.sh — Deploy staging container (port 18080) only
# Production (8787) is NEVER touched by this script.
#
# Paths are configurable via environment variables (see backup.sh).
set -euo pipefail

IMAGE_TAG="${1:-}"
if [ -z "$IMAGE_TAG" ]; then
  echo "FAIL: usage: $0 <image-tag-12-char>"
  echo "Example: $0 145c7c35e349"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE="paper-content-server:$IMAGE_TAG"
STAGING_PORT=18080
PRODUCTION_PORT=8787

# Shared paths — must match backup.sh and verify.sh
STAGING_ROOT="${STAGING_ROOT:-/home/phoebus/staging}"
DATA_DIR="${DATA_DIR:-$STAGING_ROOT/data}"
IMAGE_DIR="${IMAGE_DIR:-$STAGING_ROOT/images}"

echo "=== Staging deployment ==="
echo "IMAGE=$IMAGE"
echo "STAGING_PORT=$STAGING_PORT"
echo "PRODUCTION_PORT=$PRODUCTION_PORT (untouched)"
echo "STAGING_ROOT=$STAGING_ROOT"
echo "DATA_DIR=$DATA_DIR"
echo "IMAGE_DIR=$IMAGE_DIR"

# Safety: refuse if target is production port
if [ "$STAGING_PORT" = "$PRODUCTION_PORT" ]; then
  echo "FAIL: staging port must not equal production port"
  exit 1
fi

# Require .env (copy from .env.example)
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "FAIL: $ENV_FILE not found — copy from .env.example and configure"
  exit 1
fi

# Reject if .env contains production secrets
if grep -qE 'OPENAI_API_KEY|GEMINI_API|TRANSLATION_PROVIDER' "$ENV_FILE"; then
  echo "FAIL: .env contains production API keys — staging must use minimal config"
  exit 1
fi

# Preflight: image must exist
if ! docker image inspect "$IMAGE" &>/dev/null; then
  echo "FAIL: image $IMAGE not found — run build-staging.sh first"
  exit 1
fi

# Ensure data/image dirs exist
mkdir -p "$DATA_DIR" "$IMAGE_DIR"

# Backup existing staging data (uses same STAGING_ROOT/DATA_DIR)
STAGING_ROOT="$STAGING_ROOT" DATA_DIR="$DATA_DIR" BACKUP_DIR="${BACKUP_DIR:-$STAGING_ROOT/backups}" \
  "$SCRIPT_DIR/backup.sh"

# Stop and remove existing staging container
docker stop paper-content-staging 2>/dev/null || true
docker rm paper-content-staging 2>/dev/null || true

# Deploy staging only — never touch the production container on port 8787
docker run -d \
  --name paper-content-staging \
  --restart unless-stopped \
  -p "$STAGING_PORT:8787" \
  -v "$DATA_DIR:/app/data" \
  -v "$IMAGE_DIR:/app/images" \
  --env-file "$ENV_FILE" \
  "$IMAGE"

echo "OK: container paper-content-staging started on port $STAGING_PORT"

# Verify
sleep 4
"$SCRIPT_DIR/verify.sh"
