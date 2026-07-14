#!/bin/bash
set -e
IMAGE_TAG=2ebbfd7676b5
IMAGE="paper-content-server:${IMAGE_TAG}"
STAGING_PORT=18080
PRODUCTION_PORT=8787
STAGING_ROOT=/home/phoebus/staging
DATA_DIR="${STAGING_ROOT}/data"
IMAGE_DIR="${STAGING_ROOT}/images"
ENV_FILE="${STAGING_ROOT}/staging.env"

echo "=== Deploy staging ==="
echo "IMAGE=${IMAGE}"
echo "STAGING_PORT=${STAGING_PORT}"
echo "PRODUCTION_PORT=${PRODUCTION_PORT} (untouched)"
echo "DATA_DIR=${DATA_DIR}"
echo "IMAGE_DIR=${IMAGE_DIR}"
echo "ENV_FILE=${ENV_FILE}"

if [ "${STAGING_PORT}" = "${PRODUCTION_PORT}" ]; then
  echo "FAIL: staging port must not equal production port"
  exit 1
fi

if ! docker image inspect "${IMAGE}" &>/dev/null; then
  echo "FAIL: image ${IMAGE} not found"
  exit 1
fi

mkdir -p "${DATA_DIR}" "${IMAGE_DIR}"

echo "--- STOP OLD ---"
docker stop paper-content-staging 2>/dev/null || true
docker rm paper-content-staging 2>/dev/null || true

echo "--- START NEW ---"
docker run -d \
  --name paper-content-staging \
  --restart unless-stopped \
  -p "${STAGING_PORT}:8787" \
  -v "${DATA_DIR}:/app/data" \
  -v "${IMAGE_DIR}:/app/images" \
  --env-file "${ENV_FILE}" \
  "${IMAGE}"

echo "OK: container started"
sleep 5
echo "--- HEALTH ---"
curl -sS -o /dev/null -w "admin_http=%{http_code}\n" "http://127.0.0.1:${STAGING_PORT}/admin"
curl -sS -o /dev/null -w "state_http=%{http_code}\n" "http://127.0.0.1:${STAGING_PORT}/api/state.json"
curl -sS -o /dev/null -w "news_http=%{http_code}\n" "http://127.0.0.1:${STAGING_PORT}/api/news.json"
echo "--- BUILD_SHA ---"
docker exec paper-content-staging printenv BUILD_GIT_SHA
echo "--- ADMIN_JS_FIX ---"
docker exec paper-content-staging sh -c "grep -c 'safeBind\|bindGuard' /app/public/admin/admin.js" || echo "0"
