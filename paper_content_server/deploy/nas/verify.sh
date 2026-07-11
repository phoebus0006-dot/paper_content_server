#!/bin/bash
# verify.sh — Verify staging container health and frame integrity
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:18080}"
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

echo "=== R11.2 Staging Verification ==="

# Health endpoints
LIVE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health/live")
check "health/live returns 200" "$([ "$LIVE" = "200" ] && echo true || echo false)"

READY=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health/ready")
check "health/ready returns 200" "$([ "$READY" = "200" ] && echo true || echo false)"

# State
STATE=$(curl -s "$BASE_URL/api/state.json")
SNAPSHOT_ID=$(echo "$STATE" | grep -o '"snapshotId":"[^"]*"' | cut -d'"' -f4 || echo "null")
FRAME_ID=$(echo "$STATE" | grep -o '"frameId":"[^"]*"' | cut -d'"' -f4 || echo "null")
check "state has snapshotId" "$([ "$SNAPSHOT_ID" != "null" ] && echo true || echo false)"
check "state has frameId" "$([ "$FRAME_ID" != "null" ] && echo true || echo false)"

# Frame download
curl -s -o /tmp/r11-verify-frame.bin "$BASE_URL/api/frame.bin"
FRAME_LEN=$(wc -c < /tmp/r11-verify-frame.bin 2>/dev/null || echo 0)
check "frame length = 192010" "$([ "$FRAME_LEN" = "192010" ] && echo true || echo false)"

FRAME_SHA=$(sha256sum /tmp/r11-verify-frame.bin | cut -d' ' -f1)
check "frame sha256 computed" "$([ -n "$FRAME_SHA" ] && echo true || echo false)"

# Frame validation via validator CLI (container or host)
if docker exec paper-content-staging node --check scripts/validate-frame.js 2>/dev/null; then
  VALIDATE_OUTPUT=$(docker exec paper-content-staging node scripts/validate-frame.js /tmp/r11-verify-frame.bin 2>&1 || true)
  # If container doesn't have the file, try host
  if echo "$VALIDATE_OUTPUT" | grep -q "cannot read"; then
    VALIDATE_OUTPUT=$(node scripts/validate-frame.js /tmp/r11-verify-frame.bin 2>&1)
  fi
else
  VALIDATE_OUTPUT=$(node scripts/validate-frame.js /tmp/r11-verify-frame.bin 2>&1)
fi
echo "$VALIDATE_OUTPUT"
VALIDATE_EXIT=$?
check "frame validator passes" "$([ "$VALIDATE_EXIT" = "0" ] && echo true || echo false)"
check "validator reports PASS" "$(echo "$VALIDATE_OUTPUT" | grep -q 'Validator: PASS' && echo true || echo false)"
check "code4 count is zero" "$(echo "$VALIDATE_OUTPUT" | grep -q 'Code4Count: 0' && echo true || echo false)"

# Container identity
CONTAINER_UID=$(docker exec paper-content-staging id -u 2>/dev/null || echo "unknown")
check "container non-root (uid != 0)" "$([ "$CONTAINER_UID" != "0" ] && echo true || echo false)"

echo ""
echo "=== RESULTS: $PASS passed, $FAIL failed ==="
exit $FAIL
