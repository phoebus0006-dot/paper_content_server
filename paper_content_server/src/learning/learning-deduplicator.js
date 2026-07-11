// learning-deduplicator.js — Dedup by sha256 or sourceUrl
function createDeduplicator(assetRepository) {
  var seen = {};
  function isDuplicate(candidate) {
    if (candidate.sha256 && seen[candidate.sha256]) return true;
    if (candidate.sourceUrl && seen[candidate.sourceUrl]) return true;
    if (candidate.sha256) seen[candidate.sha256] = true;
    if (candidate.sourceUrl) seen[candidate.sourceUrl] = true;
    return false;
  }
  return { isDuplicate: isDuplicate };
}
module.exports = { createDeduplicator: createDeduplicator };
