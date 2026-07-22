#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
RESOURCES_DIR="/app/resources"

# If the data directory is empty (fresh container), seed it with defaults
if [ ! -f "$DATA_DIR/image_index.json" ]; then
  echo "Seeding $DATA_DIR with default state from resources..."
  if [ -d "$RESOURCES_DIR/default-state" ]; then
    cp -r "$RESOURCES_DIR/default-state/"* "$DATA_DIR/" 2>/dev/null || true
  fi
fi

# Ensure fallback study files are available in data directory
if [ ! -d "$DATA_DIR/fallback_study" ] && [ -d "$RESOURCES_DIR/fallback-study" ]; then
  mkdir -p "$DATA_DIR/fallback_study"
  cp -r "$RESOURCES_DIR/fallback-study/"* "$DATA_DIR/fallback_study/" 2>/dev/null || true
fi

exec "$@"
