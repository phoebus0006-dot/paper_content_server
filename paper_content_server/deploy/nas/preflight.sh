#!/bin/bash
# preflight.sh — Verify prerequisites before staging deployment
# Paths are configurable via environment variables (see backup.sh).
set -euo pipefail

STAGING_ROOT="${STAGING_ROOT:-/home/phoebus/staging}"
DATA_DIR="${DATA_DIR:-$STAGING_ROOT/data}"
IMAGE_DIR="${IMAGE_DIR:-$STAGING_ROOT/images}"

echo "=== R11.2 Preflight Check ==="
echo "STAGING_ROOT=$STAGING_ROOT"
echo "DATA_DIR=$DATA_DIR"
echo "IMAGE_DIR=$IMAGE_DIR"

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

# Check data directory (derive from STAGING_ROOT, never hardcode a vendor path)
if [ ! -d "$DATA_DIR" ]; then
  mkdir -p "$DATA_DIR"
  echo "INFO: created $DATA_DIR"
fi
echo "PASS: data directory ready"

# Check image directory
if [ ! -d "$IMAGE_DIR" ]; then
  mkdir -p "$IMAGE_DIR"
  echo "INFO: created $IMAGE_DIR"
fi
echo "PASS: image directory ready"

# Check .env exists — must be in the same directory as this script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "FAIL: $ENV_FILE not found — copy from .env.example and configure"
  exit 1
fi
echo "PASS: .env present ($ENV_FILE)"

# Reject if .env contains production secrets (staging must stay minimal)
if grep -qE 'OPENAI_API_KEY|GEMINI_API|DEEPL_API_KEY|TRANSLATION_PROVIDER=(openai|deepl|gemini)' "$ENV_FILE"; then
  echo "FAIL: $ENV_FILE contains production API keys — staging must use minimal config"
  exit 1
fi
echo "PASS: .env has no production secrets"

echo "=== PREFLIGHT PASSED ==="
