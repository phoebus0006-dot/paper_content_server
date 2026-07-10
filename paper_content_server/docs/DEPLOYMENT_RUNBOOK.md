# Deployment Runbook

## Target

NAS (fn-nas, 192.168.1.49)
Directory: /vol1/docker/paper-frame-server/
Deployment mode: Docker bind mount

## Files

Bind-mounted (read-only for code, read-write for data):

| Host Path | Container Path | Mode |
|-----------|---------------|------|
| ./server.js | /app/server.js | ro |
| ./package.json | /app/package.json | ro |
| ./feeds.json | /app/feeds.json | ro |
| ./scripts/ | /app/scripts/ | ro |
| ./config.json | /app/config.json | ro |
| ./.env | /app/.env | ro |
| ./node_modules/ | /app/node_modules/ | ro |
| ./data/ | /app/data/ | rw |
| ./images/ | /app/images/ | rw |

## Procedure

1. Backup files on NAS: `cp server.js backup_<timestamp>/`
2. SCP updated files to NAS
3. `docker restart paper-frame-server`
4. Verify: `sha256sum /app/server.js` matches local
5. Test: HTTP endpoints return 200, frame size = 192010, code 4 = 0

## Rollback

1. Copy from `backup_<ts>/` to working directory
2. `docker restart paper-frame-server`
3. Verify

## Verification

- `curl http://<host>:8787/api/state.json`
- `curl http://<host>:8787/api/frame.bin -o /tmp/frame.bin`
- `curl http://<host>:8787/api/news.json`
- Check frame size: 192010
- Check code 4: 0
- News count: 6, no placeholders, no duplicates
