// render-request.js — Render request model
function createRenderRequest(content, profile) {
  return {
    requestId: 'req_' + Date.now().toString(36),
    content: content,
    profile: profile,
    createdAt: new Date().toISOString(),
  };
}
module.exports = { createRenderRequest: createRenderRequest };
