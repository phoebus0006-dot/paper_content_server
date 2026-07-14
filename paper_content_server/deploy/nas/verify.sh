#!/bin/bash
# verify.sh — Verify staging container: endpoints, frame, non-root, sharp,
#             CJK render, SHA exact match.
#
# NAS host only requires: docker, curl, od, tar.
# Node.js is NOT required on the host — all Node work runs inside the
# staging container via docker exec.
#
# Environment variables (required for SHA verification):
#   EXPECTED_SHA   — 40-char origin/master SHA (exact match required)
#   EXPECTED_TREE  — 40-char git tree SHA (exact match required)
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:18080}"
CONTAINER="paper-content-staging"
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
echo "BASE_URL=$BASE_URL"
echo "CONTAINER=$CONTAINER"

# ============================================================
# Health endpoints
# ============================================================
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

# ============================================================
# Frame download and EPF1 header validation (od — no Node required on host)
# ============================================================
FRAME_FILE="/tmp/r11-verify-frame-$$.bin"
curl -s -o "$FRAME_FILE" "$BASE_URL/api/frame.bin"
FRAME_LEN=$(wc -c < "$FRAME_FILE" 2>/dev/null || echo 0)
check "frame length=192010" "$([ "$FRAME_LEN" = "192010" ] && echo true || echo false)"

# Parse EPF1 header: magic(4) + width(2 LE) + height(2 LE) + panel(1) + version(1)
MAGIC=$(od -A n -t x1 -N 4 "$FRAME_FILE" | tr -d ' ')
check "magic=EPF1 (45504631)" "$([ "$MAGIC" = "45504631" ] && echo true || echo false)"

WIDTH_HEX=$(od -A n -t x1 -j 4 -N 2 "$FRAME_FILE" | tr -d ' ')
check "width=800 (2003 LE)" "$([ "$WIDTH_HEX" = "2003" ] && echo true || echo false)"

HEIGHT_HEX=$(od -A n -t x1 -j 6 -N 2 "$FRAME_FILE" | tr -d ' ')
check "height=480 (e001 LE)" "$([ "$HEIGHT_HEX" = "e001" ] && echo true || echo false)"

PANEL=$(od -A n -t u1 -j 8 -N 1 "$FRAME_FILE" | tr -d ' ')
check "panel=49" "$([ "$PANEL" = "49" ] && echo true || echo false)"

VERSION=$(od -A n -t u1 -j 9 -N 1 "$FRAME_FILE" | tr -d ' ')
check "version=1" "$([ "$VERSION" = "1" ] && echo true || echo false)"

# ============================================================
# Frame validator — runs INSIDE the container (no host Node needed).
# validate-frame.js is at /app/scripts/validate-frame.js in the image.
# We copy the frame file into the container, run, then clean up.
# ============================================================
docker cp "$FRAME_FILE" "$CONTAINER:/tmp/frame-verify.bin"

set +e
VALIDATE_OUTPUT=$(docker exec -w /app "$CONTAINER" node /app/scripts/validate-frame.js /tmp/frame-verify.bin 2>&1)
VALIDATE_EXIT=$?
set -e

echo "$VALIDATE_OUTPUT"
check "frame validator passes" "$([ "$VALIDATE_EXIT" -eq 0 ] && echo true || echo false)"
check "validator reports PASS" "$(echo "$VALIDATE_OUTPUT" | grep -q 'Validator: PASS' && echo true || echo false)"
check "code4 count is zero" "$(echo "$VALIDATE_OUTPUT" | grep -q 'Code4Count: 0' && echo true || echo false)"
check "invalid codes is zero" "$(echo "$VALIDATE_OUTPUT" | grep -q 'InvalidCodeCount: 0' && echo true || echo false)"

# Cleanup frame file in container (ignore errors — file may not exist)
docker exec "$CONTAINER" rm -f /tmp/frame-verify.bin 2>/dev/null
rm -f "$FRAME_FILE"

# ============================================================
# Container identity: non-root
# ============================================================
CONTAINER_UID=$(docker exec "$CONTAINER" id -u 2>/dev/null || echo "unknown")
check "non-root (uid!=0)" "$([ "$CONTAINER_UID" != "0" ] && [ "$CONTAINER_UID" != "unknown" ] && echo true || echo false)"

# ============================================================
# sharp loads in running container
# ============================================================
SHARP_OK=$(docker exec "$CONTAINER" node -e "require('sharp');console.log('ok')" 2>/dev/null || echo "fail")
check "sharp loads in container" "$([ "$SHARP_OK" = "ok" ] && echo true || echo false)"

# ============================================================
# CJK dynamic render test — render Chinese text with sharp inside
# the container and verify dark pixels are produced.
# Tests that fonts are actually usable, not just present.
# ============================================================
CJK_RENDER_SCRIPT='
var sharp = require("sharp");
var text = "新闻图片测试";
var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"60\">" +
  "<style>text{font-family:\"Noto Sans CJK SC\",\"Noto Sans CJK JP\",sans-serif;font-size:32px;fill:#000;}</style>" +
  "<text x=\"10\" y=\"42\">" + text + "</text></svg>";
sharp(Buffer.from(svg)).png().toBuffer().then(function(buf) {
  return sharp(buf).raw().toBuffer();
}).then(function(raw) {
  var dark = 0;
  for (var i = 0; i < raw.length; i += 3) {
    if (raw[i] < 128) dark++;
  }
  console.log("dark_pixels=" + dark);
  console.log("width_height=" + (Math.floor(raw.length / 3)));
  if (dark > 0) {
    console.log("CJK_RENDER=PASS");
    process.exit(0);
  } else {
    console.log("CJK_RENDER=FAIL_NO_DARK_PIXELS");
    process.exit(1);
  }
}).catch(function(e) {
  console.log("CJK_RENDER=FAIL:" + e.message);
  process.exit(1);
});
'

set +e
CJK_OUTPUT=$(docker exec "$CONTAINER" node -e "$CJK_RENDER_SCRIPT" 2>&1)
CJK_EXIT=$?
set -e

echo "$CJK_OUTPUT"
check "CJK render (dark pixels > 0)" "$([ "$CJK_EXIT" -eq 0 ] && echo "$CJK_OUTPUT" | grep -q 'CJK_RENDER=PASS' && echo true || echo false)"

# ============================================================
# SHA exact match verification
# BUILD_GIT_SHA, BUILD_GIT_TREE, BUILD_DIRTY from docker inspect
# ============================================================
ACTUAL_SHA=$(docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^BUILD_GIT_SHA=' | cut -d= -f2)
ACTUAL_TREE=$(docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^BUILD_GIT_TREE=' | cut -d= -f2)
ACTUAL_DIRTY=$(docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^BUILD_DIRTY=' | cut -d= -f2)

echo "ACTUAL_SHA=$ACTUAL_SHA"
echo "ACTUAL_TREE=$ACTUAL_TREE"
echo "ACTUAL_DIRTY=$ACTUAL_DIRTY"

if [ -z "${EXPECTED_SHA:-}" ]; then
  echo "FAIL: EXPECTED_SHA env var is required (40-char origin/master SHA)"
  FAIL=$((FAIL + 1))
else
  check "SHA exact match ($EXPECTED_SHA)" "$([ "$ACTUAL_SHA" = "$EXPECTED_SHA" ] && echo true || echo false)"
fi

if [ -z "${EXPECTED_TREE:-}" ]; then
  echo "FAIL: EXPECTED_TREE env var is required (40-char git tree SHA)"
  FAIL=$((FAIL + 1))
else
  check "TREE exact match ($EXPECTED_TREE)" "$([ "$ACTUAL_TREE" = "$EXPECTED_TREE" ] && echo true || echo false)"
fi

check "DIRTY=false" "$([ "$ACTUAL_DIRTY" = "false" ] && echo true || echo false)"

echo ""
echo "=== RESULTS: $PASS passed, $FAIL failed ==="
exit $FAIL
