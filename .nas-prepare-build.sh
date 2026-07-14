#!/bin/bash
set -e
cd /home/phoebus/staging
# Extract fresh source from HEAD tarball
rm -rf paper-content-truth-repair
mkdir -p paper-content-truth-repair
tar -xzf paper-content-truth-repair-2ebbfd7.tar.gz -C paper-content-truth-repair
SRC_DIR=/home/phoebus/staging/paper-content-truth-repair/paper-content-source/paper_content_server
echo "SRC_DIR=$SRC_DIR"
ls -la "$SRC_DIR" | head -20
# Confirm the new admin.js has the fix
echo "---ADMIN_JS_FIX_CHECK---"
grep -c 'bindGuard\|safeBind\|page-error\|pageError' "$SRC_DIR/public/admin/admin.js" || echo "NO FIX FOUND"
grep -c 'safeBind\|bindGuard' "$SRC_DIR/public/admin/admin.js" || echo "safeBind NOT in admin.js"
echo "---BUILD_IMAGE---"
cd "$SRC_DIR"
DOCKER_BUILD_NETWORK=host bash deploy/nas/build-staging.sh 2ebbfd7676b5 5a390a94393e4430bb65b3daadc38277082be965
