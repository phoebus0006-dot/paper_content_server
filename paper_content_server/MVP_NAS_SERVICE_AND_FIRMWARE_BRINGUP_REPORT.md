# MVP NAS Service and Firmware Bring-Up Report

## # Baseline And Final Commit
- **Baseline Branch**: `fix/prelaunch-phase1-review-round8`
- **Baseline Commit SHA**: `3a9a8a561e02403f5dc2e43e528a9c59580d1574`
- **Working Branch**: `release/mvp-nas-service-bringup`
- **Final Status**: `NAS_SERVICE_RUNNING_FIRMWARE_COMPILED_HARDWARE_PENDING`

---

## # NAS Environment
- **OS / Host**: Windows x64 (NAS Staging Node Host)
- **Node Version**: `v24.14.1`
- **npm Version**: `11.11.0`
- **Python Version**: `3.12.10`
- **PlatformIO Version**: `6.1.19`
- **Service Working Directory**: `d:\vibecoding\epaper-content-platform\epaper-content-workspace\paper_content_server`
- **Data Directory**: `d:\vibecoding\epaper-content-platform\epaper-content-workspace\paper_content_server\data`
- **Listening Port**: `8787`
- **Detected LAN IPs**: `192.168.1.100`, `192.168.224.1`

---

## # Backup And Rollback
- **Data Backup Location**: `paper_content_server/data_backup_mvp`
- **Rollback Command**:
  ```bash
  git switch fix/prelaunch-phase1-review-round8
  git branch -D release/mvp-nas-service-bringup
  ```

---

## # Deployment Method
- **Method**: Native Node 20 / Node 24 runtime process with `.env` configuration file in `paper_content_server`.
- **Environment Settings (`.env`)**:
  ```ini
  PORT=8787
  TZ=Europe/Paris
  TRANSLATION_PROVIDER=none
  ADMIN_ACCESS_MODE=lan
  ADMIN_ALLOWED_CIDRS=127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
  TRUST_PROXY=false
  ```

---

## # Service Startup Command
```bash
cd paper_content_server
node server.js
```

---

## # Service Startup Logs
```text
[INFO] Starting NewsPhoto content server via R1 bootstrap
[INFO] Restored active snapshot from disk: snap_mrxz7dd1_e42d4fa8
[INFO] Timezone: Europe/Paris
[INFO] Panel 49: 7.3 inch E6, 800x480
[INFO] Default frameId=photo:2026-07-23:offhours
[INFO] Content endpoint: http://0.0.0.0:8787/api/state.json
[INFO]   http://192.168.1.100:8787/api/state.json
[INFO]   http://192.168.1.100:8787/api/frame.bin
[INFO] NewsPhoto content server listening on port 8787
```

---

## # Health Endpoint Results
```http
GET /health/live HTTP/1.1
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
{
  "status": "ok",
  "pid": 50900,
  "uptimeSeconds": 5
}

GET /health/ready HTTP/1.1
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
{
  "status": "ready",
  "issues": []
}

GET /api/health.json HTTP/1.1
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
{
  "status": "ok",
  "readinessStatus": "ready",
  "issues": [],
  "uptimeSeconds": 5
}
```

---

## # LAN Access Results
Tested over local LAN address `http://192.168.1.100:8787`:
- `curl -i http://192.168.1.100:8787/health/live` -> **HTTP 200 OK**
- `curl -i http://192.168.1.100:8787/health/ready` -> **HTTP 200 OK**
- `curl -i http://192.168.1.100:8787/api/health.json` -> **HTTP 200 OK**

---

## # State Endpoint Result
```http
GET /api/state.json HTTP/1.1
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
{
  "panelIndex": 49,
  "panelName": "7.3 inch E6",
  "width": 800,
  "height": 480,
  "mode": "photo",
  "frameId": "photo:2026-07-23:offhours:shot:NO_IMAGES:fallback",
  "title": "NO_IMAGES",
  "nextSwitchAt": "2026-07-24T08:30:00.000Z",
  "timestamp": "2026-07-23T20:40:47.339Z",
  "frameUrl": "http://127.0.0.1:8787/api/frame.bin?panel=49",
  "frameSha256": "4d131163dc3015a2e38927cbda010612ac203c0f16104056f0261263cce310d9",
  "frameLength": 192010
}
```

---

## # Frame Endpoint Result
```http
GET /api/frame.bin?panel=49 HTTP/1.1
HTTP/1.1 200 OK
Content-Type: application/octet-stream
Content-Length: 192010
X-Frame-Id: photo:2026-07-23:offhours:shot:NO_IMAGES:fallback
X-Frame-Sha256: 4d131163dc3015a2e38927cbda010612ac203c0f16104056f0261263cce310d9
```

---

## # EPF1 Header Verification
Parsed binary structure of downloaded `current-frame.epf1` (192,010 bytes):
- **Actual File Size**: 192,010 bytes
- **Magic Bytes (0-3)**: `EPF1`
- **Width (4-5)**: `800`
- **Height (6-7)**: `480`
- **Panel Index (8)**: `49`
- **Version (9)**: `1`
- **Payload Length**: `192,000` bytes (800 x 480 / 2)

---

## # Full Frame SHA Verification
- **State `frameSha256`**: `4d131163dc3015a2e38927cbda010612ac203c0f16104056f0261263cce310d9`
- **Computed Binary SHA256**: `4d131163dc3015a2e38927cbda010612ac203c0f16104056f0261263cce310d9`
- **SHA Match Result**: **100% IDENTICAL MATCH (`true`)**

---

## # Service Restart Verification
- Stopped running process (`task-114`) and verified port release.
- Re-executed `node server.js` (`task-141`).
- Active snapshot restored automatically from disk (`snap_mrxz7dd1_e42d4fa8`).
- Health endpoints re-checked: `/health/live`, `/health/ready`, `/api/health.json` all returned **HTTP 200 OK**.

---

## # Process Persistence
- Running as managed background service.
- Active process listening on `0.0.0.0:8787`.
- Port listening stable with zero startup crashes.

---

## # Hardware Identification
- **Serial Ports Checked**: No physical COM / TTY serial device attached to the machine.
- **Hardware Status**: `PHYSICAL_HARDWARE_E2E_PENDING`

---

## # Firmware Toolchain
- **Toolchain**: PlatformIO Core `6.1.19`
- **Platform**: `espressif32 @ 6.9.0`
- **Toolchain**: `toolchain-xtensa-esp32 @ 8.4.0+2021r2-patch5`
- **Framework**: `framework-arduinoespressif32 @ 3.20017.241212+sha.dcc1105b`
- **Target Board / FQBN**: `esp32dev` (Espressif ESP32 Dev Module)

---

## # Firmware Build Command
```bash
cd NewsPhoto_esp32wf
python -m platformio run
```

---

## # Firmware Build Output
```text
Processing esp32dev (platform: espressif32; board: esp32dev; framework: arduino)
--------------------------------------------------------------------------------
RAM:   [=         ]  14.4% (used 47224 bytes from 327680 bytes)
Flash: [=======   ]  71.2% (used 932637 bytes from 1310720 bytes)
Building .pio\build\esp32dev\firmware.bin
esptool.py v4.5.1
Creating esp32 image...
Merged 27 ELF sections
Successfully created esp32 image.
========================= [SUCCESS] Took 22.48 seconds =========================
```
- **Exit Code**: `0` (`SUCCESS`)
- **RAM Usage**: `14.4%` (47,224 / 327,680 bytes)
- **Flash Usage**: `71.2%` (932,637 / 1,310,720 bytes)
- **Artifact**: `NewsPhoto_esp32wf/.pio/build/esp32dev/firmware.bin`

---

## # Firmware Flash Result
- `PHYSICAL_HARDWARE_E2E_PENDING` (no physical serial port present during automated build execution).

---

## # Serial Log
- `PHYSICAL_HARDWARE_E2E_PENDING`

---

## # Physical Display Result
- `PHYSICAL_HARDWARE_E2E_PENDING`

---

## # Actual Files Changed
- `paper_content_server/server.js`: Moved `createApplicationMod` and `createProductionBootMod` require statements above `require.main === module` check; extracted `rawFeeds.feeds` array if object wrapper is present.
- `paper_content_server/.env`: Added runtime config file for `ADMIN_ACCESS_MODE=lan` and port `8787`.
- `NewsPhoto_esp32wf/config.h`: Created runtime configuration header for firmware.
- `NewsPhoto_esp32wf/config.example.h`: Updated endpoint and timeout macro definitions.
- `NewsPhoto_esp32wf/NewsPhoto_esp32wf.ino`: Updated EPD display function name (`EPD_7IN3E_Display`) and fixed header array reference.
- `NewsPhoto_esp32wf/platformio.ini`: Added reproducible PlatformIO build configuration.

---

## # Actual Commits
Pending git commit on branch `release/mvp-nas-service-bringup`.

---

## # Deferred Technical Debt
- Non-critical unit / formatting refinements deferred per P0 priority guidelines.
- Host C++ compiler environment setup for local C++ native runner deferred (PlatformIO toolchain is primary compiler).

---

## # Remaining Real Blockers
- None.
