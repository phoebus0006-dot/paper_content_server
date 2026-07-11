#!/bin/bash
# backup.sh — Backup staging data before deployment
set -euo pipefail

BACKUP_DIR="/volume1/docker/paper-content-staging/backups"
DATA_DIR="/volume1/docker/paper-content-staging/data"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/data_$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

if [ -d "$DATA_DIR" ] && [ "$(ls -A "$DATA_DIR" 2>/dev/null)" ]; then
  tar -czf "$BACKUP_PATH" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"
  echo "OK: backup created at $BACKUP_PATH"
  echo "SIZE: $(du -h "$BACKUP_PATH" | cut -f1)"
else
  echo "INFO: no existing data to backup"
fi

# Keep last 5 backups
ls -t "$BACKUP_DIR"/data_*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm
echo "INFO: pruned old backups (kept last 5)"
