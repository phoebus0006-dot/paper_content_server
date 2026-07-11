#!/bin/bash
# deploy-staging.sh — Deploy R11.2 staging container
set -euo pipefail

IMAGE_TAG="${1:-}"
if [ -z "$IMAGE_TAG" ]; then
  echo "FAIL: usage: $0 <image-tag>"
  echo "Example: $0 ea2327a63082"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Preflight
"$SCRIPT_DIR/preflight.sh" "$IMAGE_TAG"

# Backup existing data
"$SCRIPT_DIR/backup.sh"

# Stop and remove existing container
docker stop paper-content-staging 2>/dev/null || true
docker rm paper-content-staging 2>/dev/null || true

# Deploy
docker run -d \
  --name paper-content-staging \
  --restart unless-stopped \
  -p 18080:8787 \
  -v /volume1/docker/paper-content-staging/data:/app/data \
  --env-file "$SCRIPT_DIR/.env" \
  -e DELETE_PIPELINE_ENABLED=false \
  -e MQTT_ENABLED=false \
  -e LEARNING_LIBRARY_ENABLED=false \
  -e CUSTOM_LIBRARY_ENABLED=false \
  -e R9_ADVANCED_RENDER_ENABLED=false \
  -e R9_RENDER_SHADOW_ENABLED=false \
  "paper-content-server:$IMAGE_TAG"

echo "OK: container paper-content-staging started"

# Verify
sleep 3
"$SCRIPT_DIR/verify.sh"
