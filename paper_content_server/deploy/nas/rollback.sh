#!/bin/bash
# rollback.sh — Rollback staging to previous backup and image
#
# Paths are configurable via environment variables (see backup.sh).
set -euo pipefail

STAGING_ROOT="${STAGING_ROOT:-/home/phoebus/staging}"
DATA_DIR="${DATA_DIR:-$STAGING_ROOT/data}"
IMAGE_DIR="${IMAGE_DIR:-$STAGING_ROOT/images}"
BACKUP_DIR="${BACKUP_DIR:-$STAGING_ROOT/backups}"

echo "=== Staging Rollback ==="

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
tar -xzf "$LATEST" -C "$(dirname "$DATA_DIR")"/
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
    -v "$DATA_DIR:/app/data" \
    -v "$IMAGE_DIR:/app/images" \
    "paper-content-server:$IMAGE_TAG"
fi

echo "OK: rollback completed, verifying..."
sleep 3
"$(dirname "$0")/verify.sh"
