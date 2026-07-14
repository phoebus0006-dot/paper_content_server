#!/bin/bash
# verify.sh — Verify staging container: endpoints, frame, non-root, sharp, CJK, SHA
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:18080}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PASS=0
FAIL=0

check() {
  local name="$1" result="$2"
  if [ "$result" = "true" ] || [ "$result" = "0" ]; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Staging Verification ==="

# Health endpoints
LIVE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health/live")
check "health/live=200" "$([ "$LIVE" = "200" ] && echo true || echo false)"

READY=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health/ready")
check "health/ready=200" "$([ "$READY" = "200" ] && echo true || echo false)"

ADMIN=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/admin")
check "admin=200" "$([ "$ADMIN" = "200" ] && echo true || echo false)"

STATE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/state.json")
check "state.json=200" "$([ "$STATE" = "200" ] && echo true || echo false)"

# /api/build is NOT IMPLEMENTED — SHA verified via docker inspect, not HTTP
BUILD=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/build")
check "/api/build=404 (NOT_IMPLEMENTED)" "$([ "$BUILD" = "404" ] && echo true || echo false)"

# Frame download and EPF1 header validation
curl -s -o /tmp/r11-verify-frame.bin "$BASE_URL/api/frame.bin"
FRAME_LEN=$(wc -c < /tmp/r11-verify-frame.bin 2>/dev/null || echo 0)
check "frame length=192010" "$([ "$FRAME_LEN" = "192010" ] && echo true || echo false)"

# Parse EPF1 header: magic(4) + width(2 LE) + height(2 LE) + panel(1) + version(1)
MAGIC=$(od -A n -t x1 -N 4 /tmp/r11-verify-frame.bin | tr -d ' ')
check "magic=EPF1 (45504631)" "$([ "$MAGIC" = "45504631" ] && echo true || echo false)"

WIDTH_HEX=$(od -A n -t x1 -j 4 -N 2 /tmp/r11-verify-frame.bin | tr -d ' ')
check "width=800 (2003 LE)" "$([ "$WIDTH_HEX" = "2003" ] && echo true || echo false)"

HEIGHT_HEX=$(od -A n -t x1 -j 6 -N 2 /tmp/r11-verify-frame.bin | tr -d ' ')
check "height=480 (e001 LE)" "$([ "$HEIGHT_HEX" = "e001" ] && echo true || echo false)"

PANEL=$(od -A n -t u1 -j 8 -N 1 /tmp/r11-verify-frame.bin | tr -d ' ')
check "panel=49" "$([ "$PANEL" = "49" ] && echo true || echo false)"

VERSION=$(od -A n -t u1 -j 9 -N 1 /tmp/r11-verify-frame.bin | tr -d ' ')
check "version=1" "$([ "$VERSION" = "1" ] && echo true || echo false)"

# Use Node.js validator for full code4 check — exit code is preserved
set +e
VALIDATE_OUTPUT=$(node "$SRC_DIR/scripts/validate-frame.js" /tmp/r11-verify-frame.bin 2>&1)
VALIDATE_EXIT=$?
set -e

echo "$VALIDATE_OUTPUT"
check "frame validator passes" "$([ "$VALIDATE_EXIT" -eq 0 ] && echo true || echo false)"
check "validator reports PASS" "$(echo "$VALIDATE_OUTPUT" | grep -q 'Validator: PASS' && echo true || echo false)"
check "code4 count is zero" "$(echo "$VALIDATE_OUTPUT" | grep -q 'Code4Count: 0' && echo true || echo false)"

# Container identity: non-root
CONTAINER_UID=$(docker exec paper-content-staging id -u 2>/dev/null || echo "unknown")
check "non-root (uid!=0)" "$([ "$CONTAINER_UID" != "0" ] && [ "$CONTAINER_UID" != "unknown" ] && echo true || echo false)"

# sharp loads in running container
SHARP_OK=$(docker exec paper-content-staging node -e "require('sharp');console.log('ok')" 2>/dev/null || echo "fail")
check "sharp loads in container" "$([ "$SHARP_OK" = "ok" ] && echo true || echo false)"

# CJK fonts present
CJK_COUNT=$(docker exec paper-content-staging sh -c 'ls /usr/share/fonts/opentype/noto/Noto*CJK* 2>/dev/null | wc -l' 2>/dev/null || echo 0)
check "CJK fonts present" "$([ "$CJK_COUNT" -ge "1" ] && echo true || echo false)"

# BUILD_GIT_SHA in container env
SHA=$(docker inspect paper-content-staging --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^BUILD_GIT_SHA=' | cut -d= -f2)
check "BUILD_GIT_SHA set" "$([ -n "$SHA" ] && [ "$SHA" != "unknown" ] && echo true || echo false)"

echo ""
echo "=== RESULTS: $PASS passed, $FAIL failed ==="
exit $FAIL
