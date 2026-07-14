#!/bin/bash
# build-staging.sh — Clean reproducible Docker build for NAS staging
#
# Verified on Synology NAS (fn-nas, 192.168.1.49) where the shaper router
# intercepts Docker bridge DNS, returning fn.phoebusstudio.com TLS cert for
# registry.npmjs.org. Use --network=host to bypass bridge DNS interception.
#
# Usage:
#   bash build-staging.sh <GIT_SHA_12_OR_40> <GIT_TREE_SHA_40>
#
# Requires: docker, git, sha256sum, node (on host for post-build smoke)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

GIT_SHA="${1:-}"
GIT_TREE="${2:-}"

if [ -z "$GIT_SHA" ] || [ -z "$GIT_TREE" ]; then
  echo "FAIL: usage: $0 <git-sha-12-or-40> <git-tree-sha-40>"
  echo "Example: $0 145c7c35e349 62c51b70923faf9dc8b487f127048772f85ed7e3"
  exit 1
fi

# 12-char tag
TAG="${GIT_SHA:0:12}"
IMAGE="paper-content-server:$TAG"

echo "=== Clean Docker build ==="
echo "GIT_SHA=$GIT_SHA"
echo "GIT_TREE=$GIT_TREE"
echo "TAG=$TAG"
echo "IMAGE=$IMAGE"

cd "$SRC_DIR"

# Fail if node_modules would be copied (defense in depth)
if [ -d node_modules ]; then
  echo "FAIL: host node_modules present — .dockerignore should exclude it, but refusing to build from dirty tree"
  exit 1
fi

# Build: --no-cache ensures no stale layers; --network=host bypasses bridge DNS interception
# TLS verification stays ON — no env vars are set to weaken certificate checks
docker build \
  --no-cache \
  --network=host \
  --build-arg "BUILD_GIT_SHA=$GIT_SHA" \
  --build-arg "BUILD_GIT_TREE=$GIT_TREE" \
  --build-arg "BUILD_DIRTY=false" \
  -t "$IMAGE" \
  .

echo "OK: image $IMAGE built"

# Post-build verification: SHA metadata
ACTUAL_SHA=$(docker inspect "$IMAGE" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^BUILD_GIT_SHA=' | cut -d= -f2)
if [ "$ACTUAL_SHA" != "$GIT_SHA" ]; then
  echo "FAIL: BUILD_GIT_SHA mismatch (expected $GIT_SHA, got $ACTUAL_SHA)"
  exit 1
fi
echo "PASS: BUILD_GIT_SHA=$ACTUAL_SHA"

# Post-build verification: sharp loads in built image
docker run --rm "$IMAGE" node -e "require('sharp'); console.log('sharp_ok')"
echo "PASS: sharp loads in image"

# Post-build verification: server.js syntax
docker run --rm --entrypoint sh "$IMAGE" -c "node --check server.js"
echo "PASS: server.js syntax check"

# Post-build verification: non-root user
CONTAINER_UID=$(docker run --rm "$IMAGE" id -u)
if [ "$CONTAINER_UID" = "0" ]; then
  echo "FAIL: image runs as root"
  exit 1
fi
echo "PASS: non-root uid=$CONTAINER_UID"

echo "=== BUILD COMPLETE: $IMAGE ==="
