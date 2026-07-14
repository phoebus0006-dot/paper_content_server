// render-orchestrator.js — Orchestrates render pipeline with shadow support
var { createRenderRequest } = require('./render-request');
var { getProfile } = require('./render-profile');
var { validate } = require('./render-result-validator');

function createRenderOrchestrator(rendererPort, validator, logger) {
  logger = logger || {};
  function render(content, profileId) {
    var profile = getProfile(profileId || 'default-v1');
    if (!profile) return Promise.reject(new Error('unknown profile'));
    var request = createRenderRequest(content, profile);
    if (!validator.validate(request)) return Promise.reject(new Error('request validation failed'));
    return rendererPort.render(request).then(function(result) {
      var v = validate(result);
      if (!v.ok) return Promise.reject(new Error('render result invalid: ' + v.errors.join('; ')));
      return result;
    });
  }
  return { render: render };
}
module.exports = { createRenderOrchestrator: createRenderOrchestrator };
