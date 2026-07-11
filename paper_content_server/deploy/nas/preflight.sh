#!/bin/bash
# preflight.sh — Verify prerequisites before staging deployment
set -euo pipefail

echo "=== R11.2 Preflight Check ==="

# Check Docker
if ! command -v docker &>/dev/null; then
  echo "FAIL: docker not found"
  exit 1
fi
echo "PASS: docker available ($(docker --version))"

# Check image exists
IMAGE_TAG="${1:-}"
if [ -z "$IMAGE_TAG" ]; then
  echo "FAIL: usage: $0 <image-tag>"
  exit 1
fi
if ! docker image inspect "paper-content-server:$IMAGE_TAG" &>/dev/null; then
  echo "FAIL: image paper-content-server:$IMAGE_TAG not found locally"
  exit 1
fi
echo "PASS: image paper-content-server:$IMAGE_TAG found"

# Check data directory
DATA_DIR="/volume1/docker/paper-content-staging/data"
if [ ! -d "$DATA_DIR" ]; then
  mkdir -p "$DATA_DIR"
  echo "INFO: created $DATA_DIR"
fi
echo "PASS: data directory ready"

# Check .env exists
if [ ! -f .env ]; then
  echo "FAIL: .env not found — copy from .env.example and configure"
  exit 1
fi
echo "PASS: .env present"

echo "=== PREFLIGHT PASSED ==="
