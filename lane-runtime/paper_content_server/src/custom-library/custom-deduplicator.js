// custom-deduplicator.js — SHA256-based dedup
function createDeduplicator(assetRepository) {
  function isDuplicate(sha256) {
    if (!sha256 || !assetRepository) return Promise.resolve(false);
    return assetRepository.list({ sha256: sha256 }).then(function(assets) { return assets.length > 0; });
  }
  return { isDuplicate: isDuplicate };
}
module.exports = { createDeduplicator: createDeduplicator };