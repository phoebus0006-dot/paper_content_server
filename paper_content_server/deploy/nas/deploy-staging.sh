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

# Reject if .env contains production secrets. TRANSLATION_PROVIDER=none is
# explicitly allowed (it disables translation, no API key needed). Only
# providers that require keys (openai/deepl/gemini) are rejected.
if grep -qE 'OPENAI_API_KEY|GEMINI_API|DEEPL_API_KEY' "$ENV_FILE"; then
  echo "FAIL: .env contains production API keys — staging must use minimal config"
  exit 1
fi
if grep -qE 'TRANSLATION_PROVIDER=(openai|deepl|gemini)' "$ENV_FILE"; then
  echo "FAIL: .env enables a production translation provider — staging must use none"
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
# 必须用 --network host：NAS 主机的 iptables/旁路由对 bridge 网络出站 443 流量
# 做透明代理劫持，TLS 握手返回 fn.phoebusstudio.com 证书，导致 Node fetch 全部
# ERR_TLS_CERT_ALTNAME_INVALID，新闻 RSS 和图片抓取 100% 失败。
# --network host 让容器直接用主机网络栈，绕过 bridge NAT，旁路由的 iptables
# 透明代理规则对主机流量正常工作（中国 IP 走 aliyun_ss 代理，国外 IP 直连）。
# host 模式下 -p 端口映射被忽略，必须用 -e PORT=$STAGING_PORT 让 server 直接
# 监听 18080，避免与生产容器 8787 冲突。
docker run -d \
  --name paper-content-staging \
  --restart unless-stopped \
  --network host \
  -e PORT="$STAGING_PORT" \
  -v "$DATA_DIR:/app/data" \
  -v "$IMAGE_DIR:/app/images" \
  --env-file "$ENV_FILE" \
  "$IMAGE"

echo "OK: container paper-content-staging started on port $STAGING_PORT"

# Verify
sleep 4
"$SCRIPT_DIR/verify.sh"
