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
 */

const crypto = require('crypto');
const { sendBuffer } = require('../response');
const epaperEpf1 = require('../../epaper/epf1');

/**
 * GET /api/frame.bin
 *
 * Expects ctx with:
 *   R      — runtime (publicationService, pinStore, operatingModeService, snapshotCache)
 *   panelIndex — resolved panel index
 */
async function handleFrameBin(req, res, ctx) {
  const R = ctx.R;
  const client = clientKey(req);

  if (!R.publicationService) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('SNAPSHOT_SERVICE_UNAVAILABLE');
    return;
  }

  var osMode2 = R.operatingModeService ? R.operatingModeService.getMode() : 'AUTO';
  var overrideActive = osMode2 === 'LEGACY_ADMIN_OVERRIDE' || osMode2 === 'ONE_SHOT_OVERRIDE' || osMode2 === 'FOCUS_LOCK';

  var frameSnap = null;

  if (!overrideActive) {
    var pinnedId = R.pinStore.get(client);
    if (pinnedId) {
      frameSnap = R.snapshotCache.get(pinnedId);
      if (!frameSnap) frameSnap = await R.publicationService.loadSnapshot(pinnedId);
    }
  }

  if (frameSnap) {
    var fSha = crypto.createHash('sha256').update(frameSnap.frame).digest('hex');
    sendBuffer(res, 200, frameSnap.frame, {
      'X-Frame-Id': frameSnap.frameId,
      'X-Frame-Hex-Preview': hexPreview(frameSnap.frame),
      'X-Pinned': '1',
      'X-Frame-Mode': frameSnap.mode,
      'X-Frame-Slot': frameSnap.payload.slotKey || frameSnap.frameId,
      'X-Frame-Sha256': fSha,
    });
    return;
  }

  var activeSnap = await ensureActiveSnapshot(ctx.now || new Date(), R);
  if (activeSnap) {
    var aSha = crypto.createHash('sha256').update(activeSnap.frame).digest('hex');
    sendBuffer(res, 200, activeSnap.frame, {
      'X-Frame-Id': activeSnap.frameId,
      'X-Frame-Hex-Preview': hexPreview(activeSnap.frame),
      'X-Frame-Mode': activeSnap.mode,
      'X-Frame-Slot': activeSnap.payload.slotKey || activeSnap.frameId,
      'X-Frame-Sha256': aSha,
    });
    return;
  }

  res.writeHead(503, { 'Content-Type': 'text/plain' });
  res.end('SNAPSHOT_SERVICE_UNAVAILABLE');
}

// ── Helpers ───────────────────────────────────────────────────────────────

function clientKey(req) {
  return req.socket.remoteAddress || 'unknown';
}

function hexPreview(buf, bytes) {
  return epaperEpf1.hexPreview(buf, bytes || 32);
}

async function ensureActiveSnapshot(now, R) {
  if (!R.publicationService) return null;

  if (R.operatingModeService) {
    var osMode = R.operatingModeService.getMode();
    if (osMode === 'ONE_SHOT_OVERRIDE') {
      if (R.operatingModeService.checkExpiry(now)) {
        R.operatingModeService.exitOneShot();
        if (R.overridePersistence) {
          try { R.overridePersistence.clearOverride(); } catch (e) { /* ignore */ }
        }
      } else {
        return await R.publicationService.getActive();
      }
    } else if (osMode === 'FOCUS_LOCK' || osMode === 'LEGACY_ADMIN_OVERRIDE') {
      return await R.publicationService.getActive();
    }
  }

  return await R.publicationService.getActive();
}

module.exports = { handleFrameBin };
