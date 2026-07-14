#!/bin/bash
set -e

SHA="74c4d50388bb34103cd61a0883909345ed132a97"
TARBALL="paper-content-admin-fix-74c4d50.tar.gz"
STAGING_ROOT="/home/phoebus/staging"
BUILD_DIR="${STAGING_ROOT}/build-admin-fix"

echo "=== ADMIN FIX DEPLOY ==="
echo "SHA=$SHA"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
tar xzf "${STAGING_ROOT}/${TARBALL}" -C "$BUILD_DIR"
cd "$BUILD_DIR"

echo "--- Building Docker image ---"
DOCKER_BUILD_NETWORK=host bash deploy/nas/build-staging.sh "$SHA" master

IMAGE_TAG=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep paper-content-server | head -1)
echo "IMAGE_TAG=$IMAGE_TAG"

echo "--- Stopping old container ---"
docker stop paper-content-staging 2>/dev/null || true
docker rm paper-content-staging 2>/dev/null || true

echo "--- Starting new container ---"
docker run -d \
  --name paper-content-staging \
  --env-file "${STAGING_ROOT}/staging.env" \
  -p 18080:8787 \
  -v "${STAGING_ROOT}/data:/app/data" \
  -v "${STAGING_ROOT}/images:/app/images" \
  --restart unless-stopped \
  "$IMAGE_TAG"

echo "--- Waiting for health ---"
sleep 3
for i in $(seq 1 30); do
  HEALTH=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/health/live 2>/dev/null || echo "000")
  if [ "$HEALTH" = "200" ]; then
    echo "HEALTH_LIVE=200 (after ${i}s)"
    break
  fi
  sleep 1
done

echo "--- Verifying ---"
HEALTH_LIVE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/health/live)
ADMIN_PAGE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/admin/)
NEWS_COUNT=$(curl -s http://127.0.0.1:18080/api/admin/news 2>/dev/null | grep -o '"selected":\[[^]]*\]' | grep -o '"title"' | wc -l)
THUMB_TEST=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/api/admin/photos/fb-wideshot/thumbnail)

echo "HEALTH_LIVE=$HEALTH_LIVE"
echo "ADMIN_PAGE=$ADMIN_PAGE"
echo "NEWS_COUNT=$NEWS_COUNT"
echo "THUMB_TEST=$THUMB_TEST"

echo "=== DEPLOY COMPLETE ==="
