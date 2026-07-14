// legacy-render-adapter.js — Uses real production SVG rasterization path
var path = require('path');
function createLegacyRenderAdapter(serverMod, epaperImageFrame, ditheringEnabled, clock) {
  clock = clock || { now: function() { return new Date(); } };
  function render(request) {
    var content = request.content;
    var profile = request.profile;
    if (!content || !profile) return Promise.reject(new Error('invalid render request'));
    try {
      var svg = serverMod.renderNewsSvg(content, clock.now());
      var sharp = require('sharp');
      return sharp(svg).resize(profile.width, profile.height, { fit: 'fill' }).flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true }).then(function(raw) {
        var frameImage = epaperImageFrame.imageToFrameBuffer(raw.data, raw.info.width, raw.info.height, raw.info.channels, ditheringEnabled);
        var frame = epaperImageFrame.buildFrameBuffer(frameImage);
        return { frame: frame, width: profile.width, height: profile.height, profileId: profile.profileId };
      });
    } catch(e) { return Promise.reject(e); }
  }
  return { name: 'legacy-adapter', render: render };
}
module.exports = { createLegacyRenderAdapter: createLegacyRenderAdapter };
