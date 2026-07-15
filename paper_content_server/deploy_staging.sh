#!/usr/bin/env bash
set -e

echo "Building and deploying to NAS..."

# 1. Archive current git HEAD
git archive -o deploy.tar HEAD

# 2. Upload to NAS
scp deploy.tar fn-nas:~/staging/build/deploy.tar

# 3. Build and Restart on NAS
ssh fn-nas "
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
    --env-file /home/phoebus/staging/staging.env \
    -v /home/phoebus/staging/data:/app/data \
    -v /home/phoebus/staging/images:/app/images \
    paper-content-server:admin-sync-v2
"

echo "Deployed!"
