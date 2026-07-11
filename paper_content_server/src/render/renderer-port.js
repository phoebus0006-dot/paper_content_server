// renderer-port.js — Renderer port interface
function createRendererPort() {
  return { name: 'legacy', render: function(req) { return Promise.reject(new Error('not implemented')); } };
}
module.exports = { createRendererPort: createRendererPort };
