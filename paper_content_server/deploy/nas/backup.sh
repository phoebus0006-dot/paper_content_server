#!/bin/bash
# backup.sh — Backup staging data before deployment
#
# Paths are configurable via environment variables. Defaults assume
# STAGING_ROOT=/home/phoebus/staging (overridable).
set -euo pipefail

STAGING_ROOT="${STAGING_ROOT:-/home/phoebus/staging}"
DATA_DIR="${DATA_DIR:-$STAGING_ROOT/data}"
BACKUP_DIR="${BACKUP_DIR:-$STAGING_ROOT/backups}"

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
