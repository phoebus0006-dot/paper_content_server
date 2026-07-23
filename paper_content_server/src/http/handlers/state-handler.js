'use strict';

/**
 * P0 read-only state route handler.
 *
 *   GET /api/state.json  — current active snapshot state
 *
 * Behaviour must remain identical to the original inline handler.
 *
 * Dependencies (via ctx):
 *   snapshotService — SnapshotService instance
 *   panelIndex      — resolved panel index
 *   now             — current Date (optional)
 */

const { sendJson, sendError } = require('../response');

/**
 * GET /api/state.json
 */
async function handleStateJson(req, res, ctx) {
  const service = ctx.snapshotService;
  const panelIndex = ctx.panelIndex;

  if (!service) {
    sendError(res, 503, 'SNAPSHOT_SERVICE_UNAVAILABLE');
    return;
  }

  const now = ctx.now || new Date();
  var activeSnap = await service.ensureActiveSnapshot(now);

  if (!activeSnap) {
    sendError(res, 503, 'SNAPSHOT_SERVICE_UNAVAILABLE');
    return;
  }

  const client = service.getClientKey(req);
  service.pinClient(client, activeSnap.snapshotId);

  const host = req.headers.host || 'localhost';
  const frameUrl = `http://${host}/api/frame.bin?panel=${panelIndex}`;

  const body = {
    ...activeSnap.payload,
    snapshotId: activeSnap.snapshotId,
    panelIndex: panelIndex,
    operatingMode: service.getOperatingMode(),
    frameUrl: frameUrl,
    frameSha256: activeSnap.frameSha256,
    frameLength: activeSnap.frameLength,
  };

  sendJson(res, 200, body);
}

module.exports = { handleStateJson };
