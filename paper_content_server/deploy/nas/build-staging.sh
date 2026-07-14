#!/bin/bash
# build-staging.sh — Clean reproducible Docker build for NAS staging
#
# Network mode is opt-in:
#   default:  docker build uses Docker's default bridge network
#   host:     set DOCKER_BUILD_NETWORK=host to use host networking
#             (useful on NAS where the shaper router intercepts bridge DNS)
#
# TLS verification is ALWAYS on. This script never sets env vars that weaken
# certificate checks.
#
# Usage:
#   bash build-staging.sh <GIT_SHA_12_OR_40> <GIT_TREE_SHA_40>
#   DOCKER_BUILD_NETWORK=host bash build-staging.sh <SHA> <TREE>
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

# Network mode validation — only "default" and "host" are allowed.
DOCKER_BUILD_NETWORK="${DOCKER_BUILD_NETWORK:-default}"
case "$DOCKER_BUILD_NETWORK" in
  default)
    NETWORK_ARGS=()
    ;;
  host)
    NETWORK_ARGS=(--network=host)
    ;;
  *)
    echo "FAIL: DOCKER_BUILD_NETWORK='$DOCKER_BUILD_NETWORK' is invalid"
    echo "Allowed values: default | host"
    exit 1
    ;;
esac

echo "=== Clean Docker build ==="
echo "GIT_SHA=$GIT_SHA"
echo "GIT_TREE=$GIT_TREE"
echo "TAG=$TAG"
echo "IMAGE=$IMAGE"
echo "DOCKER_BUILD_NETWORK=$DOCKER_BUILD_NETWORK"

cd "$SRC_DIR"

# node_modules on host is NOT a reason to fail — .dockerignore excludes it
# from the build context. We do not refuse builds based on host tree state.

# Build: --no-cache ensures no stale layers.
# --network=host is added ONLY when DOCKER_BUILD_NETWORK=host.
# TLS verification stays ON — no env vars weaken certificate checks.
docker build \
  --no-cache \
  "${NETWORK_ARGS[@]}" \
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

ACTUAL_TREE=$(docker inspect "$IMAGE" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^BUILD_GIT_TREE=' | cut -d= -f2)
if [ "$ACTUAL_TREE" != "$GIT_TREE" ]; then
  echo "FAIL: BUILD_GIT_TREE mismatch (expected $GIT_TREE, got $ACTUAL_TREE)"
  exit 1
fi
echo "PASS: BUILD_GIT_TREE=$ACTUAL_TREE"

# Post-build verification: sharp loads in built image
docker run --rm "$IMAGE" node -e "require('sharp'); console.log('sharp_ok')"
echo "PASS: sharp loads in image"

# Post-build verification: server.js syntax
docker run --rm --entrypoint node "$IMAGE" --check server.js
echo "PASS: server.js syntax check"

# Post-build verification: non-root user
CONTAINER_UID=$(docker run --rm --entrypoint id "$IMAGE" -u)
if [ "$CONTAINER_UID" = "0" ]; then
  echo "FAIL: image runs as root"
  exit 1
fi
echo "PASS: non-root uid=$CONTAINER_UID"

echo "=== BUILD COMPLETE: $IMAGE ==="
