// learning-ingestion-service.js — Orchestrates source → candidate → validated → asset
var { createCandidate } = require('./learning-candidate-model');

function createIngestionService(sourceRegistry, validator, deduplicator, policy, assetRepository, logger) {
  logger = logger || {};
  function ingestAll() {
    return sourceRegistry.fetchAll().then(function(candidateLists) {
      var all = candidateLists.reduce(function(a,b){return a.concat(b);}, []);
      return Promise.all(all.map(function(c) { return ingestOne(c); }));
    });
  }
  function ingestOne(raw) {
    var candidate = createCandidate(raw);
    if (!validator.validate(candidate)) return Promise.resolve({ candidateId: candidate.candidateId, status: 'REJECTED', reason: 'validation failed' });
    if (deduplicator.isDuplicate(candidate)) return Promise.resolve({ candidateId: candidate.candidateId, status: 'DUPLICATE' });
    if (!policy.isAllowed(candidate)) return Promise.resolve({ candidateId: candidate.candidateId, status: 'POLICY_BLOCKED' });
    return Promise.resolve({ candidateId: candidate.candidateId, status: 'ACCEPTED' });
  }
  return { ingestAll: ingestAll, ingestOne: ingestOne };
}
module.exports = { createIngestionService: createIngestionService };
