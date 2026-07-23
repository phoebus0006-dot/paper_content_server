'use strict';

/**
 * P0 read-only state route handler.
 *
 *   GET /api/state.json  — current active snapshot state
 *
 * Behaviour must remain identical to the original inline handler.
 */

const { sendJson, sendError } = require('../response');

/**
 * GET /api/state.json
 *
 * Expects ctx.R (runtime) with:
 *   publicationService, pinStore, operatingModeService,
 *   panelIndex, and req's Host header for building the frameUrl.
 */
async function handleStateJson(req, res, ctx) {
  const R = ctx.R;
  const panelIndex = ctx.panelIndex;

  if (!R.publicationService) {
    sendError(res, 503, 'SNAPSHOT_SERVICE_UNAVAILABLE');
    return;
  }

  const now = ctx.now || new Date();
  var activeSnap = await ensureActiveSnapshot(now, R);

  const client = clientKey(req);
  R.pinStore.pin(client, activeSnap.snapshotId);

  const host = req.headers.host || 'localhost';
  const frameUrl = `http://${host}/api/frame.bin?panel=${panelIndex}`;

  const body = {
    ...activeSnap.payload,
    snapshotId: activeSnap.snapshotId,
    panelIndex: panelIndex,
    operatingMode: R.operatingModeService ? R.operatingModeService.getMode() : 'AUTO',
    frameUrl: frameUrl,
    frameSha256: activeSnap.frameSha256,
    frameLength: activeSnap.frameLength,
  };

  sendJson(res, 200, body);
}

// ── Helpers (copied from server.js to preserve exact behaviour) ────────────

function clientKey(req) {
  return req.socket.remoteAddress || 'unknown';
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

module.exports = { handleStateJson };
