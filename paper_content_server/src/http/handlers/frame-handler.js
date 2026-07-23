'use strict';

/**
 * P0 read-only frame route handler.
 *
 *   GET /api/frame.bin  — serve the current frame (EPF1 binary)
 *
 * Behaviour must remain identical to the original inline handler:
 *   - Content-Length = 192010
 *   - EPF1 header unchanged
 *   - SHA256 hash consistent
 *
 * Dependencies (via ctx):
 *   snapshotService — SnapshotService instance
 *   now             — current Date (optional)
 */

const { sendBuffer } = require('../response');

/**
 * GET /api/frame.bin
 */
async function handleFrameBin(req, res, ctx) {
  const service = ctx.snapshotService;

  if (!service) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('SNAPSHOT_SERVICE_UNAVAILABLE');
    return;
  }

  const client = service.getClientKey(req);
  const osMode = service.getOperatingMode();
  const overrideActive = osMode === 'LEGACY_ADMIN_OVERRIDE' || osMode === 'ONE_SHOT_OVERRIDE' || osMode === 'FOCUS_LOCK';

  var frameSnap = null;

  if (!overrideActive) {
    frameSnap = await service.findPinnedSnapshot(client);
  }

  if (frameSnap) {
    sendBuffer(res, 200, frameSnap.frame, {
      'X-Frame-Id': frameSnap.frameId,
      'X-Frame-Hex-Preview': service.hexPreview(frameSnap.frame),
      'X-Pinned': '1',
      'X-Frame-Mode': frameSnap.mode,
      'X-Frame-Slot': frameSnap.payload.slotKey || frameSnap.frameId,
      'X-Frame-Sha256': service.sha256(frameSnap.frame),
    });
    return;
  }

  var activeSnap = await service.ensureActiveSnapshot(ctx.now || new Date());
  if (activeSnap) {
    sendBuffer(res, 200, activeSnap.frame, {
      'X-Frame-Id': activeSnap.frameId,
      'X-Frame-Hex-Preview': service.hexPreview(activeSnap.frame),
      'X-Frame-Mode': activeSnap.mode,
      'X-Frame-Slot': activeSnap.payload.slotKey || activeSnap.frameId,
      'X-Frame-Sha256': service.sha256(activeSnap.frame),
    });
    return;
  }

  res.writeHead(503, { 'Content-Type': 'text/plain' });
  res.end('SNAPSHOT_SERVICE_UNAVAILABLE');
}

module.exports = { handleFrameBin };
