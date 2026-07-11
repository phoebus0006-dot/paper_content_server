// render-request.js — Deterministic render request (no Date.now in core identity)
var crypto = require('crypto');
function createRenderRequest(content, profile, requestId) {
  var id = requestId || ('req_' + crypto.randomBytes(6).toString('hex'));
  return { requestId: id, content: content, profile: profile, createdAt: new Date().toISOString() };
}
module.exports = { createRenderRequest: createRenderRequest };
