// legacy-render-adapter.js — Wraps existing server.js render functions
var path = require('path');
function createLegacyRenderAdapter(serverMod, epaperImageFrame, epaperEpf1, ditheringEnabled) {
  function render(request) {
    var content = request.content;
    var profile = request.profile;
    if (!content || !profile) return Promise.reject(new Error('invalid render request'));
    try {
      var svg = serverMod.renderNewsSvg(content, new Date());
      var frameBuffer = epaperImageFrame.buildFrameBuffer(epaperImageFrame.imageToFrameBuffer(svg, profile.width, profile.height, 4, ditheringEnabled));
      return Promise.resolve({ frame: frameBuffer, width: profile.width, height: profile.height, profileId: profile.profileId });
    } catch(e) { return Promise.reject(e); }
  }
  return { name: 'legacy-adapter', render: render };
}
module.exports = { createLegacyRenderAdapter: createLegacyRenderAdapter };
