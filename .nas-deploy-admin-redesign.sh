#!/bin/bash
set -e

SHA="e7aa68d1fd90141bd67bcd130514797c9bb96d9c"
TREE="master"
TARBALL="paper-content-admin-redesign-e7aa68d.tar.gz"
STAGING_ROOT="/home/phoebus/staging"
BUILD_DIR="${STAGING_ROOT}/build-admin-redesign"

echo "=== ADMIN UI REDESIGN DEPLOY ==="
echo "SHA=$SHA"
echo "TARBALL=$TARBALL"

# Clean build dir
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Extract tarball
echo "--- Extracting tarball ---"
tar xzf "${STAGING_ROOT}/${TARBALL}" -C "$BUILD_DIR"
cd "$BUILD_DIR"

# Verify files exist
echo "--- Verifying admin files ---"
ls -la public/admin/index.html public/admin/admin.css public/admin/admin.js server.js

# Build Docker image
echo "--- Building Docker image ---"
DOCKER_BUILD_NETWORK=host bash deploy/nas/build-staging.sh "$SHA" "$TREE"

# Get the image tag
IMAGE_TAG=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep paper-content-server | head -1)
echo "IMAGE_TAG=$IMAGE_TAG"

# Stop old staging container
echo "--- Stopping old container ---"
docker stop paper-content-staging 2>/dev/null || true
docker rm paper-content-staging 2>/dev/null || true

# Start new staging container
echo "--- Starting new container ---"
docker run -d \
  --name paper-content-staging \
  --env-file "${STAGING_ROOT}/staging.env" \
  -p 18080:8787 \
  -v "${STAGING_ROOT}/data:/app/data" \
  -v "${STAGING_ROOT}/images:/app/images" \
  --restart unless-stopped \
  "$IMAGE_TAG"

echo "--- Waiting for health check ---"
sleep 3
for i in $(seq 1 30); do
  HEALTH=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/health/live 2>/dev/null || echo "000")
  if [ "$HEALTH" = "200" ]; then
    echo "HEALTH_LIVE=200 (after ${i}s)"
    break
  fi
  sleep 1
done

# Verify deployment
echo "--- Verifying deployment ---"
HEALTH_LIVE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/health/live)
HEALTH_READY=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/health/ready)
ADMIN_PAGE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/admin/)
NEWS_API=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/api/admin/news)
PHOTOS_API=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/api/admin/photos)

echo "HEALTH_LIVE=$HEALTH_LIVE"
echo "HEALTH_READY=$HEALTH_READY"
echo "ADMIN_PAGE=$ADMIN_PAGE"
echo "NEWS_API=$NEWS_API"
echo "PHOTOS_API=$PHOTOS_API"

# Verify admin redesign is deployed (check for sidebar)
ADMIN_HTML=$(curl -s http://127.0.0.1:18080/admin/)
if echo "$ADMIN_HTML" | grep -q 'sidebar'; then
  echo "ADMIN_REDESIGN_DEPLOYED=YES"
else
  echo "ADMIN_REDESIGN_DEPLOYED=NO"
fi

# Verify BUILD_GIT_SHA
BUILD_SHA=$(docker exec paper-content-staging printenv BUILD_GIT_SHA 2>/dev/null || echo "unknown")
echo "BUILD_GIT_SHA=$BUILD_SHA"

echo "=== DEPLOY COMPLETE ==="
