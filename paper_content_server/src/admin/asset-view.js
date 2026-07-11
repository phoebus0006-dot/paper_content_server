// asset-view.js — Asset response builder (no file bytes)
function buildAssetView(asset) {
  if (!asset) return null;
  return { assetId: asset.assetId, libraryType: asset.libraryType, sourceType: asset.sourceType, safetyStatus: asset.safetyStatus, lifecycleStatus: asset.lifecycleStatus, sha256: asset.sha256, mimeType: asset.mimeType, width: asset.width, height: asset.height, createdAt: asset.createdAt, updatedAt: asset.updatedAt };
}
function buildAssetList(assets) {
  return (assets || []).map(buildAssetView);
}
module.exports = { buildAssetView: buildAssetView, buildAssetList: buildAssetList };
