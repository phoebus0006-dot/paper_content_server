#!/bin/bash
# rollback.sh — Rollback staging to previous backup and image
set -euo pipefail

BACKUP_DIR="/volume1/docker/paper-content-staging/backups"
DATA_DIR="/volume1/docker/paper-content-staging/data"

echo "=== R11.2 Rollback ==="

# List available backups
echo "Available backups:"
ls -1t "$BACKUP_DIR"/data_*.tar.gz 2>/dev/null || {
  echo "No backups found"
  exit 1
}

# Use latest backup
LATEST=$(ls -t "$BACKUP_DIR"/data_*.tar.gz 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  echo "FAIL: no backup available"
  exit 1
fi
echo "Restoring from: $LATEST"

# Stop container
docker stop paper-content-staging 2>/dev/null || true

# Restore data
rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"
tar -xzf "$LATEST" -C /volume1/docker/paper-content-staging/
echo "OK: data restored"

# Restart with previous image tag
IMAGE_TAG="${1:-}"
if [ -z "$IMAGE_TAG" ]; then
  echo "WARN: no image tag specified, restarting with current"
  docker start paper-content-staging 2>/dev/null || {
    echo "FAIL: container not found — run deploy-staging.sh with a known-good tag"
    exit 1
  }
else
  docker rm paper-content-staging 2>/dev/null || true
  docker run -d \
    --name paper-content-staging \
    --restart unless-stopped \
    -p 18080:8787 \
    -v /volume1/docker/paper-content-staging/data:/app/data \
    "paper-content-server:$IMAGE_TAG"
fi

echo "OK: rollback completed, verifying..."
sleep 3
"$(dirname "$0")/verify.sh"
