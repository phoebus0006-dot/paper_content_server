#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

NAS_HOST="${NAS_HOST:?Please set NAS_HOST}"
NAS_USER="${NAS_USER:-phoebus}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"

echo "Building and deploying to NAS ($NAS_USER@$NAS_HOST)..."

# 1. Archive current git HEAD
git archive -o deploy.tar HEAD

# 2. Upload to NAS
scp -i "$SSH_KEY" deploy.tar "$NAS_USER@$NAS_HOST:~/staging/build/deploy.tar"

# 3. Build and Restart on NAS
ssh -i "$SSH_KEY" "$NAS_USER@$NAS_HOST" "
  cd ~/staging/build
  tar -xf deploy.tar

  # Build new image
  docker build --network host -t paper-content-server:admin-sync-v2 .

  # Stop and remove old container
  docker stop paper-content-staging || true
  docker rm paper-content-staging || true

  # Run new container with EXACT mounts and envs from previous inspect
  docker run -d \
    --name paper-content-staging \
    -p 18080:8787 \
    --env-file /home/$NAS_USER/staging/staging.env \
    -v /home/$NAS_USER/staging/data:/app/data \
    -v /home/$NAS_USER/staging/images:/app/images \
    paper-content-server:admin-sync-v2
"

echo "Deployed!"
