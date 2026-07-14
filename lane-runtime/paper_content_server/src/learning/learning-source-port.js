// learning-source-port.js — Source port interface for external image sources
function createSourcePort(config) {
  return {
    name: config.name || 'unknown',
    fetchCandidates: function() { return Promise.resolve([]); },
    isEnabled: function() { return false; },
  };
}
module.exports = { createSourcePort: createSourcePort };
