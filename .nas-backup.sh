#!/bin/bash
set -e
TS=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/home/phoebus/staging/backups/pre-truth-repair-${TS}
mkdir -p "${BACKUP_DIR}"
cp -r /home/phoebus/staging/data "${BACKUP_DIR}/data"
cp -r /home/phoebus/staging/images "${BACKUP_DIR}/images" 2>/dev/null || true
cp /home/phoebus/staging/staging.env "${BACKUP_DIR}/staging.env" 2>/dev/null || true
echo "BACKUP_DONE=${BACKUP_DIR}"
ls -la "${BACKUP_DIR}"
du -sh "${BACKUP_DIR}"
