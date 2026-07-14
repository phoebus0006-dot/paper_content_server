// render-profile.js — Render profiles (default matches current production)
var DEFAULT_PROFILE = {
  profileId: 'default-v1',
  width: 800,
  height: 480,
  panel: 49,
  contentType: 'news',
  layoutVariant: 'standard',
  dithering: false,
  metadata: {},
};
function getProfile(profileId) {
  if (profileId === 'default-v1') return { ...DEFAULT_PROFILE };
  return null;
}
module.exports = { DEFAULT_PROFILE, getProfile };
