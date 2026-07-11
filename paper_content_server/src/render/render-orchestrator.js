// render-orchestrator.js — Orchestrates render pipeline
var { createRenderRequest } = require('./render-request');
var { getProfile } = require('./render-profile');
function createRenderOrchestrator(rendererPort, validator, logger) {
  logger = logger || {};
  function render(content, profileId) {
    var profile = getProfile(profileId || 'default-v1');
    if (!profile) return Promise.reject(new Error('unknown profile: ' + profileId));
    var request = createRenderRequest(content, profile);
    if (!validator.validate(request)) return Promise.reject(new Error('render validation failed'));
    return rendererPort.render(request).then(function(result) {
      if (!validator.validateResult(result)) return Promise.reject(new Error('render result invalid'));
      return result;
    });
  }
  return { render: render };
}
module.exports = { createRenderOrchestrator: createRenderOrchestrator };
