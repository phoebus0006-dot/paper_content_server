// learning-deduplicator.js — Dedup with auto-commit in isDuplicate (safe for both test and production)
function createDeduplicator() {
  var committed = {};
  function isDuplicate(candidate) {
    if (!candidate) return false;
    if (candidate.sha256 && committed[candidate.sha256]) return true;
    if (candidate.sourceUrl && committed[candidate.sourceUrl]) return true;
    // Auto-commit on first sight for transactional dedup
    if (candidate.sha256) committed[candidate.sha256] = true;
    if (candidate.sourceUrl) committed[candidate.sourceUrl] = true;
    return false;
  }
  function commit(candidate) {
    if (!candidate) return;
    if (candidate.sha256) committed[candidate.sha256] = true;
    if (candidate.sourceUrl) committed[candidate.sourceUrl] = true;
  }
  return { isDuplicate: isDuplicate, commit: commit };
}
module.exports = { createDeduplicator: createDeduplicator };
